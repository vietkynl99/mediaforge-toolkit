/**
 * Render V2 Pipeline Module - FFmpeg filter graphs, masks, LUFS measurement
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { spawn } from 'child_process';
import { RenderConfigV2, RenderItemV2, BlurRegionEffect } from '../../shared/types.js';

// Constants
export const BLUR_FEATHER_MAX = 10;
export const STATIC_MASK_LOOP_FILTER = 'loop=loop=-1:size=1:start=0,setpts=N/FRAME_RATE/TB';

// ─── Resolution Parsing ──────────────────────────────────────────────

export const parseResolution = (value: string | undefined | null, fallback = { w: 1920, h: 1080 }) => {
  if (!value) return fallback;
  const match = String(value).trim().match(/(\d+)\s*[x×]\s*(\d+)/i);
  if (!match) return fallback;
  const w = Number.parseInt(match[1], 10);
  const h = Number.parseInt(match[2], 10);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return fallback;
  return { w: Math.round(w), h: Math.round(h) };
};

// ─── Input Path Resolution ───────────────────────────────────────────

export const resolveRenderInputPath = (ref: string | undefined, inputsMap: Record<string, string>) => {
  if (!ref) return null;
  const cleaned = ref.replace(/^\s*\{\{/, '').replace(/\}\}\s*$/, '').trim();
  const rel = inputsMap[cleaned] ?? inputsMap[ref] ?? '';
  if (!rel) return null;
  return rel;
};

// ─── Mask Generation ─────────────────────────────────────────────────

/**
 * Creates a circular mask PGM file for FFmpeg overlay masking
 */
export const ensureCircleMaskPgm = async (tmpDir: string) => {
  const size = 256;
  const maskPath = path.join(tmpDir, `circle-mask-${size}.pgm`);
  try {
    await fs.access(maskPath);
    return maskPath;
  } catch {
    const radius = size / 2;
    const cx = (size - 1) / 2;
    const cy = (size - 1) / 2;
    const pixels = Buffer.alloc(size * size);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const dx = x - cx;
        const dy = y - cy;
        const inside = (dx * dx + dy * dy) <= (radius * radius);
        pixels[y * size + x] = inside ? 255 : 0;
      }
    }
    const header = Buffer.from(`P5\n${size} ${size}\n255\n`, 'ascii');
    await fs.writeFile(maskPath, Buffer.concat([header, pixels]));
    return maskPath;
  }
};

/**
 * Creates a feather (edge fade) mask PGM file for blur region effects
 */
export const ensureFeatherMaskPgm = async (tmpDir: string, featherPct: number) => {
  const f = Math.max(0, Math.min(BLUR_FEATHER_MAX, Math.round(featherPct)));
  const size = 256;
  const maskPath = path.join(tmpDir, `feather-mask-${f}-${size}.pgm`);
  try {
    await fs.access(maskPath);
    return maskPath;
  } catch {
    const edge = f <= 0 ? 0 : (f / 100) * (size / 2);
    const pixels = Buffer.alloc(size * size);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const d = Math.min(x, y, size - 1 - x, size - 1 - y);
        const alpha = edge <= 0 ? 255 : Math.max(0, Math.min(255, Math.round((d / edge) * 255)));
        pixels[y * size + x] = alpha;
      }
    }
    const header = Buffer.from(`P5\n${size} ${size}\n255\n`, 'ascii');
    await fs.writeFile(maskPath, Buffer.concat([header, pixels]));
    return maskPath;
  }
};

// ─── LUFS Measurement ────────────────────────────────────────────────

/**
 * Measures integrated loudness (LUFS) of an audio/video file using ffmpeg ebur128.
 *
 * @param maxDuration - Limit measurement to this many seconds from trimStart.
 *   Keeps measurement fast and avoids scanning long files end-to-end.
 *
 * Uses `silenceremove` before `ebur128` to strip inter-sentence gaps.
 * Without this, sparse audio (TTS voice, instrument cues) has most of its
 * 400ms analysis windows fall below the ebur128 absolute gate (-70 LUFS),
 * causing integrated loudness to report -70 LUFS even when actual content
 * is at a perfectly normal level.
 *
 * Returns the measured LUFS value, or null if measurement fails.
 */
