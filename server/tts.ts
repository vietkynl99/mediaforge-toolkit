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
  rate: string | null;
  pitch: string | null;
  volume: string | null;
  removeLineBreaks: boolean;
  outputExt: string;
  engineCommand: string;
};

type CueCacheMeta = {
  createdAt: string;
  audioPath: string;
  identity: CueCacheIdentity;
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
  rate: string | undefined,
  pitch: string | undefined,
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
  rate: rate ?? null,
  pitch: pitch ?? null,
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
  left.rate === right.rate &&
  left.pitch === right.pitch &&
  left.volume === right.volume &&
  left.removeLineBreaks === right.removeLineBreaks &&
  left.outputExt === right.outputExt &&
  left.engineCommand === right.engineCommand;

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
  const rate = formatRate(body.rate);
  const pitch = formatPitch(body.pitch);
  const volume = formatVolume(body.volume);
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
      for (let i = 0; i < subtitleCues.length; i += 1) {
        const cue = subtitleCues[i];
        const identity = buildCueCacheIdentity(
          sourceRelativePath,
          cue,
          i,
          voice,
          rate,
          pitch,
          volume,
          removeLineBreaks,
          outputExt,
          command
        );
        const key = toCueCacheKey(identity);
        const { cacheDir, audioPath, metaPath } = buildCueCachePaths(projectRoot, i, key, outputExt);
        await fs.mkdir(cacheDir, { recursive: true });
        const existingMeta = await readCueCacheMeta(metaPath);
        const reusable = await fileExists(audioPath) && !!existingMeta && sameCueIdentity(existingMeta.identity, identity);
        if (reusable) {
          cuePaths.push(audioPath);
          continue;
        }
        const cuePath = audioPath;
        const args = [
          '--text',
          cue.text,
          '--voice',
          voice,
          '--write-media',
          cuePath
        ];
        args.push(...withFlagValue('--rate', rate));
        args.push(...withFlagValue('--pitch', pitch));
        args.push(...withFlagValue('--volume', volume));
        await runEdgeTtsWithRetry(command, args);
        const meta: CueCacheMeta = {
          createdAt: new Date().toISOString(),
          audioPath: path.relative(projectRoot, cuePath),
          identity
        };
        await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
        cuePaths.push(cuePath);
      }

      const ffmpegPath = await fs.access('/usr/bin/ffmpeg').then(() => '/usr/bin/ffmpeg').catch(() => 'ffmpeg');
      const inputArgs = cuePaths.flatMap(cuePath => ['-i', cuePath]);
      const filterChains: string[] = [];
      const mixInputs: string[] = [];
      subtitleCues.forEach((cue, index) => {
        const delayMs = Math.max(0, Math.round(cue.start * 1000));
        const duration = Math.max(0, cue.end - cue.start);
        const trim = overlapMode === 'truncate' ? `atrim=0:${duration},` : '';
        filterChains.push(`[${index}:a]${trim}asetpts=PTS-STARTPTS,adelay=${delayMs}|${delayMs}[a${index}]`);
        mixInputs.push(`[a${index}]`);
      });
      const filter = `${filterChains.join(';')};${mixInputs.join('')}amix=inputs=${mixInputs.length}:duration=longest,loudnorm=I=-16:TP=-1.5:LRA=11[out]`;
      const ffmpegArgs = [
        '-y',
        ...inputArgs,
        '-filter_complex',
        filter,
        '-map',
        '[out]',
        '-c:a',
        'libmp3lame',
        '-q:a',
        '4',
        finalOutputPath
      ];
      await new Promise<void>((resolve, reject) => {
        const proc = spawn(ffmpegPath, ffmpegArgs, { stdio: 'ignore' });
        proc.on('error', reject);
        proc.on('close', code => {
          if (code === 0) resolve();
          else reject(new Error(`ffmpeg exited with code ${code}`));
        });
      });
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
