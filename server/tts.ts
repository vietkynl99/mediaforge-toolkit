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

const DEFAULT_VOICE = 'vi-VN-HoaiMyNeural';
const DEFAULT_OUTPUT_EXT = 'mp3';
const TTS_CUE_OUTPUT_EXT = 'wav';
const TTS_INTERNAL_SAMPLE_RATE = 24000;
const TTS_INTERNAL_CHANNELS = 1;
const SUBTITLE_EXT = new Set(['.srt', '.vtt', '.ass', '.ssa', '.sub']);
const PITCH_BASE_HZ = 200;
const TTS_CUE_CACHE_DIRNAME = '.mediaforge/tts-cue-cache';
const MAX_AMIX_INPUTS = 1024;

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
  const stem = `cue-${String(cueIndex).padStart(4, '0')}-${key}`;
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

const buildCascadedAmixFilters = (inputLabels: string[]) => {
  if (!inputLabels.length) {
    throw new Error('No audio inputs to mix');
  }
  const filters: string[] = [];
  let stage = 0;
  let current = [...inputLabels];
  while (current.length > 1) {
    const next: string[] = [];
    for (let chunkStart = 0; chunkStart < current.length; chunkStart += MAX_AMIX_INPUTS) {
      const chunk = current.slice(chunkStart, chunkStart + MAX_AMIX_INPUTS);
      const chunkIndex = Math.floor(chunkStart / MAX_AMIX_INPUTS);
      const outLabel = `mix${stage}_${chunkIndex}`;
      filters.push(`${chunk.join('')}amix=inputs=${chunk.length}:duration=longest[${outLabel}]`);
      next.push(`[${outLabel}]`);
    }
    current = next;
    stage += 1;
  }
  return { filters, outputLabel: current[0] };
};

