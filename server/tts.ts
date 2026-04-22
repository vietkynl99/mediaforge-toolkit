import express from 'express';
import { spawn } from 'child_process';
import fs from 'fs/promises';
import crypto from 'crypto';
import os from 'os';
import path from 'path';
import { MEDIA_VAULT_ROOT, UVR_OUTPUT_DIRNAME } from './constants.js';
import { parseAssCues, parseSrtVttCues, stripUtf8Bom, type SubtitleCue } from './subtitleCues.js';

type TtsRequestBody = {
  text?: string;
  inputPath?: string;
  voice?: string;
  rate?: number;
  pitch?: number;
  volume?: number;
  overlapMode?: 'overlap' | 'truncate';
  removeLineBreaks?: boolean;
};

const TTS_CUE_CONCURRENCY = Math.max(
  1,
  Math.min(
    8,
    Number.isFinite(Number(process.env.TTS_CUE_CONCURRENCY))
      ? Number(process.env.TTS_CUE_CONCURRENCY)
      : 3
  )
);
const DEFAULT_VOICE = 'vi-VN-HoaiMyNeural';
const DEFAULT_OUTPUT_EXT = 'mp3';
const TTS_CUE_OUTPUT_EXT = 'wav';
const TTS_INTERNAL_SAMPLE_RATE = 24000;
const TTS_INTERNAL_CHANNELS = 1;
const TTS_MIX_SEGMENT_SECONDS = Math.max(
  120,
  Math.min(
    300,
    Number.isFinite(Number(process.env.TTS_MIX_SEGMENT_SECONDS))
      ? Number(process.env.TTS_MIX_SEGMENT_SECONDS)
      : 180
  )
);
const TTS_MP3_BITRATE_KBPS = Math.max(
  64,
  Math.min(
    320,
    Number.isFinite(Number(process.env.TTS_MP3_BITRATE_KBPS))
      ? Number(process.env.TTS_MP3_BITRATE_KBPS)
      : 128
  )
);
const TTS_DEBUG_TIMING =
  ['1', 'true', 'yes', 'on'].includes((process.env.TTS_DEBUG_TIMING ?? '').toLowerCase());
const SUBTITLE_EXT = new Set(['.srt', '.vtt', '.ass', '.ssa', '.sub']);
const PITCH_BASE_HZ = 200;
const TTS_CUE_CACHE_DIRNAME = '.mediaforge/tts-cue-cache';

export const ttsRouter = express.Router();

const resolveSafePath = (value: string) => {
  if (!value) return null;
  const normalized = path.normalize(value);
  if (path.isAbsolute(normalized)) {
    return normalized.startsWith(path.resolve(MEDIA_VAULT_ROOT)) ? normalized : null;
  }
  const rootPath = path.resolve(MEDIA_VAULT_ROOT);
  const fullPath = path.resolve(MEDIA_VAULT_ROOT, normalized);
  if (!fullPath.startsWith(`${rootPath}${path.sep}`) && fullPath !== rootPath) {
    return null;
  }
  return fullPath;
};

const formatRate = (value?: number) => {
  if (value === undefined || value === null) return undefined;
  if (!Number.isFinite(value) || value <= 0) return undefined;
  if (value === 1) return undefined;
  const percent = Math.round((value - 1) * 100);
  return `${percent >= 0 ? '+' : ''}${percent}%`;
};

const formatVolume = (value?: number) => {
  if (value === undefined || value === null) return undefined;
  if (!Number.isFinite(value) || value <= 0) return undefined;
  const percent = Math.round((value - 1) * 100);
  return `${percent >= 0 ? '+' : ''}${percent}%`;
};

const formatPitch = (value?: number) => {
  if (value === undefined || value === null) return undefined;
  if (!Number.isFinite(value)) return undefined;
  if (value === 0) return undefined;
  const ratio = Math.pow(2, value / 12);
  const deltaHz = Math.round(PITCH_BASE_HZ * (ratio - 1));
  const signed = deltaHz >= 0 ? `+${deltaHz}` : `${deltaHz}`;
  return `${signed}Hz`;
};

const EDGE_TTS_MAX_RETRIES = Number(process.env.EDGE_TTS_MAX_RETRIES ?? 5);
const EDGE_TTS_RETRY_DELAY_MS = 700;

type CueCacheIdentity = {
  sourceRelativePath: string;
  cueIndex: number;
  cueStartMs: number;
  cueEndMs: number;
  cueText: string;
  voice: string;
  volume: string | null;
  removeLineBreaks: boolean;
  outputExt: string;
  engineCommand: string;
};

type CueCacheMeta = {
  createdAt: string;
  audioPath: string;
  sampleRateHz: number;
  identity: CueCacheIdentity;
};

type CueFxCacheIdentity = {
  baseCueKey: string;
  cueIndex: number;
  rate: number;
  pitch: number;
  outputExt: string;
  engine: 'ffmpeg';
};

type CueFxCacheMeta = {
  createdAt: string;
  audioPath: string;
  identity: CueFxCacheIdentity;
  filter: string;
};

