/**
 * FFprobe Utilities Module - Media file analysis
 */

import { spawn } from 'child_process';

// ─── FFprobe Binary Wrappers ──────────────────────────────────────────

const runFfprobeWithBin = (bin: string, input: string) => new Promise<number>((resolve, reject) => {
  const args = [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    input
  ];
  const proc = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  let error = '';
  proc.stdout.on('data', data => { output += data.toString(); });
  proc.stderr.on('data', data => { error += data.toString(); });
  proc.on('error', reject);
  proc.on('close', code => {
    if (code !== 0) {
      reject(new Error(error || `ffprobe exited with code ${code}`));
      return;
    }
    const value = Number.parseFloat(output.trim());
    resolve(Number.isFinite(value) ? value : 0);
  });
});

const runFfprobeSampleRateWithBin = (bin: string, input: string) => new Promise<number>((resolve, reject) => {
  const args = [
    '-v', 'error',
    '-select_streams', 'a:0',
    '-show_entries', 'stream=sample_rate',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    input
  ];
  const proc = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  let error = '';
  proc.stdout.on('data', data => { output += data.toString(); });
  proc.stderr.on('data', data => { error += data.toString(); });
  proc.on('error', reject);
  proc.on('close', code => {
    if (code !== 0) {
      reject(new Error(error || `ffprobe exited with code ${code}`));
      return;
    }
    const value = Number.parseInt(output.trim(), 10);
    resolve(Number.isFinite(value) ? value : 0);
  });
});

const runFfprobeStreamSamplesWithBin = (bin: string, input: string) => new Promise<{ durationTs: number; sampleRate: number; timeBase: string }>((resolve, reject) => {
  const args = [
    '-v', 'error',
    '-select_streams', 'a:0',
    '-show_entries', 'stream=duration_ts,sample_rate,time_base',
    '-of', 'default=noprint_wrappers=1:nokey=0',
    input
  ];
  const proc = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  let error = '';
  proc.stdout.on('data', data => { output += data.toString(); });
  proc.stderr.on('data', data => { error += data.toString(); });
  proc.on('error', reject);
  proc.on('close', code => {
    if (code !== 0) {
      reject(new Error(error || `ffprobe exited with code ${code}`));
      return;
    }
    const values = new Map<string, string>();
    output.split(/\r?\n/).forEach(raw => {
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

const runFfprobeStartTimeWithBin = (bin: string, input: string) => new Promise<number>((resolve, reject) => {
  const args = [
    '-v', 'error',
    '-show_entries', 'format=start_time',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    input
  ];
  const proc = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  let error = '';
  proc.stdout.on('data', data => { output += data.toString(); });
  proc.stderr.on('data', data => { error += data.toString(); });
  proc.on('error', reject);
  proc.on('close', code => {
    if (code !== 0) {
      reject(new Error(error || `ffprobe exited with code ${code}`));
      return;
    }
    const value = Number.parseFloat(output.trim());
    resolve(Number.isFinite(value) ? value : 0);
  });
});

// ─── Public API (uses FFPROBE_PATH env) ────────────────────────────────

export const runFfprobe = async (input: string): Promise<number> => {
  try {
    return await runFfprobeWithBin(process.env.FFPROBE_PATH ?? 'ffprobe', input);
  } catch (error) {
    console.error('runFfprobe error:', error);
    return 0;
  }
};

export const runFfprobeSampleRate = async (input: string): Promise<number> => {
  try {
    return await runFfprobeSampleRateWithBin(process.env.FFPROBE_PATH ?? 'ffprobe', input);
  } catch (error) {
    console.error('runFfprobeSampleRate error:', error);
    return 0;
  }
};

export const runFfprobeStreamSamples = async (input: string): Promise<{ durationTs: number; sampleRate: number; timeBase: string }> => {
  try {
    return await runFfprobeStreamSamplesWithBin(process.env.FFPROBE_PATH ?? 'ffprobe', input);
  } catch (error) {
    console.error('runFfprobeStreamSamples error:', error);
    return { durationTs: 0, sampleRate: 0, timeBase: '0/1' };
  }
};

export const runFfprobeStartTime = async (input: string): Promise<number> => {
  try {
    return await runFfprobeStartTimeWithBin(process.env.FFPROBE_PATH ?? 'ffprobe', input);
  } catch (error) {
    console.error('runFfprobeStartTime error:', error);
    return 0;
  }
};
