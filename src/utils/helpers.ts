export const formatDurationMs = (ms: number) => {
  if (!Number.isFinite(ms) || ms < 0) return '--';
  const totalSeconds = Math.round(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;
  }
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
};

export const formatLocalDateTime = (value?: string) => {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--';
  return new Intl.DateTimeFormat('vi-VN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(date);
};

export const coerceNumber = (value: string | number | null | undefined, fallback?: number) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return fallback;
};

export const parseResolution = (value: string | null | undefined, fallback = { w: 1920, h: 1080 }) => {
  if (!value) return fallback;
  const match = String(value).trim().match(/(\d+)\s*[x×]\s*(\d+)/i);
  if (!match) return fallback;
  const w = Number(match[1]);
  const h = Number(match[2]);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return fallback;
  return { w: Math.round(w), h: Math.round(h) };
};

export const parseDurationToSeconds = (value?: string) => {
  if (!value) return 0;
  const parts = value.split(':').map(Number);
  if (parts.some(p => !Number.isFinite(p))) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 1) return parts[0];
  return 0;
};

export const formatDuration = (seconds?: number) => {
  if (seconds === undefined || seconds === null || seconds <= 0) return undefined;
  const total = Math.floor(seconds);
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hrs > 0) return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  return `${mins}:${String(secs).padStart(2, '0')}`;
};

export const num = (v: unknown, fb: number) => coerceNumber(v as string | number | null | undefined, fb) ?? fb;

export const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export const toEdgeTtsRate = (value: string) => {
  const trimmed = value.trim().replace(',', '.');
  if (!trimmed) return '';
  if (/^[+-]?\d+%$/.test(trimmed)) return trimmed;
  const numeric = Number(trimmed);
  if (!Number.isFinite(numeric) || numeric <= 0) return trimmed;
  const percent = Math.round((numeric - 1) * 100);
  return `${percent >= 0 ? '+' : ''}${percent}%`;
};

const PITCH_BASE_HZ = 200;

export const toEdgeTtsPitch = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const numeric = Number(trimmed);
  if (!Number.isFinite(numeric)) return trimmed;
  if (numeric === 0) return '+0Hz';
  const ratio = Math.pow(2, numeric / 12);
  const deltaHz = Math.round(PITCH_BASE_HZ * (ratio - 1));
  const signed = deltaHz >= 0 ? `+${deltaHz}` : `${deltaHz}`;
  return `${signed}Hz`;
};

export const fromEdgeTtsPitch = (value?: string) => {
  const trimmed = value?.trim();
  if (!trimmed) return '';
  const match = trimmed.match(/^([+-])(\d+)\s*Hz$/i);
  if (!match) return trimmed;
  const sign = match[1] === '-' ? -1 : 1;
  const delta = Number(match[2]);
  if (!Number.isFinite(delta)) return trimmed;
  const ratio = 1 + sign * (delta / PITCH_BASE_HZ);
  if (ratio <= 0) return trimmed;
  const semitone = 12 * Math.log2(ratio);
  return `${Math.round(semitone * 100) / 100}`;
};

export const fromEdgeTtsRate = (value?: string) => {
  const trimmed = value?.trim();
  if (!trimmed) return '';
  const match = trimmed.match(/^([+-])(\d+)%$/);
  if (!match) return trimmed;
  const sign = match[1] === '-' ? -1 : 1;
  const percent = Number(match[2]);
  if (!Number.isFinite(percent)) return trimmed;
  const factor = 1 + sign * (percent / 100);
  return `${Math.round(factor * 100) / 100}`;
};

export const getVideoMimeType = (name?: string) => {
  if (!name) return 'video/mp4';
  const ext = name.toLowerCase().slice(name.lastIndexOf('.'));
  const map: Record<string, string> = {
    '.mp4': 'video/mp4',
    '.mov': 'video/quicktime',
    '.webm': 'video/webm',
    '.mkv': 'video/x-matroska'
  };
  return map[ext] ?? 'video/mp4';
};

export const canBrowserPlayVideo = (mimeType: string) => {
  if (typeof document === 'undefined') return true;
  const video = document.createElement('video');
  return video.canPlayType(mimeType) !== '';
};

export const isCleanFontName = (value: string) => {
  if (!value) return false;
  if (/\\u[0-9a-fA-F]{4}/.test(value)) return false;
  if (value.includes('�')) return false;
  if (/[\p{C}]/u.test(value)) return false;
  return true;
};

export const isRenderV2DebugEnabled = () => {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem('renderV2Debug') === '1';
  } catch {
    return false;
  }
};

export const guessLanguage = (fileName: string) => {
  const match = fileName.toLowerCase().match(/\.(en|vi|es|fr|de|ja|ko|zh|pt)\./);
  if (!match) return undefined;
  const mapping: Record<string, string> = {
    en: 'English',
    vi: 'Vietnamese',
    es: 'Spanish',
    fr: 'French',
    de: 'German',
    ja: 'Japanese',
    ko: 'Korean',
    zh: 'Chinese',
    pt: 'Portuguese'
  };
  return mapping[match[1]];
};

export const guessVersion = (fileName: string) => {
  const match = fileName.toLowerCase().match(/v(\d+)/);
  return match ? `v${match[1]}` : undefined;
};