const fileExists = async (fullPath: string) =>
  fs.access(fullPath).then(() => true).catch(() => false);

const toCueCacheKey = (identity: CueCacheIdentity) =>
  crypto.createHash('sha256').update(JSON.stringify(identity)).digest('hex').slice(0, 24);

const buildCueCacheIdentity = (
  sourceRelativePath: string,
  cue: SubtitleCue,
  cueIndex: number,
  voice: string,
  volume: string | undefined,
  removeLineBreaks: boolean,
  outputExt: string,
  engineCommand: string
): CueCacheIdentity => ({
  sourceRelativePath,
  cueIndex,
  cueStartMs: Math.max(0, Math.round(cue.start * 1000)),
  cueEndMs: Math.max(0, Math.round(cue.end * 1000)),
  cueText: cue.text,
  voice,
  volume: volume ?? null,
  removeLineBreaks,
  outputExt,
  engineCommand,
});

const buildCueCachePaths = (projectRoot: string, cueIndex: number, key: string, outputExt: string) => {
  const cacheDir = path.join(projectRoot, TTS_CUE_CACHE_DIRNAME);
  const stem = `cue-${String(cueIndex + 1).padStart(4, '0')}-${key}`;
  return {
    cacheDir,
    audioPath: path.join(cacheDir, `${stem}.${outputExt}`),
    metaPath: path.join(cacheDir, `${stem}.json`)
  };
};

const readCueCacheMeta = async (metaPath: string): Promise<CueCacheMeta | null> => {
  try {
    const raw = await fs.readFile(metaPath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.identity) return null;
    return parsed as CueCacheMeta;
  } catch {
    return null;
  }
};

const sameCueIdentity = (left: CueCacheIdentity, right: CueCacheIdentity) =>
  left.sourceRelativePath === right.sourceRelativePath &&
  left.cueIndex === right.cueIndex &&
  left.cueStartMs === right.cueStartMs &&
  left.cueEndMs === right.cueEndMs &&
  left.cueText === right.cueText &&
  left.voice === right.voice &&
  left.volume === right.volume &&
  left.removeLineBreaks === right.removeLineBreaks &&
  left.outputExt === right.outputExt &&
  left.engineCommand === right.engineCommand;

const sanitizeRateFactor = (value?: number) => {
  if (value === undefined || value === null || !Number.isFinite(value) || value <= 0) return 1;
  return value;
};

const sanitizePitchSemitones = (value?: number) => {
  if (value === undefined || value === null || !Number.isFinite(value)) return 0;
  return value;
};

const roundFactor = (value: number) => Math.round(value * 1_000_000) / 1_000_000;

const buildAtempoFilters = (factor: number): string[] => {
  const out: string[] = [];
  let remaining = factor;
  if (!Number.isFinite(remaining) || remaining <= 0) return out;
  while (remaining > 2.0) {
    out.push('atempo=2.0');
    remaining /= 2.0;
  }
  while (remaining < 0.5) {
    out.push('atempo=0.5');
    remaining /= 0.5;
  }
  const rounded = roundFactor(remaining);
  if (Math.abs(rounded - 1) > 0.000001) {
    out.push(`atempo=${rounded}`);
  }
  return out;
};

const buildCueFxFilter = (rate: number, pitchSemitones: number, sampleRateHz: number): string | null => {
  const safeRate = sanitizeRateFactor(rate);
  const safePitch = sanitizePitchSemitones(pitchSemitones);
  const safeSampleRate = Number.isFinite(sampleRateHz) && sampleRateHz > 0
    ? Math.round(sampleRateHz)
    : TTS_INTERNAL_SAMPLE_RATE;
  const pitchRatio = Math.pow(2, safePitch / 12);
  const filters: string[] = [];
  if (Math.abs(safePitch) > 0.000001) {
    const shiftedRate = Math.max(1000, Math.round(safeSampleRate * pitchRatio));
    filters.push(`asetrate=${shiftedRate}`);
    filters.push(`aresample=${safeSampleRate}`);
    filters.push(...buildAtempoFilters(1 / pitchRatio));
  }
  if (Math.abs(safeRate - 1) > 0.000001) {
    filters.push(...buildAtempoFilters(safeRate));
  }
  filters.push(`aresample=${TTS_INTERNAL_SAMPLE_RATE}`);
  return filters.length ? filters.join(',') : null;
};

const MIX_TIMING_EPSILON = 0.0005;

const buildCueFxCachePaths = (projectRoot: string, cueIndex: number, key: string, outputExt: string) => {
  const cacheDir = path.join(projectRoot, TTS_CUE_CACHE_DIRNAME);
  const stem = `cue-${String(cueIndex + 1).padStart(4, '0')}-fx-${key}`;
  return {
    cacheDir,
    audioPath: path.join(cacheDir, `${stem}.${outputExt}`),
    metaPath: path.join(cacheDir, `${stem}.json`)
  };
};

