/**
 * Parse subtitle files into plain timed cues (shared by TTS and ASS burn pipeline).
 */

export type SubtitleCue = {
  start: number;
  end: number;
  text: string;
};

export const stripUtf8Bom = (content: string) =>
  content.length > 0 && content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;

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

export const parseAssCues = (content: string, removeLineBreaks: boolean) => {
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
