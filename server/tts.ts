import express from 'express';
import { spawn } from 'child_process';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

type TtsRequestBody = {
  text?: string;
  voice?: string;
  rate?: string;
  pitch?: string;
  volume?: string;
  lang?: string;
};

const DEFAULT_VOICE = 'vi-VN-HoaiMyNeural';
const DEFAULT_OUTPUT_EXT = 'mp3';

export const ttsRouter = express.Router();

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
  const text = body.text?.trim();

  if (!text) {
    res.status(400).json({ error: 'Missing `text` in request body.' });
    return;
  }

  const voice = body.voice?.trim() || DEFAULT_VOICE;
  const safeText = text;
  const outputExt = DEFAULT_OUTPUT_EXT;
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tts-'));
  const outputPath = path.join(tmpDir, `speech.${outputExt}`);
  const rate = body.rate ? String(body.rate) : undefined;
  const pitch = body.pitch ? String(body.pitch) : undefined;
  const volume = body.volume ? String(body.volume) : undefined;
  const withFlagValue = (flag: string, value?: string) => {
    if (!value) return [];
    return [`${flag}=${value}`];
  };

  try {
    const args = [
      '--text',
      safeText,
      '--voice',
      voice,
      '--write-media',
      outputPath
    ];
    args.push(...withFlagValue('--rate', rate));
    args.push(...withFlagValue('--pitch', pitch));
    args.push(...withFlagValue('--volume', volume));

    const command = process.env.EDGE_TTS_CMD?.trim() || 'edge-tts';
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
