import type { VaultFile, VaultFolder } from '../../types/vault';
import type { PipelineSummary } from '../../types/pipeline';

export type { VaultFile, VaultFileDTO, VaultFileType, VaultFolder, VaultFolderDTO, VaultStatus } from '../../types/vault';
export type { PipelineSummary } from '../../types/pipeline';

export const VAULT_FOLDERS: VaultFolder[] = [];

export const PIPELINE_LIBRARY: PipelineSummary[] = [];

export const formatBytes = (bytes: number) => {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, index);
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
};

export const truncateLabel = (value: string, max = 48) => {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 3))}...`;
};

export const formatRelativeTime = (iso: string) => {
  const time = new Date(iso).getTime();
  const diff = Date.now() - time;
  if (Number.isNaN(diff)) return iso;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} days ago`;
  return new Date(iso).toLocaleDateString();
};

export const formatDuration = (seconds?: number) => {
  if (!seconds || seconds <= 0) return undefined;
  const total = Math.floor(seconds);
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hrs > 0) return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  return `${mins}:${String(secs).padStart(2, '0')}`;
};

export const formatDurationFine = (seconds?: number) => {
  if (seconds === undefined || seconds === null || seconds < 0) return '00:00.00';
  const total = Math.floor(seconds);
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const hundredths = Math.floor(((seconds - Math.floor(seconds)) + 1e-6) * 100);
  const base = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`;
  if (hrs > 0) return `${hrs}:${base}`;
  return base;
};

export const sanitizeCueText = (value: string, removeLineBreaks: boolean) => {
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

export const stripUtf8Bom = (content: string) =>
  content.length > 0 && content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;

export const parseSrtTimestamp = (value: string) => {
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

export const parseAssTimestamp = (value: string) => {
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

export const parseSrtVttCues = (content: string, removeLineBreaks: boolean) => {
  const lines = content.split(/\r?\n/);
  const cues: Array<{ start: number; end: number; text: string }> = [];
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

export const parseAssCues = (content: string, removeLineBreaks: boolean) => {
  const lines = content.split(/\r?\n/);
  let format: string[] | null = null;
  const cues: Array<{ start: number; end: number; text: string }> = [];

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

export const parseSubtitleCues = (content: string) => {
  const normalized = stripUtf8Bom(content ?? '');
  const looksLikeAss = /\[Script Info\]|\nDialogue:\s*/i.test(normalized);
  return looksLikeAss ? parseAssCues(normalized, true) : parseSrtVttCues(normalized, true);
};

export const formatDurationVerbose = (seconds?: number) => {
  if (seconds === undefined || seconds === null || seconds <= 0) return '0s';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  const parts: string[] = [];
  if (hrs > 0) parts.push(`${hrs}h`);
  if (mins > 0 || hrs > 0) parts.push(`${mins}m`);
  parts.push(`${secs.toFixed(1)}s`);
  return parts.join('');
};

export const formatOverlapDisplay = (overlapSeconds?: number, totalSeconds?: number) => {
  if (overlapSeconds === undefined || overlapSeconds === null) return undefined;
  const timeText = formatDurationVerbose(overlapSeconds);
  if (!totalSeconds || totalSeconds <= 0) return timeText;
  const percent = Math.min(100, Math.max(0, (overlapSeconds / totalSeconds) * 100));
  return `${timeText} (${percent.toFixed(1)}%)`;
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

export const toEdgeTtsRate = (value: string) => {
  const trimmed = value.trim().replace(',', '.');
  if (!trimmed) return '';
  if (/^[+-]?\d+%$/.test(trimmed)) return trimmed;
  const numeric = Number(trimmed);
  if (!Number.isFinite(numeric) || numeric <= 0) return trimmed;
  const percent = Math.round((numeric - 1) * 100);
  return `${percent >= 0 ? '+' : ''}${percent}%`;
};

export const PITCH_BASE_HZ = 200;

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

export const parseDurationToSeconds = (value?: string) => {
  if (!value) return 0;
  const parts = value.split(':').map(part => Number(part));
  if (parts.some(part => Number.isNaN(part))) return 0;
  if (parts.length === 3) {
    const [h, m, s] = parts;
    return h * 3600 + m * 60 + s;
  }
  if (parts.length === 2) {
    const [m, s] = parts;
    return m * 60 + s;
  }
  return 0;
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

export const computeFolderStatus = (files: VaultFile[]) => {
  if (files.some(file => file.status === 'error')) return 'error';
  const hasVideo = files.some(file => file.type === 'video');
  const hasSubtitle = files.some(file => file.type === 'subtitle');
  const hasOutput = files.some(file => file.type === 'output');
  if (hasVideo && hasSubtitle && hasOutput) return 'complete';
  if (hasVideo && (hasSubtitle || hasOutput)) return 'partial';
  return 'raw';
};