const readCueFxMeta = async (metaPath: string): Promise<CueFxCacheMeta | null> => {
  try {
    const raw = await fs.readFile(metaPath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.identity) return null;
    return parsed as CueFxCacheMeta;
  } catch {
    return null;
  }
};

const sameCueFxIdentity = (left: CueFxCacheIdentity, right: CueFxCacheIdentity) =>
  left.baseCueKey === right.baseCueKey &&
  left.cueIndex === right.cueIndex &&
  Math.abs(left.rate - right.rate) < 0.000001 &&
  Math.abs(left.pitch - right.pitch) < 0.000001 &&
  left.outputExt === right.outputExt &&
  left.engine === right.engine;

const escapeConcatFilePath = (value: string) => value.replace(/'/g, `'\\''`);

const runFfprobeDuration = async (input: string) => {
  const tryBin = async (bin: string) => await new Promise<number>((resolve, reject) => {
    const args = [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      input
    ];
    const proc = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', data => {
      stdout += data.toString();
    });
    proc.stderr.on('data', data => {
      stderr += data.toString();
    });
    proc.on('error', reject);
    proc.on('close', code => {
      if (code !== 0) {
        reject(new Error(stderr || `ffprobe exited with code ${code}`));
        return;
      }
      const value = Number.parseFloat(stdout.trim());
      resolve(Number.isFinite(value) ? value : 0);
    });
  });
  try {
    return await tryBin(process.env.FFPROBE_PATH ?? 'ffprobe');
  } catch (error) {
    if (error instanceof Error && error.message.includes('ENOENT')) {
      return await tryBin('/usr/bin/ffprobe');
    }
    throw error;
  }
};

const runFfprobeStreamSamples = async (input: string) => {
  const tryBin = async (bin: string) => await new Promise<{ durationTs: number; sampleRate: number; timeBase: string }>((resolve, reject) => {
    const args = [
      '-v', 'error',
      '-select_streams', 'a:0',
      '-show_entries', 'stream=duration_ts,sample_rate,time_base',
      '-of', 'default=noprint_wrappers=1:nokey=0',
      input
    ];
    const proc = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', data => {
      stdout += data.toString();
    });
    proc.stderr.on('data', data => {
      stderr += data.toString();
    });
    proc.on('error', reject);
    proc.on('close', code => {
      if (code !== 0) {
        reject(new Error(stderr || `ffprobe exited with code ${code}`));
        return;
      }
      const values = new Map<string, string>();
      stdout.split(/\r?\n/).forEach(raw => {
        const line = raw.trim();
        if (!line) return;
        const idx = line.indexOf('=');
        if (idx <= 0) return;
        values.set(line.slice(0, idx), line.slice(idx + 1));
      });
      const sampleRate = Number.parseInt(values.get('sample_rate') ?? '', 10);
      const durationTs = Number.parseInt(values.get('duration_ts') ?? '', 10);
      const timeBase = values.get('time_base') ?? '0/1';
      resolve({
        durationTs: Number.isFinite(durationTs) ? durationTs : 0,
        sampleRate: Number.isFinite(sampleRate) ? sampleRate : 0,
        timeBase
      });
    });
  });
  try {
    return await tryBin(process.env.FFPROBE_PATH ?? 'ffprobe');
  } catch (error) {
    if (error instanceof Error && error.message.includes('ENOENT')) {
      return await tryBin('/usr/bin/ffprobe');
    }
    throw error;
  }
};

const runFfprobeSampleRate = async (input: string) => {
  const tryBin = async (bin: string) => await new Promise<number>((resolve, reject) => {
    const args = [
      '-v', 'error',
      '-select_streams', 'a:0',
      '-show_entries', 'stream=sample_rate',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      input
    ];
    const proc = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', data => {
      stdout += data.toString();
    });
    proc.stderr.on('data', data => {
      stderr += data.toString();
    });
    proc.on('error', reject);
    proc.on('close', code => {
      if (code !== 0) {
        reject(new Error(stderr || `ffprobe exited with code ${code}`));
        return;
      }
      const value = Number.parseInt(stdout.trim(), 10);
      resolve(Number.isFinite(value) ? value : 0);
    });
  });
  try {
    return await tryBin(process.env.FFPROBE_PATH ?? 'ffprobe');
  } catch (error) {
    if (error instanceof Error && error.message.includes('ENOENT')) {
      return await tryBin('/usr/bin/ffprobe');
    }
    throw error;
  }
};

const shouldRetryEdgeTtsError = (message: string) => {
  return /429|rate limit|throttl|temporar|try again|server is busy|NoAudioReceived/i.test(message);
};

const runEdgeTtsWithRetry = async (command: string, args: string[]) => {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= EDGE_TTS_MAX_RETRIES; attempt += 1) {
    try {
      await new Promise<void>((resolve, reject) => {
        const proc = spawn(command, args);
        let errorOutput = '';
        let stdOutput = '';
        proc.stdout.on('data', data => {
          stdOutput += data.toString();
        });
        proc.stderr.on('data', data => {
          errorOutput += data.toString();
        });
        proc.on('error', reject);
        proc.on('close', code => {
          if (code !== 0) {
            const details = [errorOutput, stdOutput].filter(Boolean).join('\n');
            reject(new Error(details || `edge-tts exited with code ${code}`));
            return;
          }
          resolve();
        });
      });
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      lastError = error instanceof Error ? error : new Error(message);
      const retryable = shouldRetryEdgeTtsError(message);
      const attemptsLeft = EDGE_TTS_MAX_RETRIES - attempt;
      console.warn(`[edge-tts] attempt ${attempt} failed${retryable ? ' (retryable)' : ''}:`, message);
      if (!retryable || attemptsLeft <= 0) {
        break;
      }
      const delay = EDGE_TTS_RETRY_DELAY_MS * (2 ** (attempt - 1));
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw lastError ?? new Error('edge-tts failed after retries');
};

const listEdgeVoices = async () => {
  const command = process.env.EDGE_TTS_CMD?.trim() || 'edge-tts';
  const output = await new Promise<string>((resolve, reject) => {
    const proc = spawn(command, ['--list-voices']);
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', data => {
      stdout += data.toString();
    });
    proc.stderr.on('data', data => {
      stderr += data.toString();
    });
    proc.on('error', reject);
    proc.on('close', code => {
      if (code !== 0) {
        reject(new Error(stderr || `edge-tts --list-voices exited with code ${code}`));
        return;
      }
      resolve(stdout.trim());
    });
  });

  try {
    const parsed = JSON.parse(output);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // Fallback: parse table output
    const lines = output
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)
      .filter(line => !/^name\s/i.test(line) && !/^shortname\s/i.test(line));
    return lines.map(line => {
      const parts = line.split(/\s+/);
      const name = parts[0];
      const genderCandidate = parts[1];
      const gender = /^(male|female|neutral)$/i.test(genderCandidate) ? genderCandidate : undefined;
      const localeMatch = name?.match(/^([a-z]{2}-[A-Z]{2})-/);
      const locale = localeMatch?.[1];
      return {
        Name: name,
        ShortName: name,
        Locale: locale,
        Gender: gender
      };
    });
  }
};

let cachedVoices: Array<{
  Name: string;
  ShortName?: string;
  Locale?: string;
  Gender?: string;
}> = [];
let cachedVoicesError: string | null = null;

const voicesInitPromise = (async () => {
  try {
    cachedVoices = await listEdgeVoices();
  } catch (error) {
    cachedVoicesError = error instanceof Error ? error.message : String(error);
    cachedVoices = [];
  }
})();

ttsRouter.get('/voices', async (_req, res) => {
  try {
    await voicesInitPromise;
    if (cachedVoicesError) {
      res.status(500).json({ error: cachedVoicesError, voices: [] });
      return;
    }
    res.json({ voices: cachedVoices });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to list voices';
    res.status(500).json({ error: message, voices: [] });
  }
});

ttsRouter.post('/', async (req, res) => {
  const body = (req.body ?? {}) as TtsRequestBody;
  const inputPath = body.inputPath?.trim();
  const text = body.text?.trim();
  if (!text && !inputPath) {
    res.status(400).json({ error: 'Missing `text` or `inputPath` in request body.' });
    return;
  }

  const voice = body.voice?.trim() || DEFAULT_VOICE;
  const safeText = text ?? '';
  const outputExt = DEFAULT_OUTPUT_EXT;
  const cueOutputExt = TTS_CUE_OUTPUT_EXT;
  const rate = formatRate(body.rate);
  const pitch = formatPitch(body.pitch);
  const volume = formatVolume(body.volume);
  const fxRate = sanitizeRateFactor(body.rate);
  const fxPitch = sanitizePitchSemitones(body.pitch);
  const overlapMode = body.overlapMode === 'overlap' ? 'overlap' : 'truncate';
  const removeLineBreaks = body.removeLineBreaks !== false;
  const withFlagValue = (flag: string, value?: string) => {
    if (!value) return [];
    return [`${flag}=${value}`];
  };
  let responseTmpDir: string | null = null;
  const debugLog = (message: string) => {
    if (!TTS_DEBUG_TIMING) return;
    console.log(`[TTS_DEBUG] ${message}`);
  };

  try {
    let finalOutputPath: string;
    let outputRelativePath: string | null = null;
    let sourceRelativePath: string | null = null;
    let projectRoot: string | null = null;
    let subtitleCues: SubtitleCue[] | null = null;
    if (inputPath) {
      const fullPath = resolveSafePath(inputPath);
      if (!fullPath) {
        res.status(400).json({ error: 'Invalid inputPath' });
        return;
      }
      const ext = path.extname(fullPath).toLowerCase();
      if (!SUBTITLE_EXT.has(ext)) {
        res.status(400).json({ error: 'inputPath is not a subtitle file' });
        return;
      }
      const raw = stripUtf8Bom(await fs.readFile(fullPath, 'utf-8'));
      subtitleCues = ext === '.ass' || ext === '.ssa'
        ? parseAssCues(raw, removeLineBreaks)
        : parseSrtVttCues(raw, removeLineBreaks);
      if (!subtitleCues.length) {
        res.status(400).json({ error: 'Subtitle file has no usable cues' });
        return;
      }
      const projectName = inputPath.split(/[\\/]/)[0];
      if (!projectName) {
        res.status(400).json({ error: 'Invalid project path' });
        return;
      }
      projectRoot = path.join(MEDIA_VAULT_ROOT, projectName);
      const outputDir = path.join(projectRoot, UVR_OUTPUT_DIRNAME);
      await fs.mkdir(outputDir, { recursive: true });
      const baseName = path.basename(fullPath, ext);
      const outputName = `${baseName}.tts.${outputExt}`;
      finalOutputPath = path.join(outputDir, outputName);
      outputRelativePath = path.relative(MEDIA_VAULT_ROOT, finalOutputPath);
      sourceRelativePath = path.relative(MEDIA_VAULT_ROOT, fullPath);
    } else {
      responseTmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tts-'));
      finalOutputPath = path.join(responseTmpDir, `speech.${outputExt}`);
    }

    const command = process.env.EDGE_TTS_CMD?.trim() || 'edge-tts';

    if (subtitleCues) {
      if (!projectRoot || !sourceRelativePath) {
        throw new Error('Unable to resolve project path for subtitle TTS');
      }
      const cacheRoot = path.join(projectRoot, TTS_CUE_CACHE_DIRNAME);
      await fs.mkdir(cacheRoot, { recursive: true });
      const cuePathsArray: string[] = new Array(subtitleCues.length);
      const audioDurations: number[] = new Array(subtitleCues.length).fill(0);
      const ffmpegPath = await fs.access('/usr/bin/ffmpeg').then(() => '/usr/bin/ffmpeg').catch(() => 'ffmpeg');

      const processCue = async (i: number) => {
        const cue = subtitleCues[i];
        const identity = buildCueCacheIdentity(sourceRelativePath, cue, i, voice, volume, removeLineBreaks, cueOutputExt, command);
        const key = toCueCacheKey(identity);
        const { audioPath, metaPath } = buildCueCachePaths(projectRoot!, i, key, cueOutputExt);
        const existingMeta = await readCueCacheMeta(metaPath);
        if (await fileExists(audioPath) && !!existingMeta && sameCueIdentity(existingMeta.identity, identity)) {
          const srate = Number(existingMeta.sampleRateHz) || await runFfprobeSampleRate(audioPath).catch(() => 0);
          const fxFilter = buildCueFxFilter(fxRate, fxPitch, srate || TTS_INTERNAL_SAMPLE_RATE);
          if (!fxFilter) {
            cuePathsArray[i] = audioPath;
            audioDurations[i] = await runFfprobeDuration(audioPath).catch(() => Math.max(0, cue.end - cue.start));
            return;
          }
          const fxId = { baseCueKey: key, cueIndex: i, rate: roundFactor(fxRate), pitch: roundFactor(fxPitch), outputExt: cueOutputExt, engine: 'ffmpeg' } as const;
          const fxK = crypto.createHash('sha256').update(JSON.stringify(fxId)).digest('hex').slice(0, 24);
          const fxP = buildCueFxCachePaths(projectRoot!, i, fxK, cueOutputExt);
          const fxM = await readCueFxMeta(fxP.metaPath);
          if (await fileExists(fxP.audioPath) && !!fxM && sameCueFxIdentity(fxM.identity, fxId) && fxM.filter === fxFilter) {
            cuePathsArray[i] = fxP.audioPath;
            audioDurations[i] = await runFfprobeDuration(fxP.audioPath).catch(() => Math.max(0, cue.end - cue.start));
            return;
          }
          await new Promise((res, rej) => { const p = spawn(ffmpegPath, ['-y', '-i', audioPath, '-vn', '-filter:a', fxFilter, '-ar', String(TTS_INTERNAL_SAMPLE_RATE), '-ac', String(TTS_INTERNAL_CHANNELS), '-c:a', 'pcm_s16le', fxP.audioPath], { stdio: 'ignore' }); p.on('close', c => c === 0 ? res(0) : rej(new Error('fx failed'))); });
          await fs.writeFile(fxP.metaPath, JSON.stringify({ createdAt: new Date().toISOString(), audioPath: path.relative(projectRoot!, fxP.audioPath), identity: fxId, filter: fxFilter }, null, 2));
          cuePathsArray[i] = fxP.audioPath;
          audioDurations[i] = await runFfprobeDuration(fxP.audioPath).catch(() => Math.max(0, cue.end - cue.start));
          return;
        }
        await runEdgeTtsWithRetry(command, ['--text', cue.text, '--voice', voice, '--write-media', audioPath, ...withFlagValue('--volume', volume)]);
        const normP = `${audioPath}.norm.wav`;
        await new Promise((res, rej) => { const p = spawn(ffmpegPath, ['-y', '-i', audioPath, '-vn', '-ar', String(TTS_INTERNAL_SAMPLE_RATE), '-ac', String(TTS_INTERNAL_CHANNELS), '-c:a', 'pcm_s16le', normP], { stdio: 'ignore' }); p.on('close', c => c === 0 ? res(0) : rej(new Error('norm failed'))); });
        await fs.rename(normP, audioPath);
        const srate = await runFfprobeSampleRate(audioPath).catch(() => 0);
        await fs.writeFile(metaPath, JSON.stringify({ createdAt: new Date().toISOString(), audioPath: path.relative(projectRoot!, audioPath), sampleRateHz: srate, identity }, null, 2));
        const fxFilter = buildCueFxFilter(fxRate, fxPitch, srate || TTS_INTERNAL_SAMPLE_RATE);
        if (!fxFilter) {
          cuePathsArray[i] = audioPath;
          audioDurations[i] = await runFfprobeDuration(audioPath).catch(() => Math.max(0, cue.end - cue.start));
          return;
        }
        const fxId = { baseCueKey: key, cueIndex: i, rate: roundFactor(fxRate), pitch: roundFactor(fxPitch), outputExt: cueOutputExt, engine: 'ffmpeg' } as const;
        const fxK = crypto.createHash('sha256').update(JSON.stringify(fxId)).digest('hex').slice(0, 24);
        const fxP = buildCueFxCachePaths(projectRoot!, i, fxK, cueOutputExt);
        await new Promise((res, rej) => { const p = spawn(ffmpegPath, ['-y', '-i', audioPath, '-vn', '-filter:a', fxFilter, '-ar', String(TTS_INTERNAL_SAMPLE_RATE), '-ac', String(TTS_INTERNAL_CHANNELS), '-c:a', 'pcm_s16le', fxP.audioPath], { stdio: 'ignore' }); p.on('close', c => c === 0 ? res(0) : rej(new Error('fx failed'))); });
        await fs.writeFile(fxP.metaPath, JSON.stringify({ createdAt: new Date().toISOString(), audioPath: path.relative(projectRoot!, fxP.audioPath), identity: fxId, filter: fxFilter }, null, 2));
        cuePathsArray[i] = fxP.audioPath;
        audioDurations[i] = await runFfprobeDuration(fxP.audioPath).catch(() => Math.max(0, cue.end - cue.start));
      };

      const workers = Array.from({ length: Math.min(TTS_CUE_CONCURRENCY, subtitleCues.length) }, (_, idx) => (async () => {
        for (let i = idx; i < subtitleCues.length; i += TTS_CUE_CONCURRENCY) await processCue(i);
      })());
      await Promise.all(workers);

      const missingCueIndex = cuePathsArray.findIndex(cuePath => !cuePath);
      if (missingCueIndex !== -1) {
        throw new Error(`Missing processed cue audio at index ${missingCueIndex}`);
      }
      const cueEffectiveDurations = subtitleCues.map((cue, index) => {
        const cueDuration = Math.max(0, cue.end - cue.start);
        const audioDuration = Math.max(0, audioDurations[index] ?? cueDuration);
        return overlapMode === 'truncate' ? Math.min(audioDuration, cueDuration) : audioDuration;
      });
      const cueStartSamples = subtitleCues.map(cue => Math.max(0, Math.round(cue.start * TTS_INTERNAL_SAMPLE_RATE)));
      const cueEffectiveDurationSamples = cueEffectiveDurations.map(duration =>
        Math.max(0, Math.round(duration * TTS_INTERNAL_SAMPLE_RATE))
      );
      const usableCueIndices = subtitleCues.flatMap((cue, index) => {
        const effectiveDuration = Math.max(0, cueEffectiveDurations[index] ?? 0);
        return effectiveDuration > MIX_TIMING_EPSILON ? [index] : [];
      });
      if (!usableCueIndices.length) {
        throw new Error('No usable cue audio to mix');
      }
      const timelineEndSamples = usableCueIndices.reduce((acc, cueIndex) => {
        const cueEndSample = cueStartSamples[cueIndex] + Math.max(0, cueEffectiveDurationSamples[cueIndex] ?? 0);
        return Math.max(acc, cueEndSample);
      }, 0);
      if (TTS_DEBUG_TIMING) {
        const pick = Array.from(new Set([
          usableCueIndices[0],
          usableCueIndices[Math.floor(usableCueIndices.length / 2)],
          usableCueIndices[usableCueIndices.length - 1]
        ].filter((entry): entry is number => Number.isFinite(entry))));
        debugLog(
          `timeline samples: sampleRate=${TTS_INTERNAL_SAMPLE_RATE}, cues=${subtitleCues.length}, usableCues=${usableCueIndices.length}, timelineEndSamples=${timelineEndSamples}, timelineEndSeconds=${(timelineEndSamples / TTS_INTERNAL_SAMPLE_RATE).toFixed(6)}`
        );
        pick.forEach(cueIndex => {
          const cue = subtitleCues![cueIndex];
          const startSample = cueStartSamples[cueIndex];
          const durationSample = cueEffectiveDurationSamples[cueIndex];
          debugLog(
            `cue#${cueIndex + 1}: start=${cue.start.toFixed(3)}s(${startSample}), end=${cue.end.toFixed(3)}s, effectiveSamples=${durationSample}, textLen=${cue.text.length}`
          );
        });
      }
      if (timelineEndSamples <= 0) {
        throw new Error('No usable cue audio to mix');
      }

      const segmentLengthSamples = Math.max(1, Math.round(TTS_MIX_SEGMENT_SECONDS * TTS_INTERNAL_SAMPLE_RATE));
      const segmentCount = Math.max(1, Math.ceil(timelineEndSamples / segmentLengthSamples));
      const segmentDir = path.join(
        cacheRoot,
        `mix-segments-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
      );
      await fs.mkdir(segmentDir, { recursive: true });
      const segmentPaths: string[] = [];
      const segmentDurationsSeconds: number[] = [];
      try {
        for (let segmentIndex = 0; segmentIndex < segmentCount; segmentIndex += 1) {
          const t0Sample = segmentIndex * segmentLengthSamples;
          const t1Sample = Math.min(timelineEndSamples, t0Sample + segmentLengthSamples);
          const segmentDurationSamples = Math.max(1, t1Sample - t0Sample);
          const segmentPath = path.join(segmentDir, `segment-${String(segmentIndex).padStart(4, '0')}.wav`);
          const cuesInSegment = usableCueIndices.filter(cueIndex => {
            const cueStartSample = cueStartSamples[cueIndex];
            const cueEndSample = cueStartSample + Math.max(0, cueEffectiveDurationSamples[cueIndex] ?? 0);
            return cueEndSample > t0Sample && cueStartSample < t1Sample;
          });

          const inputArgs: string[] = [
            '-f',
            'lavfi',
            '-i',
            `anullsrc=r=${TTS_INTERNAL_SAMPLE_RATE}:cl=mono`
          ];
          const filterChains: string[] = [
            `[0:a]atrim=start_sample=0:end_sample=${segmentDurationSamples},asetpts=PTS-STARTPTS[base]`
          ];
          const mixInputs: string[] = ['[base]'];
          let inputIndex = 1;

          usableCueIndices.forEach(cueIndex => {
            const cue = subtitleCues![cueIndex];
            const effectiveDurationSamples = Math.max(0, cueEffectiveDurationSamples[cueIndex] ?? 0);
            if (effectiveDurationSamples <= 0) return;
            const cueStartSample = cueStartSamples[cueIndex];
            const cueEndSample = cueStartSample + effectiveDurationSamples;
            if (cueEndSample <= t0Sample || cueStartSample >= t1Sample) return;

            const sourceTrimStartSamples = Math.max(0, t0Sample - cueStartSample);
            const playStartSample = Math.max(cueStartSample, t0Sample);
            const playEndSample = Math.min(cueEndSample, t1Sample);
            const playDurationSamples = Math.max(0, playEndSample - playStartSample);
            if (playDurationSamples <= 0) return;

            const delaySamples = Math.max(0, playStartSample - t0Sample);
            const trimEndSample = sourceTrimStartSamples + playDurationSamples;
            inputArgs.push('-i', cuePathsArray[cueIndex]);
            filterChains.push(
              `[${inputIndex}:a]atrim=start_sample=${sourceTrimStartSamples}:end_sample=${trimEndSample},asetpts=PTS-STARTPTS,adelay=${delaySamples}S|${delaySamples}S,aresample=${TTS_INTERNAL_SAMPLE_RATE}[a${inputIndex}]`
            );
            mixInputs.push(`[a${inputIndex}]`);
            inputIndex += 1;
          });

          const filter = [
            ...filterChains,
            `${mixInputs.join('')}amix=inputs=${mixInputs.length}:duration=longest:dropout_transition=0[mix_raw]`,
            `[mix_raw]volume=${mixInputs.length.toFixed(4)},alimiter=limit=0.97[out]`
          ].join(';');
          const filterScriptPath = path.join(
            cacheRoot,
            `mix-filter-segment-${segmentIndex + 1}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.ffgraph`
          );
          await fs.writeFile(filterScriptPath, filter, 'utf-8');
          const ffmpegArgs = [
            '-y',
            ...inputArgs,
            '-filter_complex_script',
            filterScriptPath,
            '-map',
            '[out]',
            '-c:a',
            'pcm_s16le',
            '-ar',
            String(TTS_INTERNAL_SAMPLE_RATE),
            '-ac',
            String(TTS_INTERNAL_CHANNELS),
            segmentPath
          ];
          try {
            await new Promise<void>((resolve, reject) => {
              const proc = spawn(ffmpegPath, ffmpegArgs, { stdio: 'ignore' });
              proc.on('error', reject);
              proc.on('close', code => {
                if (code === 0) resolve();
                else reject(new Error(`ffmpeg exited with code ${code}`));
              });
            });
            if (TTS_DEBUG_TIMING) {
              const actualDuration = await runFfprobeDuration(segmentPath).catch(() => 0);
              debugLog(
                `segment#${segmentIndex + 1}/${segmentCount}: t0=${t0Sample}, t1=${t1Sample}, expected=${(segmentDurationSamples / TTS_INTERNAL_SAMPLE_RATE).toFixed(6)}s, actual=${actualDuration.toFixed(6)}s, cues=${cuesInSegment.length}`
              );
            }
          } finally {
            await fs.rm(filterScriptPath, { force: true }).catch(() => null);
          }
          segmentPaths.push(segmentPath);
          segmentDurationsSeconds.push(segmentDurationSamples / TTS_INTERNAL_SAMPLE_RATE);
        }

        const concatListPath = path.join(segmentDir, 'concat.txt');
        const concatLines = segmentPaths.flatMap((segmentPath, index) => {
          const duration = segmentDurationsSeconds[index] ?? 0;
          return [
            `file '${escapeConcatFilePath(segmentPath)}'`,
            `duration ${duration.toFixed(6)}`
          ];
        });
        await fs.writeFile(concatListPath, `${concatLines.join('\n')}\n`, 'utf-8');
        const destinationExt = path.extname(finalOutputPath).toLowerCase();
        const concatArgs = [
          '-y',
          '-f',
          'concat',
          '-safe',
          '0',
          '-i',
          concatListPath,
          ...(destinationExt === '.wav'
            ? ['-c:a', 'pcm_s16le']
            : ['-c:a', 'libmp3lame', '-b:a', `${TTS_MP3_BITRATE_KBPS}k`]),
          '-ar',
          String(TTS_INTERNAL_SAMPLE_RATE),
          '-ac',
          String(TTS_INTERNAL_CHANNELS),
          finalOutputPath
        ];
        await new Promise<void>((resolve, reject) => {
          const proc = spawn(ffmpegPath, concatArgs, { stdio: 'ignore' });
          proc.on('error', reject);
          proc.on('close', code => {
            if (code === 0) resolve();
            else reject(new Error(`ffmpeg exited with code ${code}`));
          });
        });
        if (TTS_DEBUG_TIMING) {
          const expectedDuration = segmentDurationsSeconds.reduce((acc, value) => acc + value, 0);
          const actualDuration = await runFfprobeDuration(finalOutputPath).catch(() => 0);
          const streamInfo = await runFfprobeStreamSamples(finalOutputPath).catch(() => ({ durationTs: 0, sampleRate: 0, timeBase: '0/1' }));
          const expectedSamples = Math.round(expectedDuration * TTS_INTERNAL_SAMPLE_RATE);
          const [tbNumRaw, tbDenRaw] = streamInfo.timeBase.split('/');
          const tbNum = Number.parseInt(tbNumRaw ?? '', 10);
          const tbDen = Number.parseInt(tbDenRaw ?? '', 10);
          const durationFromTsSeconds = tbDen > 0
            ? streamInfo.durationTs * (Number.isFinite(tbNum) ? tbNum : 0) / tbDen
            : 0;
          const streamSamples = Math.round(durationFromTsSeconds * Math.max(1, streamInfo.sampleRate || TTS_INTERNAL_SAMPLE_RATE));
          debugLog(
            `concat final: segments=${segmentPaths.length}, expected=${expectedDuration.toFixed(6)}s, actual=${actualDuration.toFixed(6)}s, diff=${(actualDuration - expectedDuration).toFixed(6)}s`
          );
          debugLog(
            `concat final stream: expectedSamples@${TTS_INTERNAL_SAMPLE_RATE}=${expectedSamples}, durationTs=${streamInfo.durationTs}, timeBase=${streamInfo.timeBase}, streamSampleRate=${streamInfo.sampleRate}, streamSamples=${streamSamples}, sampleDiff=${streamSamples - expectedSamples}`
          );
        }
      } finally {
        await fs.rm(segmentDir, { recursive: true, force: true }).catch(() => null);
      }
    } else {
      const args = [
        '--text',
        safeText,
        '--voice',
        voice,
        '--write-media',
        finalOutputPath
      ];
      args.push(...withFlagValue('--rate', rate));
      args.push(...withFlagValue('--pitch', pitch));
      args.push(...withFlagValue('--volume', volume));
      await runEdgeTtsWithRetry(command, args);
    }

    if (outputRelativePath) {
      res.json({ output: outputRelativePath });
      return;
    }
    const buffer = await fs.readFile(finalOutputPath);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', buffer.length.toString());
    res.send(buffer);
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    console.error('edge-tts error:', details);
    res.status(502).json({ error: 'edge-tts request failed.', details });
  } finally {
    if (responseTmpDir) {
      await fs.rm(responseTmpDir, { recursive: true, force: true }).catch(() => null);
    }
  }
});