export const measureAudioLufs = (
  ffmpegPath: string,
  filePath: string,
  trimStart: number,
  maxDuration: number,
  onLog?: (chunk: string) => void
): Promise<number | null> => {
  return new Promise((resolve) => {
    const filters: string[] = [];
    if (trimStart > 0) {
      filters.push(`atrim=start=${trimStart.toFixed(3)}`);
      filters.push('asetpts=PTS-STARTPTS');
    }
    filters.push('silenceremove=stop_periods=-1:stop_threshold=-50dB:stop_duration=0.1');
    filters.push('asetpts=PTS-STARTPTS');
    filters.push('ebur128=peak=true');
    // -t before -i limits input decode time (fast path for long files).
    // -vn excludes embedded cover-art/video streams from the audio filter graph.
    const args = [
      ...(maxDuration > 0 ? ['-t', maxDuration.toFixed(3)] : []),
      '-i', filePath,
      '-vn',
      '-af', filters.join(','),
      '-f', 'null', '-'
    ];
    onLog?.(`[LUFS Measure] ffmpeg ${args.map(a => (a.includes(' ') ? `"${a}"` : a)).join(' ')}\n`);
    let stderr = '';
    const proc = spawn(ffmpegPath, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    proc.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });
    proc.on('error', () => resolve(null));
    proc.on('close', () => {
      // ebur128 prints real-time "I: -70 LUFS" lines before any gated audio accumulates.
      // The FIRST match is always -70; the LAST match is the correct Summary value.
      // Use matchAll + last element to get the final integrated loudness.
      const matches = [...stderr.matchAll(/\bI:\s*([\-\d.]+)\s*LUFS/g)];
      const lastMatch = matches[matches.length - 1];
      if (lastMatch) {
        const val = Number(lastMatch[1]);
        if (Number.isFinite(val)) {
          onLog?.(`[LUFS Measure] "${path.basename(filePath)}" → ${val.toFixed(1)} LUFS\n`);
          resolve(val);
          return;
        }
      }
      onLog?.(`[LUFS Measure] Failed to parse LUFS for "${path.basename(filePath)}", defaulting to 0 dB gain\n`);
      resolve(null);
    });
  });
};

// ─── Utility Functions ────────────────────────────────────────────────

/**
 * Escape path for FFmpeg filter graph (escape special chars)
 */
export const escapeFilterPath = (value: string) => value.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\'");

/**
 * Clamp a number to a range
 */
export const clampRender = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/**
 * Parse blur region effects from raw config
 */
export const parseBlurRegionEffects = (raw: unknown): BlurRegionEffect[] => {
  if (!Array.isArray(raw)) return [];
  const out: BlurRegionEffect[] = [];
  raw.forEach(item => {
    if (!item || typeof item !== 'object') return;
    const o = item as Record<string, unknown>;
    if (o.type !== 'blur_region') return;
    const sigma = o.sigma === undefined || o.sigma === null ? 15 : clampRender(Number(o.sigma), 0.5, 80);
    if (!Number.isFinite(sigma)) return;
    const feather = o.feather === undefined || o.feather === null ? 0 : clampRender(Number(o.feather), 0, BLUR_FEATHER_MAX);
    if (!Number.isFinite(feather)) return;

    let left: number;
    let right: number;
    let top: number;
    let bottom: number;
    if (
      o.left !== undefined ||
      o.right !== undefined ||
      o.top !== undefined ||
      o.bottom !== undefined
    ) {
      left = clampRender(Number(o.left), 0, 100);
      right = clampRender(Number(o.right), 0, 100);
      top = clampRender(Number(o.top), 0, 100);
      bottom = clampRender(Number(o.bottom), 0, 100);
    } else {
      const x = clampRender(Number(o.x), 0, 100);
      const y = clampRender(Number(o.y), 0, 100);
      const w = clampRender(Number(o.w), 0, 100);
      const h = clampRender(Number(o.h), 0, 100);
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(w) || !Number.isFinite(h)) return;
      if (w <= 0 || h <= 0) return;
      left = x;
      top = y;
      right = clampRender(100 - x - w, 0, 100);
      bottom = clampRender(100 - y - h, 0, 100);
    }

    if (!Number.isFinite(left) || !Number.isFinite(right) || !Number.isFinite(top) || !Number.isFinite(bottom)) return;
    if (left + right >= 100 || top + bottom >= 100) return;
    out.push({ type: 'blur_region', left, right, top, bottom, sigma, feather });
  });
  return out;
};

/**
 * Summarize render config for debug logging
 */
export const summarizeRenderConfigForDebug = (config: RenderConfigV2) => ({
  timeline: {
    duration: config.timeline.duration,
    resolution: config.timeline.resolution,
    framerate: config.timeline.framerate
  },
  items: (config.items ?? []).map(item => ({
    id: item.id,
    type: item.type,
    timeline: item.timeline ?? null,
    text: item.type === 'text'
      ? {
        start: Number.isFinite(item.text?.start) ? Number(item.text?.start) : null,
        end: Number.isFinite(item.text?.end) ? Number(item.text?.end) : null,
        matchDuration: item.text?.matchDuration ?? null
      }
      : undefined
  }))
});