const buildCueFxCachePaths = (projectRoot: string, cueIndex: number, key: string, outputExt: string) => {
  const cacheDir = path.join(projectRoot, TTS_CUE_CACHE_DIRNAME);
  const stem = `cue-${String(cueIndex).padStart(4, '0')}-fx-${key}`;
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
      const cuePaths: string[] = [];
      const cacheRoot = path.join(projectRoot, TTS_CUE_CACHE_DIRNAME);
      await fs.mkdir(cacheRoot, { recursive: true });
      const ffmpegPath = await fs.access('/usr/bin/ffmpeg').then(() => '/usr/bin/ffmpeg').catch(() => 'ffmpeg');
      for (let i = 0; i < subtitleCues.length; i += 1) {
        const cue = subtitleCues[i];
        const identity = buildCueCacheIdentity(
          sourceRelativePath,
          cue,
          i,
          voice,
          volume,
          removeLineBreaks,
          cueOutputExt,
          command
        );
        const key = toCueCacheKey(identity);
        const { cacheDir, audioPath, metaPath } = buildCueCachePaths(projectRoot, i, key, cueOutputExt);
        await fs.mkdir(cacheDir, { recursive: true });
        const existingMeta = await readCueCacheMeta(metaPath);
        const reusable = await fileExists(audioPath) && !!existingMeta && sameCueIdentity(existingMeta.identity, identity);
        let sourceCuePath = audioPath;
        let sourceSampleRate = 0;
        if (reusable) {
          sourceCuePath = audioPath;
          const sampleRateFromMeta = Number((existingMeta as any).sampleRateHz);
          if (Number.isFinite(sampleRateFromMeta) && sampleRateFromMeta > 0) {
            sourceSampleRate = sampleRateFromMeta;
          } else {
            sourceSampleRate = await runFfprobeSampleRate(audioPath).catch(() => 0);
          }
        } else {
          const cuePath = audioPath;
          const args = [
            '--text',
            cue.text,
            '--voice',
            voice,
            '--write-media',
            cuePath
          ];
          args.push(...withFlagValue('--volume', volume));
          await runEdgeTtsWithRetry(command, args);
          const normalizedPath = `${cuePath}.norm.wav`;
          try {
            await new Promise<void>((resolve, reject) => {
              const proc = spawn(ffmpegPath, [
                '-y',
                '-i',
                cuePath,
                '-vn',
                '-ar',
                String(TTS_INTERNAL_SAMPLE_RATE),
                '-ac',
                String(TTS_INTERNAL_CHANNELS),
                '-c:a',
                'pcm_s16le',
                normalizedPath
              ], { stdio: 'ignore' });
              proc.on('error', reject);
              proc.on('close', code => {
                if (code === 0) resolve();
                else reject(new Error(`ffmpeg (cue normalize) exited with code ${code}`));
              });
            });
            await fs.rename(normalizedPath, cuePath);
          } finally {
            await fs.rm(normalizedPath, { force: true }).catch(() => null);
          }
          const meta: CueCacheMeta = {
            createdAt: new Date().toISOString(),
            audioPath: path.relative(projectRoot, cuePath),
            sampleRateHz: await runFfprobeSampleRate(cuePath).catch(() => 0),
            identity
          };
          await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
          sourceSampleRate = meta.sampleRateHz;
          sourceCuePath = cuePath;
        }

        if (!sourceSampleRate || sourceSampleRate <= 0) {
          sourceSampleRate = TTS_INTERNAL_SAMPLE_RATE;
        }
        const cueFxFilter = buildCueFxFilter(fxRate, fxPitch, sourceSampleRate);
        if (!cueFxFilter) {
          cuePaths.push(sourceCuePath);
          continue;
        }

        const fxIdentity: CueFxCacheIdentity = {
          baseCueKey: key,
          cueIndex: i,
          rate: roundFactor(fxRate),
          pitch: roundFactor(fxPitch),
          outputExt: cueOutputExt,
          engine: 'ffmpeg'
        };
        const fxKey = crypto.createHash('sha256').update(JSON.stringify(fxIdentity)).digest('hex').slice(0, 24);
        const fxPaths = buildCueFxCachePaths(projectRoot, i, fxKey, cueOutputExt);
        await fs.mkdir(fxPaths.cacheDir, { recursive: true });
        const fxMeta = await readCueFxMeta(fxPaths.metaPath);
        const fxReusable = await fileExists(fxPaths.audioPath)
          && !!fxMeta
          && sameCueFxIdentity(fxMeta.identity, fxIdentity)
          && fxMeta.filter === cueFxFilter;
        if (fxReusable) {
          cuePaths.push(fxPaths.audioPath);
          continue;
        }

        const fxArgs = [
          '-y',
          '-i',
          sourceCuePath,
          '-vn',
          '-filter:a',
          cueFxFilter,
          '-ar',
          String(TTS_INTERNAL_SAMPLE_RATE),
          '-ac',
          String(TTS_INTERNAL_CHANNELS),
          '-c:a',
          'pcm_s16le',
          fxPaths.audioPath
        ];
        await new Promise<void>((resolve, reject) => {
          const proc = spawn(ffmpegPath, fxArgs, { stdio: 'ignore' });
          proc.on('error', reject);
          proc.on('close', code => {
            if (code === 0) resolve();
            else reject(new Error(`ffmpeg (cue fx) exited with code ${code}`));
          });
        });
        const fxMetaPayload: CueFxCacheMeta = {
          createdAt: new Date().toISOString(),
          audioPath: path.relative(projectRoot, fxPaths.audioPath),
          identity: fxIdentity,
          filter: cueFxFilter
        };
        await fs.writeFile(fxPaths.metaPath, JSON.stringify(fxMetaPayload, null, 2), 'utf-8');
        cuePaths.push(fxPaths.audioPath);
      }

      const inputArgs = cuePaths.flatMap(cuePath => ['-i', cuePath]);
      const filterChains: string[] = [];
      const mixInputs: string[] = [];
      subtitleCues.forEach((cue, index) => {
        const delayMs = Math.max(0, Math.round(cue.start * 1000));
        const duration = Math.max(0, cue.end - cue.start);
        const trim = overlapMode === 'truncate' ? `atrim=0:${duration},` : '';
        filterChains.push(`[${index}:a]${trim}asetpts=PTS-STARTPTS,adelay=${delayMs}|${delayMs},aresample=async=1[a${index}]`);
        mixInputs.push(`[a${index}]`);
      });
      const mixPlan = buildCascadedAmixFilters(mixInputs);
      const filter = [
        ...filterChains,
        ...mixPlan.filters,
        `${mixPlan.outputLabel}anull[out]`
      ].join(';');
      const filterScriptPath = path.join(
        cacheRoot,
        `mix-filter-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.ffgraph`
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
        'libmp3lame',
        '-q:a',
        '4',
        '-ar',
        String(TTS_INTERNAL_SAMPLE_RATE),
        '-ac',
        String(TTS_INTERNAL_CHANNELS),
        finalOutputPath
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
      } finally {
        await fs.rm(filterScriptPath, { force: true }).catch(() => null);
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
