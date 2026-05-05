/**
 * Render V2 Pipeline Module - FFmpeg filter graphs, copy-path optimization, render execution
 * 
 * This module contains the core rendering pipeline logic:
 * - buildRenderV2FilterGraph: Complex FFmpeg filter graph construction
 * - checkCopyPathEligibility: Stream copy fast-path detection
 * - buildRenderV2FfmpegArgs: FFmpeg argument builder
 * - Render signature and fingerprint utilities
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import * as os from 'os';
import { spawn } from 'child_process';
import { RenderConfigV2, RenderItemV2, BlurRegionEffect } from '../../shared/types.js';
import {
  parseResolution,
  resolveRenderInputPath,
  escapeFilterPath,
  ensureCircleMaskPgm,
  ensureFeatherMaskPgm,
  measureAudioLufs,
  clampRender,
  parseBlurRegionEffects,
  BLUR_FEATHER_MAX,
  STATIC_MASK_LOOP_FILTER
} from './render.js';
import { runFfprobe } from './ffprobe.js';
import { getDurationSeconds, resolveSafePath } from './vault.js';
import { buildAssDocument, parseAssRenderStyle, writeStyledAssFile } from '../subtitleAss.js';

// ─── Constants ────────────────────────────────────────────────────────

export const INPUT_SEEK_PREROLL_SECONDS = 1;
export const MAX_LUFS_MEASURE_SECONDS = 120;
export const LUFS_UNRELIABLE_FLOOR = -60;

// ─── Types ────────────────────────────────────────────────────────────

export type BuildFilterGraphOptions = {
  includeAudio?: boolean;
  outputStart?: number;
  outputDuration?: number;
  allowShortDuration?: boolean;
  sampleAt?: number;
  debugEnabled?: boolean;
  debugLabel?: string;
  onLog?: (chunk: string) => void;
  ffmpegPath?: string;
  lufsCache?: Map<string, number>;
};

export type FilterGraphResult = {
  inputArgs: string[];
  inputEntries: Array<{
    type: RenderItemV2['type'];
    args: string[];
    item: RenderItemV2;
    timing?: { start: number; duration: number; trimStart: number };
  }>;
  filterComplex: string | null;
  videoLabel: string | null;
  audioMap: string[];
  outputDuration: number;
  framerate: number;
};

export type CopyPathResult =
  | { mode: 'full'; videoPath: string; duration: number; audioFromVideo: boolean; audioPath?: string }
  | { mode: 'hybrid'; videoPath: string; duration: number; activeAudioSourceCount: number }
  | { mode: 'none'; reason: string };

export type RenderInputFingerprint = {
  resolvedPath: string;
  size: number;
  mtimeMs: number;
};

// ─── Utility Functions ─────────────────────────────────────────────────

export const formatArg = (value: string) => (/[^\w@%+=:,./-]/.test(value) ? JSON.stringify(value) : value);

export const escapeConcatFilePath = (value: string) => value.replace(/'/g, `'\\''`);

export const parseFfmpegProgressSeconds = (text: string) => {
  const match = text.match(/time=\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  const s = Number(match[3]);
  if (!Number.isFinite(h) || !Number.isFinite(m) || !Number.isFinite(s)) return null;
  return h * 3600 + m * 60 + s;
};

/** libass: avoid charenc on UTF-8 ASS; original_size should match PlayRes for correct placement when video is scaled. */
export const buildSubtitlesVideoFilter = (subtitlePath: string, assOriginalSize?: { w: number; h: number }) => {
  const escaped = escapeFilterPath(subtitlePath);
  const lower = subtitlePath.toLowerCase();
  const isAss = lower.endsWith('.ass') || lower.endsWith('.ssa');
  if (assOriginalSize) {
    return `subtitles='${escaped}':original_size=${assOriginalSize.w}x${assOriginalSize.h}${isAss ? ':charenc=UTF-8' : ''}`;
  }
  return `subtitles='${escaped}'${isAss ? ':charenc=UTF-8' : ''}`;
};

// ─── Fingerprint & Signature ──────────────────────────────────────────

export const buildRenderInputFingerprints = async (
  config: RenderConfigV2,
  vaultRoot: string
): Promise<{ fingerprints: RenderInputFingerprint[]; missing: string[] }> => {
  const sourceItems = config.items.filter(item => (
    item.type === 'video'
    || item.type === 'audio'
    || item.type === 'image'
    || item.type === 'subtitle'
  ));
  const fingerprints: RenderInputFingerprint[] = [];
  const missing: string[] = [];
  const seen = new Set<string>();
  for (const item of sourceItems) {
    const pathFromRef = resolveRenderInputPath(item.source?.ref, config.inputsMap);
    const sourcePath = pathFromRef ?? (item.source?.path ? resolveSafePath(item.source.path, vaultRoot) : null);
    if (!sourcePath) {
      missing.push(`${item.id}:${item.source?.ref ?? item.source?.path ?? ''}`);
      continue;
    }
    if (seen.has(sourcePath)) continue;
    seen.add(sourcePath);
    try {
      const stats = await fs.stat(sourcePath);
      fingerprints.push({
        resolvedPath: sourcePath,
        size: Number(stats.size),
        mtimeMs: Math.round(Number(stats.mtimeMs))
      });
    } catch {
      missing.push(`${item.id}:${sourcePath}`);
    }
  }
  fingerprints.sort((a, b) => a.resolvedPath.localeCompare(b.resolvedPath));
  missing.sort((a, b) => a.localeCompare(b));
  return { fingerprints, missing };
};

export const buildRenderV2Signature = async (
  config: RenderConfigV2,
  vaultRoot: string,
  segmentSeconds: number
): Promise<{ signature: string; payload: object }> => {
  const inputFingerprints = await buildRenderInputFingerprints(config, vaultRoot);
  const payload = {
    version: 1,
    segmentSeconds,
    inputs: inputFingerprints,
    config
  };
  const signature = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 20);
  return { signature, payload };
};

export const isReusableRenderSegment = async (segmentPath: string, expectedDuration: number): Promise<boolean> => {
  try {
    const stats = await fs.stat(segmentPath);
    if (!stats.isFile() || stats.size <= 0) return false;
    const duration = await runFfprobe(segmentPath).catch(() => 0);
    if (!Number.isFinite(duration) || duration <= 0) return false;
    const tolerance = Math.max(0.5, expectedDuration * 0.03);
    return Math.abs(duration - expectedDuration) <= tolerance;
  } catch {
    return false;
  }
};

// ─── FFmpeg Command Runner ────────────────────────────────────────────

