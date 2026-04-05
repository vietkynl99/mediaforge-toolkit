import express from 'express';
import { spawn } from 'child_process';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { MEDIA_VAULT_ROOT, UVR_OUTPUT_DIRNAME } from './constants.js';

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

type SubtitleCue = {
  start: number;
  end: number;
  text: string;
};

const sanitizeCueText = (value: string, removeLineBreaks: boolean) => {
  let cleaned = value
    .replace(/\{[^}]*\}/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\\[Nn]/g, removeLineBreaks ? ' ' : '\n');
  if (removeLineBreaks) {
    cleaned = cleaned.replace(/\s+/g, ' ');
  } else {
    cleaned = cleaned
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{2,}/g, '\n');
  }
  return cleaned.trim();
};

const parseSrtTimestamp = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(':');
  if (parts.length < 2 || parts.length > 3) return null;
  const secondsPart = parts[parts.length - 1];
  const minutePart = parts[parts.length - 2];
  const hourPart = parts.length === 3 ? parts[0] : '0';
  const secMatch = secondsPart.match(/^(\d{1,2})(?:[.,](\d{1,3}))?$/);
  if (!secMatch) return null;
  const hours = Number(hourPart);
  const minutes = Number(minutePart);
  const seconds = Number(secMatch[1]);
  const millis = secMatch[2] ? Number(secMatch[2].padEnd(3, '0')) : 0;
  if ([hours, minutes, seconds, millis].some(part => Number.isNaN(part))) return null;
  return hours * 3600 + minutes * 60 + seconds + millis / 1000;
};

const parseAssTimestamp = (value: string) => {
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d+):(\d{2}):(\d{2})[.](\d{1,2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  const centis = Number(match[4].padEnd(2, '0'));
  if ([hours, minutes, seconds, centis].some(part => Number.isNaN(part))) return null;
  return hours * 3600 + minutes * 60 + seconds + centis / 100;
};

const parseSrtVttCues = (content: string, removeLineBreaks: boolean) => {
  const lines = content.split(/\r?\n/);
  const cues: SubtitleCue[] = [];
  let currentStart: number | null = null;
  let currentEnd: number | null = null;
  let textLines: string[] = [];

  const flush = () => {
    if (currentStart === null || currentEnd === null) return;
    const text = sanitizeCueText(textLines.join(removeLineBreaks ? ' ' : '\n'), removeLineBreaks);
    if (text) {
      cues.push({ start: currentStart, end: currentEnd, text });
    }
    currentStart = null;
    currentEnd = null;
    textLines = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }
    if (line.startsWith('WEBVTT')) continue;
    if (line.startsWith('NOTE')) continue;
    if (/^\d+$/.test(line)) {
      continue;
    }
    if (line.includes('-->')) {
      flush();
      const [rawStart, rawEnd] = line.split('-->').map(part => part.trim().split(/\s+/)[0]);
      const start = parseSrtTimestamp(rawStart);
      const end = parseSrtTimestamp(rawEnd);
      if (start === null || end === null) {
        currentStart = null;
        currentEnd = null;
        textLines = [];
        continue;
      }
      if (end <= start) {
        currentStart = end;
        currentEnd = start;
      } else {
        currentStart = start;
        currentEnd = end;
      }
      continue;
    }
    if (currentStart !== null && currentEnd !== null) {
      textLines.push(line);
    }
  }

  flush();
  return cues;
};

const splitWithMax = (value: string, maxParts: number) => {
  if (maxParts <= 1) return [value];
  const parts: string[] = [];
  let rest = value;
  for (let i = 0; i < maxParts - 1; i += 1) {
    const index = rest.indexOf(',');
    if (index === -1) break;
    parts.push(rest.slice(0, index));
    rest = rest.slice(index + 1);
  }
  parts.push(rest);
  return parts;
};

const parseAssCues = (content: string, removeLineBreaks: boolean) => {
  const lines = content.split(/\r?\n/);
  let format: string[] | null = null;
  const cues: SubtitleCue[] = [];
  lines.forEach(line => {
    const trimmed = line.trim();
    if (!trimmed) return;
    if (trimmed.startsWith('Format:')) {
      format = trimmed
        .slice('Format:'.length)
        .split(',')
        .map(part => part.trim().toLowerCase());
      return;
    }
    if (!trimmed.startsWith('Dialogue:')) return;
    const payload = trimmed.slice('Dialogue:'.length).trim();
    const fields = splitWithMax(payload, format?.length ?? 10);
    const startIndex = format ? format.indexOf('start') : 1;
    const endIndex = format ? format.indexOf('end') : 2;
    const textIndex = format ? format.indexOf('text') : 9;
    if (startIndex < 0 || endIndex < 0 || textIndex < 0) return;
    const start = parseAssTimestamp(fields[startIndex] ?? '');
    const end = parseAssTimestamp(fields[endIndex] ?? '');
    if (start === null || end === null || end <= start) return;
    const text = sanitizeCueText(fields.slice(textIndex).join(','), removeLineBreaks);
    if (!text) return;
    cues.push({ start, end, text });
  });
  return cues;
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
  let safeText = text ?? '';
  const outputExt = DEFAULT_OUTPUT_EXT;
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tts-'));
  const outputPath = path.join(tmpDir, `speech.${outputExt}`);
  const rate = formatRate(body.rate);
  const pitch = formatPitch(body.pitch);
  const volume = formatVolume(body.volume);
  const overlapMode = body.overlapMode === 'overlap' ? 'overlap' : 'truncate';
  const removeLineBreaks = body.removeLineBreaks !== false;
  const withFlagValue = (flag: string, value?: string) => {
    if (!value) return [];
    return [`${flag}=${value}`];
  };

  try {
    let finalOutputPath = outputPath;
    let outputRelativePath: string | null = null;
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
      const raw = await fs.readFile(fullPath, 'utf-8');
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
      const projectRoot = path.join(MEDIA_VAULT_ROOT, projectName);
      const outputDir = path.join(projectRoot, UVR_OUTPUT_DIRNAME);
      await fs.mkdir(outputDir, { recursive: true });
      const baseName = path.basename(fullPath, ext);
      const outputName = `${baseName}.tts.${outputExt}`;
      finalOutputPath = path.join(outputDir, outputName);
      outputRelativePath = path.relative(MEDIA_VAULT_ROOT, finalOutputPath);
    }

    const command = process.env.EDGE_TTS_CMD?.trim() || 'edge-tts';

    if (subtitleCues) {
      const cuePaths: string[] = [];
      for (let i = 0; i < subtitleCues.length; i += 1) {
        const cue = subtitleCues[i];
        const cuePath = path.join(tmpDir, `cue-${String(i).padStart(4, '0')}.${outputExt}`);
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
    }

    if (outputRelativePath) {
      res.json({ output: outputRelativePath });
      return;
    }
    const buffer = await fs.readFile(outputPath);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', buffer.length.toString());
    res.send(buffer);
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    console.error('edge-tts error:', details);
    res.status(502).json({ error: 'edge-tts request failed.', details });
  } finally {
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  }
});
