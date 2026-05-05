/**
 * Shared TTS utilities and constants
 * Used by both tts.ts router and index.ts job runner
 */

import crypto from 'crypto';

export const DEFAULT_TTS_VOICE = 'vi-VN-HoaiMyNeural';
export const DEFAULT_TTS_OUTPUT_EXT = 'mp3';
export const TTS_CUE_OUTPUT_EXT = 'wav';
export const TTS_INTERNAL_SAMPLE_RATE = 48000;
export const TTS_INTERNAL_CHANNELS = 1;
export const TTS_PITCH_BASE_HZ = 200;
export const TTS_CUE_CACHE_DIRNAME = '.mediaforge/tts-cue-cache';

export const TTS_CUE_CONCURRENCY = Math.max(
  1,
  Math.min(
    8,
    Number.isFinite(Number(process.env.TTS_CUE_CONCURRENCY))
      ? Number(process.env.TTS_CUE_CONCURRENCY)
      : 3
  )
);

export const TTS_MIX_SEGMENT_SECONDS = Math.max(
  120,
  Math.min(
    300,
    Number.isFinite(Number(process.env.TTS_MIX_SEGMENT_SECONDS))
      ? Number(process.env.TTS_MIX_SEGMENT_SECONDS)
      : 180
  )
);

export const TTS_MP3_BITRATE_KBPS = Math.max(
  64,
  Math.min(
    320,
    Number.isFinite(Number(process.env.TTS_MP3_BITRATE_KBPS))
      ? Number(process.env.TTS_MP3_BITRATE_KBPS)
      : 128
  )
);

export const TTS_DEBUG_TIMING =
  ['1', 'true', 'yes', 'on'].includes((process.env.TTS_DEBUG_TIMING ?? '').toLowerCase());

export const EDGE_TTS_MAX_RETRIES = Number(process.env.EDGE_TTS_MAX_RETRIES ?? 5);
export const EDGE_TTS_RETRY_DELAY_MS = 700;

/**
 * Format rate factor for edge-tts CLI
 */
export const formatTtsRate = (value?: number) => {
  if (value === undefined || value === null) return undefined;
  if (!Number.isFinite(value) || value <= 0) return undefined;
  if (value === 1) return undefined;
  const percent = Math.round((value - 1) * 100);
  return `${percent >= 0 ? '+' : ''}${percent}%`;
};

/**
 * Format pitch semitones for edge-tts CLI
 */
export const formatTtsPitch = (value?: number) => {
  if (value === undefined || value === null) return undefined;
  if (!Number.isFinite(value)) return undefined;
  if (value === 0) return undefined;
  const ratio = Math.pow(2, value / 12);
  const deltaHz = Math.round(TTS_PITCH_BASE_HZ * (ratio - 1));
  const signed = deltaHz >= 0 ? `+${deltaHz}` : `${deltaHz}`;
  return `${signed}Hz`;
};

/**
 * Sanitize rate factor, return default if invalid
 */
export const sanitizeRateFactor = (value?: number) => {
  if (value === undefined || value === null || !Number.isFinite(value) || value <= 0) return 1;
  return value;
};

/**
 * Sanitize pitch semitones, return default if invalid
 */
export const sanitizePitchSemitones = (value?: number) => {
  if (value === undefined || value === null || !Number.isFinite(value)) return 0;
  return value;
};

/**
 * Normalize TTS output settings with defaults
 */
export const normalizeTtsOutputSettings = (options?: {
  voice?: string;
  rate?: number;
  pitch?: number;
  overlapMode?: 'overlap' | 'truncate';
  removeLineBreaks?: boolean;
}): {
  voice: string;
  rate: number | undefined;
  pitch: number | undefined;
  overlapMode: 'overlap' | 'truncate';
  removeLineBreaks: boolean;
} => ({
  voice: options?.voice?.trim() || DEFAULT_TTS_VOICE,
  rate: typeof options?.rate === 'number' && Number.isFinite(options.rate) ? options.rate : undefined,
  pitch: typeof options?.pitch === 'number' && Number.isFinite(options.pitch) ? options.pitch : undefined,
  overlapMode: options?.overlapMode === 'overlap' ? 'overlap' : 'truncate',
  removeLineBreaks: options?.removeLineBreaks !== false
});

/**
 * Build TTS output signature for cache key
 */
export const buildTtsOutputSignature = (settings: {
  voice: string;
  rate?: number;
  pitch?: number;
  overlapMode: 'overlap' | 'truncate';
  removeLineBreaks: boolean;
}) => {
  const payload = {
    voice: settings.voice,
    rate: settings.rate ?? null,
    pitch: settings.pitch ?? null,
    overlapMode: settings.overlapMode,
    removeLineBreaks: settings.removeLineBreaks
  };
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 10);
};