export const runFfmpegLoggedCommand = async (
  ffmpegPath: string,
  args: string[],
  label: string,
  onLog?: (chunk: string) => void,
  onSpawn?: (proc: ReturnType<typeof spawn>) => void,
  onProgressSeconds?: (seconds: number) => void
): Promise<void> => {
  const commandLine = [ffmpegPath, ...args].map(formatArg).join(' ');
  onLog?.(`COMMAND (${label}): ${commandLine}\n`);
  let lastProgressSeconds = 0;
  await new Promise<void>((resolve, reject) => {
    const proc = spawn(ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    onSpawn?.(proc);
    proc.stdout.on('data', data => onLog?.(data.toString()));
    proc.stderr.on('data', data => {
      const text = data.toString();
      onLog?.(text);
      if (!onProgressSeconds) return;
      const seconds = parseFfmpegProgressSeconds(text);
      if (seconds === null) return;
      if (seconds <= lastProgressSeconds) return;
      lastProgressSeconds = seconds;
      onProgressSeconds(seconds);
    });
    proc.on('error', reject);
    proc.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}`));
    });
  });
};

// ─── Copy Path Eligibility ────────────────────────────────────────────

export const checkCopyPathEligibility = (
  config: RenderConfigV2,
  vaultRoot: string,
  opts?: {
    outputStart?: number;
    onLog?: (chunk: string) => void;
  }
): CopyPathResult => {
  const log = (msg: string) => opts?.onLog?.(`[CopyPath] ${msg}\n`);
  const fail = (step: string, reason: string): CopyPathResult => {
    log(`✗ ${step}: ${reason}`);
    return { mode: 'none', reason: `${step}:${reason}` };
  };

  log('Checking copy-path eligibility...');

  // ── 1. Export mode must be video+audio ───────────────────────────────────
  const exportMode = (config.timeline as any).exportMode || 'video+audio';
  if (exportMode !== 'video+audio') {
    return fail('exportMode', `"${exportMode}" (requires "video+audio")`);
  }
  log(`✓ [Check:exportMode] video+audio`);

  // ── 2. Track composition and overlay checks ────────────────────────────────
  const allVideo   = config.items.filter(i => i.type === 'video');
  const allAudio   = config.items.filter(i => i.type === 'audio');
  const allImage   = config.items.filter(i => i.type === 'image'    && i.visible !== false);
  const allSubtitle= config.items.filter(i => i.type === 'subtitle' && i.visible !== false);
  const allText    = config.items.filter(i => {
    if (i.type !== 'text') return false;
    if (i.visible === false) return false;
    const val = typeof i.text?.value === 'string' ? i.text.value.trim() : '';
    return val.length > 0;
  });

  const visibleVideos    = allVideo.filter(i => i.visible !== false);
  const activeAudioItems = allAudio.filter(i => !(i.audioMix?.mute === true));
  if (visibleVideos.length !== 1) {
    return fail('videoCount', `need exactly 1 visible video (found ${visibleVideos.length})`);
  }
  const videoItem = visibleVideos[0];
  const videoAudioActive = !(videoItem.audioMix?.mute === true);
  const activeAudioSourceCount = activeAudioItems.length + (videoAudioActive ? 1 : 0);

  log(`  Video tracks total=${allVideo.length}, visible=${visibleVideos.length}, videoAudioActive=${videoAudioActive ? 'yes' : 'no'}`);
  log(`  Audio tracks total=${allAudio.length}, active (non-muted)=${activeAudioItems.length}`);
  log(`  Active audio sources total=${activeAudioSourceCount} (videoAudio=${videoAudioActive ? 1 : 0}, audioTracks=${activeAudioItems.length})`);
  log(`  Image tracks visible=${allImage.length}`);
  log(`  Subtitle tracks visible=${allSubtitle.length}`);
  log(`  Text tracks visible with content=${allText.length}`);

  if (activeAudioSourceCount <= 0) {
    return fail('audioSourceCount', 'no active audio source');
  }
  if (allImage.length > 0) {
    return fail('overlay:image', `${allImage.length} visible image track(s)`);
  }
  if (allSubtitle.length > 0) {
    return fail('overlay:subtitle', `${allSubtitle.length} visible subtitle track(s)`);
  }
  if (allText.length > 0) {
    return fail('overlay:text', `${allText.length} visible text track(s)`);
  }
  log(`✓ [Check:tracks] 1 visible video, ${activeAudioSourceCount} active audio source(s), no image/subtitle/text overlays`);

  // ── 3. Video must have identity transform (no encode-requiring effects) ───
  const t = videoItem.transform;
  const issues: string[] = [];

  const scaleVal = t?.scale ?? 1;
  const scaleNorm = scaleVal > 2 ? scaleVal / 100 : scaleVal;
  if (Math.abs(scaleNorm - 1) > 0.001)     issues.push(`scale=${scaleVal}`);
  if (Math.abs((t?.rotation ?? 0)) > 0.01) issues.push(`rotation=${t?.rotation}`);
  if (Math.abs((t?.opacity ?? 100) - 100) > 0.1) issues.push(`opacity=${t?.opacity}`);
  if ((t?.mirror ?? 'none') !== 'none')     issues.push(`mirror=${t?.mirror}`);

  const cropX = t?.crop?.x ?? 0;
  const cropY = t?.crop?.y ?? 0;
  const cropW = t?.crop?.w ?? 100;
  const cropH = t?.crop?.h ?? 100;
  if (Math.abs(cropX) > 0.1 || Math.abs(cropY) > 0.1) issues.push(`crop offset(${cropX},${cropY})`);
  if (Math.abs(cropW - 100) > 0.1 || Math.abs(cropH - 100) > 0.1) issues.push(`crop size(${cropW}x${cropH})`);

  if (videoItem.mask) issues.push(`mask=${videoItem.mask.type}`);
  if (Array.isArray(videoItem.effects) && videoItem.effects.length > 0) issues.push(`${videoItem.effects.length} effect(s)`);

  if (issues.length > 0) {
    return fail('videoTransform', issues.join(', '));
  }
  log(`✓ [Check:videoTransform] identity (no scale/crop/rotation/mirror/mask/effects)`);

  // ── 4. No timeline trimming or start offset on video ─────────────────────
  const vTimeline = videoItem.timeline ?? {};
  const vTrimStart = Math.max(0, vTimeline.trimStart ?? 0);
  const vTrimEnd   = Math.max(0, vTimeline.trimEnd   ?? 0);
  const vStart     = Math.max(0, vTimeline.start      ?? 0);
  if (vTrimStart > 0.01) return fail('videoTimeline', `trimStart=${vTrimStart}`);
  if (vTrimEnd   > 0.01) return fail('videoTimeline', `trimEnd=${vTrimEnd}`);
  if (vStart     > 0.01) return fail('videoTimeline', `start=${vStart}`);
  log(`✓ [Check:videoTimeline] no trim, no start offset`);

  // ── 5. No timeline trimming or start offset on contributing audio sources ─
  const audioContributors = [
    ...(videoAudioActive ? [{ kind: 'video' as const, item: videoItem }] : []),
    ...activeAudioItems.map(item => ({ kind: 'audio' as const, item }))
  ];
  for (const contributor of audioContributors) {
    const aTimeline = contributor.item.timeline ?? {};
    const aTrimStart = Math.max(0, aTimeline.trimStart ?? 0);
    const aTrimEnd   = Math.max(0, aTimeline.trimEnd   ?? 0);
    const aStart     = Math.max(0, aTimeline.start     ?? 0);
    const aDelay     = Math.max(0, contributor.item.audioMix?.delay ?? 0);
    const label = `${contributor.kind}:${contributor.item.id}`;
    if (aTrimStart > 0.01) return fail('audioTimeline', `${label} trimStart=${aTrimStart}`);
    if (aTrimEnd   > 0.01) return fail('audioTimeline', `${label} trimEnd=${aTrimEnd}`);
    if (aStart     > 0.01) return fail('audioTimeline', `${label} start=${aStart}`);
    if (aDelay     > 0.01) return fail('audioTimeline', `${label} delay=${aDelay}`);
  }
  log(`✓ [Check:audioTimeline] ${audioContributors.length} source(s), no trim/start/delay`);

  // ── 6. No segment offset (outputStart must be 0) ─────────────────────────
  const outputStartVal = Number.isFinite(opts?.outputStart) ? Number(opts!.outputStart) : 0;
  if (outputStartVal > 0.01) {
    return fail('outputStart', `${outputStartVal.toFixed(3)}s (copy path requires 0)`);
  }
  log(`✓ [Check:outputStart] 0`);

  // ── 7. Resolve video path and optional single external audio path ────────
  const videoPathFromRef = resolveRenderInputPath(videoItem.source?.ref, config.inputsMap);
  const videoPath = videoPathFromRef ?? (videoItem.source?.path ? resolveSafePath(videoItem.source.path, vaultRoot) : null);
  if (!videoPath) return fail('videoPath', 'unresolvable');
  log(`✓ [Check:videoPath] ${videoPath}`);

  let externalSingleAudioPath: string | null = null;
  if (!videoAudioActive && activeAudioItems.length === 1) {
    const audioItem = activeAudioItems[0];
    const audioPathFromRef = resolveRenderInputPath(audioItem.source?.ref, config.inputsMap);
    externalSingleAudioPath = audioPathFromRef ?? (audioItem.source?.path ? resolveSafePath(audioItem.source.path, vaultRoot) : null);
    if (!externalSingleAudioPath) return fail('audioPath', 'single external audio source unresolvable');
    log(`✓ [Check:audioPath] ${externalSingleAudioPath}`);
  }

  // ── 8. Determine output duration ─────────────────────────────────────────
  const timelineDuration = Number.isFinite(config.timeline.duration) && Number(config.timeline.duration) > 0
    ? Number(config.timeline.duration) : null;
  if (!timelineDuration || timelineDuration <= 0) {
    return fail('duration', `timeline.duration=${timelineDuration}`);
  }
  log(`✓ [Check:duration] ${timelineDuration.toFixed(3)}s`);

  // ── 9. Determine full-copy vs hybrid-copy (audio-only pipeline) ──────────
  let needsAudioEncode = activeAudioSourceCount !== 1;
  const audioReasons: string[] = [];
  if (activeAudioSourceCount !== 1) audioReasons.push(`audioSourceCount=${activeAudioSourceCount}`);
  for (const contributor of audioContributors) {
    const mix = contributor.item.audioMix ?? {};
    const gainDb = Number(mix.gainDb ?? 0);
    const levelCtrl = (mix as any).levelControl ?? (config.timeline as any).levelControl ?? 'gain';
    const fadeIn = Math.max(0, mix.fadeIn ?? 0);
    const fadeOut = Math.max(0, mix.fadeOut ?? 0);
    const muteSegments = mix.muteSegments ?? [];
    if (Math.abs(gainDb) > 0.01) {
      needsAudioEncode = true;
      audioReasons.push(`${contributor.item.id}.gainDb=${gainDb}`);
    }
    if (levelCtrl === 'lufs') {
      needsAudioEncode = true;
      audioReasons.push(`${contributor.item.id}.levelControl=lufs`);
    }
    if (fadeIn > 0) {
      needsAudioEncode = true;
      audioReasons.push(`${contributor.item.id}.fadeIn=${fadeIn}`);
    }
    if (fadeOut > 0) {
      needsAudioEncode = true;
      audioReasons.push(`${contributor.item.id}.fadeOut=${fadeOut}`);
    }
    if (muteSegments.length > 0) {
      needsAudioEncode = true;
      audioReasons.push(`${contributor.item.id}.muteSegments=${muteSegments.length}`);
    }
  }

  if (!needsAudioEncode) {
    const audioFromVideo = videoAudioActive;
    log(`✓ [Check:audioProcess] no audio processing required`);
    log(`→ mode=FULL (-c:v copy -c:a copy) — fully lossless, skipping all encode.`);
    return {
      mode: 'full',
      videoPath,
      duration: timelineDuration,
      audioFromVideo,
      ...(audioFromVideo ? {} : { audioPath: externalSingleAudioPath ?? undefined })
    };
  }

  log(`✓ [Check:audioProcess] requires audio re-encode: ${audioReasons.join(', ')}`);
  log(`→ mode=HYBRID (audio-only render + video copy mux) — video remains lossless.`);
  return { mode: 'hybrid', videoPath, duration: timelineDuration, activeAudioSourceCount };
};

// ─── Main Filter Graph Builder ────────────────────────────────────────

export const buildRenderV2FilterGraph = async (
  config: RenderConfigV2,
  tmpDir: string,
  vaultRoot: string,
  options?: BuildFilterGraphOptions
): Promise<FilterGraphResult> => {
  const debugEnabled = options?.debugEnabled === true;
  const debugLabel = options?.debugLabel ? ` ${options.debugLabel}` : '';
  const onLog = options?.onLog;
  const exportMode = (config.timeline as any).exportMode || 'video+audio';
  const includeVideo = exportMode !== 'audio only';
  const includeAudio = options?.includeAudio !== false && exportMode !== 'video only';
  const { w: outW, h: outH } = parseResolution(config.timeline.resolution);
  const framerate = Number.isFinite(config.timeline.framerate) ? config.timeline.framerate : 30;
  const background = '0x000000';
  const configOutputStart = Number.isFinite(config.timeline.start) ? Math.max(0, Number(config.timeline.start)) : 0;
  const outputStart = Number.isFinite(options?.outputStart) ? Math.max(0, Number(options?.outputStart)) : configOutputStart;

  const isVisible = (item: RenderItemV2) => item.visible !== false;
  const isMuted = (item: RenderItemV2) => item.audioMix?.mute === true;

  // Log track optimization details
  if (onLog) {
    const used: string[] = [];
    const skipped: string[] = [];
    config.items.forEach(item => {
      const label = `${item.name || item.id} [${item.type}]`;
      if (item.type === 'video') {
        if (!isVisible(item)) skipped.push(`${label} (hidden)`);
        else if (isMuted(item)) used.push(`${label} (video-only, muted)`);
        else used.push(label);
      } else if (item.type === 'audio') {
        if (isMuted(item)) skipped.push(`${label} (muted)`);
        else used.push(label);
      } else {
        if (!isVisible(item)) skipped.push(`${label} (hidden)`);
        else used.push(label);
      }
    });
    onLog(`[RenderV2] Optimization: ${used.length} tracks used, ${skipped.length} skipped.\n`);
    if (used.length > 0) onLog(`[RenderV2] Used tracks: ${used.join(', ')}\n`);
    if (skipped.length > 0) onLog(`[RenderV2] Skipped tracks: ${skipped.join(', ')}\n`);
  }

  const visualItems = includeVideo ? config.items.filter(item => (item.type === 'video' || item.type === 'image') && isVisible(item)) : [];
  const audioItems = config.items.filter(item => item.type === 'audio' && !isMuted(item));
  const subtitleItems = includeVideo ? config.items.filter(item => item.type === 'subtitle' && isVisible(item)) : [];
  const textItems = includeVideo ? config.items.filter(item => item.type === 'text' && isVisible(item)) : [];

  const videoItemsForAudio = !includeVideo && includeAudio
    ? config.items.filter(item => item.type === 'video' && isVisible(item) && !isMuted(item))
    : [];

  const sourceItems = [
    ...visualItems,
    ...videoItemsForAudio,
    ...(includeAudio ? audioItems : []),
    ...subtitleItems
  ];

  const inputs: Array<{ path: string; type: RenderItemV2['type']; item: RenderItemV2; duration?: number }> = [];
  for (const item of sourceItems) {
    const pathFromRef = resolveRenderInputPath(item.source?.ref, config.inputsMap);
    const sourcePath = pathFromRef ?? (item.source?.path ? resolveSafePath(item.source.path, vaultRoot) : null);
    if (!sourcePath) continue;
    let duration: number | undefined;
    if (item.type === 'video' || item.type === 'audio' || item.type === 'subtitle') {
      const stats = await fs.stat(sourcePath);
      duration = await getDurationSeconds(sourcePath, item.type, stats);
    }
    inputs.push({ path: sourcePath, type: item.type, item, duration });
  }

  const computedMediaTimelineDuration = inputs.reduce((max, entry) => {
    if (entry.type !== 'video' && entry.type !== 'audio') return max;
    if (!(typeof entry.duration === 'number' && Number.isFinite(entry.duration) && entry.duration > 0)) return max;
    const trimStart = Math.max(0, entry.item.timeline?.trimStart ?? 0);
    const trimEnd = Math.max(0, entry.item.timeline?.trimEnd ?? 0);
    const effective = Math.max(0.1, entry.duration - trimStart - trimEnd);
    return Math.max(max, effective);
  }, 0);

  const resolvedTimelineDuration = Number.isFinite(config.timeline.duration) && Number(config.timeline.duration) > 0
    ? Number(config.timeline.duration)
    : computedMediaTimelineDuration;

  const isImageMatchDuration = (entry: { item: RenderItemV2 }) => {
    return Boolean(entry.item.timeline?.matchDuration);
  };

  const defaultDuration = 5;
  const rawItemTiming = inputs.map(entry => {
    const startRaw = Math.max(0, entry.item.timeline?.start ?? 0);
    const trimStartRaw = Math.max(0, entry.item.timeline?.trimStart ?? 0);
    const trimEndRaw = Math.max(0, entry.item.timeline?.trimEnd ?? 0);
    const hasExplicitDuration = (
      (typeof entry.duration === 'number' && Number.isFinite(entry.duration) && entry.duration > 0) ||
      Number.isFinite(entry.item.timeline?.duration)
    );
    const baseDuration = entry.duration && entry.duration > 0
      ? Math.max(0.1, entry.duration - trimStartRaw - trimEndRaw)
      : defaultDuration;
    const matchedImageDuration = entry.type === 'image' && isImageMatchDuration(entry) && resolvedTimelineDuration > 0
      ? resolvedTimelineDuration
      : null;
    const durationRaw = typeof matchedImageDuration === 'number'
      ? matchedImageDuration
      : Number.isFinite(entry.item.timeline?.duration)
      ? Math.max(0.1, Number(entry.item.timeline?.duration))
      : baseDuration;
    const endRaw = startRaw + durationRaw;
    return {
      entry,
      startRaw,
      durationRaw,
      trimStartRaw,
      endRaw,
      hasExplicitDuration: hasExplicitDuration || typeof matchedImageDuration === 'number'
    };
  });

  if (debugEnabled) {
    console.log(`RENDER_V2_DEBUG raw timing${debugLabel}`, JSON.stringify(rawItemTiming.map(t => ({
      id: t.entry.item?.id,
      type: t.entry.type,
      startRaw: t.startRaw,
      durationRaw: t.durationRaw,
      endRaw: t.endRaw,
      trimStartRaw: t.trimStartRaw,
      hasExplicitDuration: t.hasExplicitDuration
    }))));
  }

  const outputDurationFromItems = rawItemTiming.reduce((max, t) => Math.max(max, t.endRaw - outputStart), 0);
  const minOutputDuration = options?.allowShortDuration ? 0.001 : 0.1;
  const trimThreshold = options?.allowShortDuration ? 0.001 : 0.1;
  const sampleAt = Number.isFinite(options?.sampleAt) ? Math.max(0, Number(options?.sampleAt)) : null;
  const outputDurationRaw = Number.isFinite(options?.outputDuration)
    ? Number(options?.outputDuration)
    : (Number.isFinite(config.timeline.duration)
      ? Number(config.timeline.duration)
      : outputDurationFromItems);
  const outputDuration = Math.max(minOutputDuration, outputDurationRaw);

  const inputArgs: string[] = [];
  const inputEntries: Array<{
    type: RenderItemV2['type'];
    args: string[];
    item: RenderItemV2;
    timing?: { start: number; duration: number; trimStart: number };
  }> = [];

  const finalItemTiming: Array<{ entry: any; start: number; duration: number; trimStart: number }> = [];

  inputs.forEach((entry, idx) => {
    const args: string[] = [];
    const rawT = rawItemTiming[idx];
    let start = 0;
    let duration = 0;
    let trimStart = 0;
    if (sampleAt !== null) {
      if (rawT.hasExplicitDuration) {
        if (rawT.startRaw > sampleAt || rawT.endRaw <= sampleAt) return;
      } else if (rawT.startRaw > sampleAt) {
        return;
      }
      start = 0;
      duration = Math.max(trimThreshold, outputDuration);
      trimStart = entry.type === 'image'
        ? rawT.trimStartRaw
        : rawT.trimStartRaw + Math.max(0, sampleAt - rawT.startRaw);
    } else {
      if (rawT.endRaw <= outputStart || rawT.startRaw >= outputStart + outputDuration) {
        return;
      }
      start = Math.max(0, rawT.startRaw - outputStart);
      const end = Math.min(outputDuration, rawT.endRaw - outputStart);
      duration = Math.max(0.01, end - start);
      trimStart = entry.type === 'image'
        ? rawT.trimStartRaw
        : rawT.trimStartRaw + Math.max(0, outputStart - rawT.startRaw);
    }

    let inputSeek = 0;
    if ((entry.type === 'video' || entry.type === 'audio') && trimStart > 0) {
      inputSeek = Math.max(0, trimStart - INPUT_SEEK_PREROLL_SECONDS);
      trimStart = Math.max(0, trimStart - inputSeek);
    }

    const timing = { entry, start, duration, trimStart };
    finalItemTiming.push(timing);

    if (entry.type === 'image') {
      args.push('-loop', '1', '-t', String(duration + start));
    }
    if (inputSeek > 0) {
      args.push('-ss', String(inputSeek));
    }
    args.push('-i', entry.path);
    inputArgs.push(...args);
    inputEntries.push({
      type: entry.type,
      args,
      item: entry.item,
      timing
    });
  });

  const filters: string[] = [];
  let currentVideo: string | null = null;
  let visualIndex = 0;
  let circleMaskPath: string | null = null;

  if (includeVideo) {
    filters.push(`color=c=${background}:s=${outW}x${outH}:d=${outputDuration}:r=${framerate}[base]`);
    currentVideo = '[base]';

    const sortedVisual = [...visualItems].sort((a, b) => (a.layer ?? 0) - (b.layer ?? 0));
    for (const item of sortedVisual) {
      const timing = finalItemTiming.find(t => t.entry.item === item);
      if (!timing) continue;

      const inputIndex = inputEntries.findIndex(e => e.item === item);
      if (inputIndex < 0) continue;

      const label = `[v${visualIndex}]`;
      const start = timing?.start ?? 0;
      const duration = timing?.duration ?? outputDuration;
      const end = Math.max(start + 0.01, start + duration);
      const scale = item.transform?.scale ?? 1;
      const rotation = item.transform?.rotation ?? 0;
      const opacity = Math.max(0, Math.min(100, item.transform?.opacity ?? 100)) / 100;
      const posX = item.transform?.x ?? 50;
      const posY = item.transform?.y ?? 50;
      const fit = item.transform?.fit ?? 'contain';
      const crop = item.transform?.crop;
      const xExpr = `(main_w-overlay_w)*${posX}/100`;
      const yExpr = `(main_h-overlay_h)*${posY}/100`;

      let chain = `[${inputIndex}:v]`;
      const addFilter = (filter: string) => {
        chain += chain.endsWith(']') ? filter : `,${filter}`;
      };
      const trimStart = timing?.trimStart ?? 0;
      const trimEndValue = trimStart + duration;
      if (trimStart > 0 || duration > trimThreshold) {
        addFilter(`trim=start=${trimStart}:end=${trimEndValue}`);
      }
      addFilter('setpts=PTS-STARTPTS');
      if (crop) {
        const cw = Math.max(0.1, Math.min(100, crop.w));
        const ch = Math.max(0.1, Math.min(100, crop.h));
        const cx = Math.max(0, Math.min(100, crop.x));
        const cy = Math.max(0, Math.min(100, crop.y));
        addFilter(
          `crop=iw*${(cw / 100).toFixed(4)}:ih*${(ch / 100).toFixed(4)}:iw*${(cx / 100).toFixed(4)}:ih*${(cy / 100).toFixed(4)}`
        );
      }
      if (fit === 'stretch') {
        addFilter(`scale=${outW}:${outH}`);
      } else if (fit === 'cover') {
        addFilter(`scale=${outW}:${outH}:force_original_aspect_ratio=increase`);
      } else {
        addFilter(`scale=${outW}:${outH}:force_original_aspect_ratio=decrease`);
      }

      const mirror = item.transform?.mirror;
      if (mirror === 'horizontal') {
        addFilter('hflip');
      } else if (mirror === 'vertical') {
        addFilter('vflip');
      } else if (mirror === 'both') {
        addFilter('hflip,vflip');
      }
      if (scale !== 1) {
        addFilter(`scale=iw*${scale}:ih*${scale}`);
      }
      if (rotation !== 0) {
        const radians = (rotation * Math.PI) / 180;
        addFilter(`rotate=${radians}:fillcolor=none`);
      }
      addFilter('format=rgba');

      // Mask handling
      if (item.mask && (item.mask.type === 'rect' || item.mask.type === 'circle')) {
        const mx = Math.max(0, Math.min(100, Number(item.mask.x ?? 0)));
        const my = Math.max(0, Math.min(100, Number(item.mask.y ?? 0)));
        const mw = Math.max(0.1, Math.min(100, Number(item.mask.w ?? 100)));
        const mh = Math.max(0.1, Math.min(100, Number(item.mask.h ?? 100)));
        const splitLabelA = `[vms${visualIndex}a]`;
        const splitLabelB = `[vms${visualIndex}b]`;
        const outLabel = `[v${visualIndex}]`;
        const splitChain = chain.endsWith(']')
          ? `${chain}split=2${splitLabelA}${splitLabelB}`
          : `${chain},split=2${splitLabelA}${splitLabelB}`;
        filters.push(splitChain);

        if (item.mask.type === 'rect') {
          const cropLabel = `[vmcrop${visualIndex}]`;
          const clearLabel = `[vmclr${visualIndex}]`;
          const mxNorm = (mx / 100).toFixed(4);
          const myNorm = (my / 100).toFixed(4);
          const mwNorm = (mw / 100).toFixed(4);
          const mhNorm = (mh / 100).toFixed(4);
          filters.push(
            `${splitLabelA}crop=iw*${mwNorm}:ih*${mhNorm}:iw*${mxNorm}:ih*${myNorm}${cropLabel}`
          );
          filters.push(`${splitLabelB}colorchannelmixer=aa=0${clearLabel}`);
          let mergeChain = `${clearLabel}${cropLabel}overlay=x=W*${mxNorm}:y=H*${myNorm}:format=auto`;
          if (opacity < 1) {
            mergeChain += `,colorchannelmixer=aa=${opacity.toFixed(3)}`;
          }
          filters.push(`${mergeChain}${outLabel}`);
        } else {
          if (!circleMaskPath) {
            circleMaskPath = await ensureCircleMaskPgm(tmpDir);
          }
          const cropLabel = `[vmcrop${visualIndex}]`;
          const maskUnitLabel = `[vmmu${visualIndex}]`;
          const maskLabel = `[vmask${visualIndex}]`;
          const cropRefLabel = `[vmcr${visualIndex}]`;
          const maskedCropLabel = `[vmcm${visualIndex}]`;
          const clearLabel = `[vmclr${visualIndex}]`;
          const mxNorm = (mx / 100).toFixed(4);
          const myNorm = (my / 100).toFixed(4);
          const mwNorm = (mw / 100).toFixed(4);
          const mhNorm = (mh / 100).toFixed(4);
          filters.push(
            `${splitLabelA}crop=iw*${mwNorm}:ih*${mhNorm}:iw*${mxNorm}:ih*${myNorm}${cropLabel}`
          );
          filters.push(`movie='${escapeFilterPath(circleMaskPath)}',format=gray,${STATIC_MASK_LOOP_FILTER}${maskUnitLabel}`);
          filters.push(`${maskUnitLabel}${cropLabel}scale2ref${maskLabel}${cropRefLabel}`);
          filters.push(`${cropRefLabel}${maskLabel}alphamerge${maskedCropLabel}`);
          filters.push(`${splitLabelB}colorchannelmixer=aa=0${clearLabel}`);
          let mergeChain = `${clearLabel}${maskedCropLabel}overlay=x=W*${mxNorm}:y=H*${myNorm}:format=auto`;
          if (opacity < 1) {
            mergeChain += `,colorchannelmixer=aa=${opacity.toFixed(3)}`;
          }
          filters.push(`${mergeChain}${outLabel}`);
        }
      } else {
        if (opacity < 1) {
          addFilter(`colorchannelmixer=aa=${opacity.toFixed(3)}`);
        }
        filters.push(`${chain}${label}`);
      }

      // Blur effects
      const itemBlurEffects = parseBlurRegionEffects(
        Array.isArray(item.effects)
          ? item.effects
            .filter(effect => effect && effect.type === 'blur_region')
            .map(effect => ({ type: 'blur_region', ...((effect.params ?? {}) as Record<string, unknown>) }))
          : []
      );
      let overlayInputLabel = label;
      if (itemBlurEffects.length > 0) {
        let blurCurrentLabel = label;
        for (let effectIndex = 0; effectIndex < itemBlurEffects.length; effectIndex += 1) {
          const effect = itemBlurEffects[effectIndex];
          const x = effect.left;
          const y = effect.top;
          const w = 100 - effect.left - effect.right;
          const h = 100 - effect.top - effect.bottom;
          const sigma = effect.sigma;
          const feather = effect.feather > 0 ? effect.feather : 0;
          const main = `ivm${visualIndex}_${effectIndex}`;
          const tmp = `ivt${visualIndex}_${effectIndex}`;
          const out = `ivo${visualIndex}_${effectIndex}`;
          const gblurSigma = Math.max(2, Math.min(96, Number(sigma) * 1.8));
          const gblurSteps = Math.max(1, Math.min(6, Math.round(gblurSigma / 10)));
          const bl = `ivb${visualIndex}_${effectIndex}`;
          filters.push(`${blurCurrentLabel}split=2[${main}][${tmp}]`);
          filters.push(
            `[${tmp}]crop=iw*${w}/100:ih*${h}/100:iw*${x}/100:ih*${y}/100,format=rgba,gblur=sigma=${gblurSigma.toFixed(2)}:steps=${gblurSteps}:planes=0x7,format=rgba[${bl}]`
          );
          if (feather > 0) {
            const maskPath = await ensureFeatherMaskPgm(tmpDir, feather);
            const featherMaskSigma = Math.max(0.8, Math.min(16, feather * 1.2));
            const mu = `ivmu${visualIndex}_${effectIndex}`;
            const mk = `ivmk${visualIndex}_${effectIndex}`;
            const br = `ivbr${visualIndex}_${effectIndex}`;
            const ba = `ivba${visualIndex}_${effectIndex}`;
            filters.push(
              `movie='${escapeFilterPath(maskPath)}',format=gray,gblur=sigma=${featherMaskSigma.toFixed(2)}:steps=2,${STATIC_MASK_LOOP_FILTER}[${mu}]`
            );
            filters.push(`[${mu}][${bl}]scale2ref[${mk}][${br}]`);
            filters.push(`[${br}][${mk}]alphamerge[${ba}]`);
            filters.push(`[${main}][${ba}]overlay=W*${x}/100:H*${y}/100:format=auto[${out}]`);
          } else {
            filters.push(`[${main}][${bl}]overlay=W*${x}/100:H*${y}/100[${out}]`);
          }
          blurCurrentLabel = `[${out}]`;
        }
        overlayInputLabel = blurCurrentLabel;
      }

      const overlayFilter = sampleAt === null
        ? `overlay=x=${xExpr}:y=${yExpr}:enable='between(t,${start},${end})'`
        : `overlay=x=${xExpr}:y=${yExpr}`;
      filters.push(`${currentVideo}${overlayInputLabel}${overlayFilter}[v${visualIndex}o]`);
      currentVideo = `[v${visualIndex}o]`;
      visualIndex += 1;
    }

    // Subtitles
    for (let idx = 0; idx < subtitleItems.length; idx += 1) {
      const subtitleItem = subtitleItems[idx];
      const timing = finalItemTiming.find(t => t.entry.item === subtitleItem);
      if (!timing) continue;

      const subPath = resolveRenderInputPath(subtitleItem.source?.ref, config.inputsMap)
        ?? (subtitleItem.source?.path ? resolveSafePath(subtitleItem.source.path, vaultRoot) : null);
      if (!subPath) continue;
      const start = timing.start;
      const end = start + timing.duration;
      const stylePayload = {
        ...(subtitleItem.subtitleStyle ?? {}),
        playResX: outW,
        playResY: outH,
        shift: -outputStart
      };
      const style = parseAssRenderStyle(stylePayload);
      const assOut = path.join(tmpDir, `render-v2-${idx}.ass`);
      try {
        await writeStyledAssFile(subPath, style, assOut);
        const subFilter = buildSubtitlesVideoFilter(assOut, { w: style.playResX, h: style.playResY });
        const label = `[vsub${idx}]`;
        filters.push(`${currentVideo}${subFilter}${label}`);
        currentVideo = label;
      } catch {
        // ignore subtitle parsing errors
      }
    }

    // Text items
    for (let idx = 0; idx < textItems.length; idx += 1) {
      const textItem = textItems[idx];
      const rawText = typeof textItem.text?.value === 'string' ? textItem.text.value.trim() : '';
      if (!rawText) continue;
      const isTextMatchDuration = String(textItem.text?.matchDuration ?? '0') === '1';

      const itemStartRaw = isTextMatchDuration
        ? 0
        : (Number.isFinite(textItem.text?.start)
          ? Number(textItem.text?.start)
          : (textItem.timeline?.start ?? 0));
      const itemEndRaw = isTextMatchDuration
        ? (resolvedTimelineDuration > 0 ? resolvedTimelineDuration : (itemStartRaw + 5))
        : (Number.isFinite(textItem.text?.end)
          ? Number(textItem.text?.end)
          : (Number.isFinite(textItem.timeline?.duration)
            ? itemStartRaw + Number(textItem.timeline?.duration)
            : itemStartRaw + 5));

      if (itemEndRaw <= outputStart || itemStartRaw >= outputStart + outputDuration) {
        continue;
      }

      const stylePayload = {
        ...(textItem.subtitleStyle ?? {}),
        playResX: outW,
        playResY: outH,
        shift: -outputStart
      };
      const style = parseAssRenderStyle(stylePayload);
      const assOut = path.join(tmpDir, `render-text-${idx}.ass`);
      try {
        const doc = buildAssDocument([{ start: itemStartRaw, end: itemEndRaw, text: rawText }], style);
        await fs.writeFile(assOut, doc, 'utf-8');
        const subFilter = buildSubtitlesVideoFilter(assOut, { w: style.playResX, h: style.playResY });
        const label = `[vtext${idx}]`;
        filters.push(`${currentVideo}${subFilter}${label}`);
        currentVideo = label;
      } catch {
        // ignore text rendering errors
      }
    }
  }

  // Audio mixing
  const timelineTargetLufs = typeof (config.timeline as any).targetLufs === 'number'
    ? Number((config.timeline as any).targetLufs)
    : -14;

  type AudioCandidate = {
    item: RenderItemV2;
    inputIndex: number;
    timing: { start: number; duration: number; trimStart: number };
    streamSelector: string;
    directMapSelector: string;
    trackLabel: string;
  };

  const audioCandidates: AudioCandidate[] = [];

  if (includeAudio) {
    const videoAudioSourceItems = includeVideo ? visualItems : videoItemsForAudio;
    for (const item of videoAudioSourceItems) {
      if (item.type !== 'video') continue;
      const timing = finalItemTiming.find(t => t.entry.item === item);
      if (!timing) continue;
      const inputIndex = inputEntries.findIndex(e => e.item === item);
      if (inputIndex < 0) continue;
      const trackLabel = item.name ?? item.id ?? 'video';
      const isMutedFlag = item.audioMix?.mute === true;
      const muteMsg = `[AudioMix] Video track "${trackLabel}" (id=${item.id}): muted=${isMutedFlag}`;
      if (debugEnabled) console.log(muteMsg);
      onLog?.(`${muteMsg}\n`);
      if (isMutedFlag) continue;
      audioCandidates.push({
        item,
        inputIndex,
        timing,
        streamSelector: `[${inputIndex}:a]`,
        directMapSelector: `${inputIndex}:a`,
        trackLabel
      });
    }

    for (const item of audioItems) {
      const timing = finalItemTiming.find(t => t.entry.item === item);
      if (!timing) continue;
      const inputIndex = inputEntries.findIndex(e => e.item === item);
      if (inputIndex < 0) continue;
      const trackLabel = item.name ?? item.id ?? 'audio';
      const isMutedFlag = item.audioMix?.mute === true;
      const muteMsg = `[AudioMix] Audio track "${trackLabel}" (id=${item.id}): muted=${isMutedFlag}`;
      if (debugEnabled) console.log(muteMsg);
      onLog?.(`${muteMsg}\n`);
      if (isMutedFlag) continue;
      audioCandidates.push({
        item,
        inputIndex,
        timing,
        streamSelector: `[${inputIndex}:a]`,
        directMapSelector: `${inputIndex}:a`,
        trackLabel
      });
    }
  }

  const audioLog = (msg: string) => {
    const fullMsg = `[AudioMix]${debugLabel} ${msg}`;
    if (debugEnabled) console.log(fullMsg);
    onLog?.(`${fullMsg}\n`);
  };
  audioLog(`Timeline targetLufs=${timelineTargetLufs} (output loudnorm target)`);
  audioLog(`Active audio candidates: ${audioCandidates.length} (after mute filter)`);

  const resolveTrackTargetLufs = (item: RenderItemV2): number => {
    const trackLufs = (item.audioMix as any)?.targetLufs;
    return typeof trackLufs === 'number' ? trackLufs : timelineTargetLufs;
  };

  const ffmpegPathForLufs = options?.ffmpegPath;
  const lufsCache = options?.lufsCache;

  const getOrMeasureLufs = async (
    filePath: string,
    trimStart: number,
    maxDuration: number
  ): Promise<number | null> => {
    if (!ffmpegPathForLufs) return null;
    const cacheKey = `${filePath}::${trimStart.toFixed(3)}::${maxDuration.toFixed(0)}`;
    if (lufsCache?.has(cacheKey)) return lufsCache.get(cacheKey)!;
    const measured = await measureAudioLufs(ffmpegPathForLufs, filePath, trimStart, maxDuration, options?.onLog);
    if (measured !== null && lufsCache) lufsCache.set(cacheKey, measured);
    return measured;
  };

  const buildAudioChain = async (
    candidate: AudioCandidate,
    outputLabel: string
  ): Promise<string> => {
    const { item, timing } = candidate;
    const trimStart = timing.trimStart;
    const duration = timing.duration;
    const start = timing.start;
    const endValue = trimStart + duration;
    const trackTargetLufs = resolveTrackTargetLufs(item);
    const fadeIn = Math.max(0, item.audioMix?.fadeIn ?? 0);
    const fadeOut = Math.max(0, item.audioMix?.fadeOut ?? 0);

    const inputFile = inputs[candidate.inputIndex];
    let gainDb = 0;
    if (inputFile?.path) {
      const measureDuration = Math.min(Math.max(duration, 5), MAX_LUFS_MEASURE_SECONDS);
      const measuredLufs = await getOrMeasureLufs(inputFile.path, trimStart, measureDuration);
      if (measuredLufs !== null) {
        if (measuredLufs <= LUFS_UNRELIABLE_FLOOR) {
          audioLog(
            `  Track "${candidate.trackLabel}": measuredLufs=${measuredLufs.toFixed(1)} (at/below ` +
            `${LUFS_UNRELIABLE_FLOOR} LUFS floor — treating as unreliable, gainDb=0)`
          );
        } else {
          gainDb = trackTargetLufs - measuredLufs;
          audioLog(
            `  Track "${candidate.trackLabel}": measuredLufs=${measuredLufs.toFixed(1)}, ` +
            `targetLufs=${trackTargetLufs}, gainDb=${gainDb.toFixed(2)}`
          );
        }
      } else {
        audioLog(
          `  Track "${candidate.trackLabel}": LUFS measurement unavailable, ` +
          `gainDb=0 (targetLufs=${trackTargetLufs})`
        );
      }
    }

    let chain = candidate.streamSelector;
    const addFilter = (filter: string) => {
      chain += chain.endsWith(']') ? filter : `,${filter}`;
    };

    if (trimStart > 0 || duration > trimThreshold) {
      addFilter(`atrim=start=${trimStart}:end=${endValue}`);
    }
    addFilter('asetpts=PTS-STARTPTS');

    const gainFactor = Math.pow(10, gainDb / 20);
    addFilter(`volume=${gainFactor.toFixed(6)}`);
    audioLog(`    → volume: factor=${gainFactor.toFixed(6)} (${gainDb >= 0 ? '+' : ''}${gainDb.toFixed(2)} dB)`);

    addFilter('aformat=sample_fmts=fltp:channel_layouts=stereo');

    if (start > 0) {
      const ms = Math.round(start * 1000);
      addFilter(`adelay=${ms}|${ms}`);
    }

    if (fadeIn > 0) {
      addFilter(`afade=t=in:st=${start}:d=${fadeIn}`);
    }
    if (fadeOut > 0) {
      const end = Math.max(start + 0.01, start + duration);
      const fadeOutStart = Math.max(start, end - fadeOut);
      addFilter(`afade=t=out:st=${fadeOutStart}:d=${fadeOut}`);
    }

    const muteSegments = item.audioMix?.muteSegments;
    if (muteSegments && muteSegments.length > 0) {
      const betweenExprs = muteSegments.map(seg => `between(t,${seg.start},${seg.end})`);
      const enableExpr = betweenExprs.length === 1 
        ? betweenExprs[0] 
        : betweenExprs.reduce((acc, expr) => `or(${acc},${expr})`);
      addFilter(`volume=0:enable='${enableExpr}'`);
      audioLog(`    → mute segments: ${muteSegments.map(s => `[${s.start}-${s.end}]`).join(', ')}`);
    }

    return `${chain}${outputLabel}`;
  };

  const audioFilters: string[] = [];
  let audioMap: string[] = [];

  if (includeAudio && audioCandidates.length > 0) {
    const lufsOut = Math.max(-70, Math.min(-5, timelineTargetLufs));

    if (audioCandidates.length === 1) {
      audioLog(`Single audio track → per-track gain + output loudnorm (I=${lufsOut})`);
      const chain = await buildAudioChain(audioCandidates[0], '[apre]');
      filters.push(chain);
      filters.push(`[apre]loudnorm=I=${lufsOut}:TP=-1:LRA=11[aout]`);
      audioLog(`Output loudnorm: I=${lufsOut} TP=-1 LRA=11 → [aout]`);
      audioMap = ['-map', '[aout]'];
    } else {
      audioLog(`${audioCandidates.length} audio tracks → per-track gain → amix → output loudnorm`);
      for (let i = 0; i < audioCandidates.length; i++) {
        const chain = await buildAudioChain(audioCandidates[i], `[a${i}]`);
        audioFilters.push(chain);
      }
      const mixInputs = audioCandidates.map((_, idx) => `[a${idx}]`).join('');
      filters.push(...audioFilters);
      filters.push(`${mixInputs}amix=inputs=${audioCandidates.length}:duration=longest:dropout_transition=0[amixed]`);
      audioLog(`amix: ${audioCandidates.length} inputs → [amixed]`);
      filters.push(`[amixed]loudnorm=I=${lufsOut}:TP=-1:LRA=11[aout]`);
      audioLog(`Output loudnorm: I=${lufsOut} TP=-1 LRA=11 → [aout]`);
      audioMap = ['-map', '[aout]'];
    }
  } else if (includeAudio) {
    audioLog(`No active audio tracks after mute filter — output will have no audio stream`);
  }

  const filterComplex = filters.filter(f => f && f.trim().length > 0).join(';');
  if (debugEnabled) {
    console.log(`RENDER_V2_DEBUG final timing${debugLabel}`, JSON.stringify(finalItemTiming.map(t => ({
      id: t.entry.item?.id,
      type: t.entry.type,
      start: t.start,
      duration: t.duration,
      trimStart: t.trimStart,
      end: t.start + t.duration
    }))));
  }

  return {
    inputArgs,
    inputEntries,
    filterComplex,
    videoLabel: currentVideo,
    audioMap,
    outputDuration,
    framerate
  };
};

// ─── FFmpeg Args Builder ───────────────────────────────────────────────

export const buildRenderV2FfmpegArgs = async (
  config: RenderConfigV2,
  outputPath: string,
  tmpDir: string,
  vaultRoot: string,
  codecSettings: {
    codec: string;
    preset: string;
    crf: number;
    tune?: string;
    gop?: number;
    threads?: number;
  },
  options?: BuildFilterGraphOptions
): Promise<{ args: string[]; outputDuration: number }> => {
  const graph = await buildRenderV2FilterGraph(config, tmpDir, vaultRoot, options);
  const { codec, preset, crf, tune, gop, threads } = codecSettings;
  
  let resolvedGop = gop;
  if (!Number.isFinite(resolvedGop) || (resolvedGop ?? 0) <= 0) {
    const fr = Number(graph.framerate);
    if (Number.isFinite(fr) && fr > 0) resolvedGop = Math.round(fr * 2);
  }

  const isAudioOnlyMode = !graph.videoLabel && graph.audioMap.length > 0;
  const args = [
    '-y',
    ...graph.inputArgs,
    ...(graph.filterComplex ? ['-filter_complex', graph.filterComplex] : []),
    ...(graph.videoLabel ? ['-map', graph.videoLabel] : []),
    ...graph.audioMap,
    ...(graph.videoLabel ? [
      '-c:v', codec,
      '-preset', preset,
      '-crf', String(crf),
      ...(tune ? ['-tune', tune] : []),
      ...(resolvedGop && resolvedGop > 0 ? ['-g', String(Math.round(resolvedGop))] : []),
      '-pix_fmt', 'yuv420p',
      '-r', String(graph.framerate)
    ] : isAudioOnlyMode ? [
      '-vn',
      '-c:a', 'libmp3lame',
      '-q:a', '2'
    ] : []),
    ...(threads ? ['-threads', String(threads)] : []),
    '-t', String(graph.outputDuration),
    outputPath
  ];

  return { args, outputDuration: graph.outputDuration };
};
