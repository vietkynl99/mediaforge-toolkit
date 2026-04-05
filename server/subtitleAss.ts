import fs from 'fs/promises';
import path from 'path';
import type { SubtitleCue } from './subtitleCues.js';
import { parseAssCues, parseSrtVttCues, stripUtf8Bom } from './subtitleCues.js';

/** V4+ style fields we expose from Render Studio (ASS / libass). */
export type AssRenderStyle = {
  timingShiftSeconds: number;
  fontName: string;
  fontSize: number;
  primaryColor: string;
  secondaryColor: string;
  outlineColor: string;
  backColor: string;
  /** 0–100, opacity of BackColour when BorderStyle uses box (3). */
  backOpacity: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikeOut: boolean;
  scaleX: number;
  scaleY: number;
  spacing: number;
  angle: number;
  /** 1 = outline+shadow, 3 = opaque box, 4 = outline only (ASS). */
  borderStyle: number;
  outline: number;
  shadow: number;
  /** ASS numpad 1–9. */
  alignment: number;
  marginL: number;
  marginR: number;
  marginV: number;
  encoding: number;
  /** Script Info WrapStyle 0–3. */
  wrapStyle: number;
  playResX: number;
  playResY: number;
};

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

const num = (v: unknown, fallback: number) => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const boolish = (v: unknown, fallback: boolean) => {
  if (v === true || v === '-1') return true;
  if (v === false || v === '0' || v === '' || v === 0) return false;
  if (v === '1' || v === 1) return true;
  return fallback;
};

const str = (v: unknown, fallback: string) => (typeof v === 'string' ? v : fallback);

/** Merge JSON from client with ASS-safe defaults. */
export const parseAssRenderStyle = (raw: unknown): AssRenderStyle => {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    timingShiftSeconds: num(o.timingShiftSeconds, 0),
    fontName: str(o.fontName, 'Arial').replace(/,/g, ' ').trim() || 'Arial',
    fontSize: clamp(Math.round(num(o.fontSize, 48)), 6, 200),
    primaryColor: str(o.primaryColor, '#ffffff'),
    secondaryColor: str(o.secondaryColor, '#ffffff'),
    outlineColor: str(o.outlineColor, '#000000'),
    backColor: str(o.backColor, '#000000'),
    backOpacity: clamp(num(o.backOpacity, 0), 0, 100),
    bold: boolish(o.bold, false),
    italic: boolish(o.italic, false),
    underline: boolish(o.underline, false),
    strikeOut: boolish(o.strikeOut, false),
    scaleX: clamp(Math.round(num(o.scaleX, 100)), 1, 1000),
    scaleY: clamp(Math.round(num(o.scaleY, 100)), 1, 1000),
    spacing: clamp(Math.round(num(o.spacing, 0)), -99, 99),
    angle: clamp(num(o.angle, 0), -360, 360),
    borderStyle: clamp(Math.round(num(o.borderStyle, 1)), 1, 4),
    outline: clamp(num(o.outline, 2), 0, 16),
    shadow: clamp(num(o.shadow, 2), 0, 16),
    alignment: clamp(Math.round(num(o.alignment, 2)), 1, 9),
    marginL: clamp(Math.round(num(o.marginL, 30)), 0, 9999),
    marginR: clamp(Math.round(num(o.marginR, 30)), 0, 9999),
    marginV: clamp(Math.round(num(o.marginV, 36)), 0, 9999),
    /** -1 = default / UTF-8 autodetect for libass; positive values are legacy code pages. */
    encoding: clamp(Math.round(num(o.encoding, -1)), -1, 255),
    wrapStyle: clamp(Math.round(num(o.wrapStyle, 0)), 0, 3),
    playResX: clamp(Math.round(num(o.playResX, 1920)), 320, 7680),
    playResY: clamp(Math.round(num(o.playResY, 1080)), 240, 4320)
  };
};

/** Parse #RGB / #RRGGBB into components. */
const parseHexRgb = (hex: string): { r: number; g: number; b: number } => {
  let h = hex.trim();
  if (!h.startsWith('#')) h = `#${h}`;
  if (h.length === 4) {
    const r = parseInt(h[1] + h[1], 16);
    const g = parseInt(h[2] + h[2], 16);
    const b = parseInt(h[3] + h[3], 16);
    return { r, g, b };
  }
  if (h.length === 7) {
    const r = parseInt(h.slice(1, 3), 16);
    const g = parseInt(h.slice(3, 5), 16);
    const b = parseInt(h.slice(5, 7), 16);
    if ([r, g, b].every(n => Number.isFinite(n))) return { r, g, b };
  }
  return { r: 255, g: 255, b: 255 };
};

/**
 * ASS &HAABBGGRR — AA: 00 = opaque, FF = fully transparent (VSFilter / libass).
 */
const assColor = (hex: string, opacityPercent: number) => {
  const { r, g, b } = parseHexRgb(hex);
  const opaque = clamp(opacityPercent, 0, 100);
  const transparent = (100 - opaque) / 100;
  const aa = Math.round(transparent * 255);
  return `&H${aa.toString(16).padStart(2, '0').toUpperCase()}${b.toString(16).padStart(2, '0').toUpperCase()}${g
    .toString(16)
    .padStart(2, '0')
    .toUpperCase()}${r.toString(16).padStart(2, '0').toUpperCase()}`;
};

const formatAssTime = (seconds: number) => {
  const s = Math.max(0, seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const whole = Math.floor(sec);
  const centis = Math.round((sec - whole) * 100);
  const cs = centis >= 100 ? 99 : centis;
  return `${h}:${String(m).padStart(2, '0')}:${String(whole).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
};

/** Escape user text for ASS Dialogue (newlines → \\N). */
export const escapeAssDialogueText = (text: string) => {
  const withNl = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  return withNl
    .split('\n')
    .map(line =>
      line
        .replace(/\\/g, '\\\\')
        .replace(/{/g, '\\{')
        .replace(/}/g, '\\}')
        .replace(/\n/g, ' ')
    )
    .join('\\N');
};

export const buildAssDocument = (cues: SubtitleCue[], style: AssRenderStyle): string => {
  const primary = assColor(style.primaryColor, 100);
  const secondary = assColor(style.secondaryColor, 100);
  const outlineC = assColor(style.outlineColor, 100);
  const backC = assColor(style.backColor, style.borderStyle === 3 ? style.backOpacity : 100);

  const bold = style.bold ? -1 : 0;
  const italic = style.italic ? -1 : 0;
  const underline = style.underline ? -1 : 0;
  const strike = style.strikeOut ? -1 : 0;

  const styleLine =
    `Style: Default,${style.fontName},${style.fontSize},${primary},${secondary},${outlineC},${backC},` +
    `${bold},${italic},${underline},${strike},${style.scaleX},${style.scaleY},${style.spacing},${style.angle},` +
    `${style.borderStyle},${style.outline},${style.shadow},${style.alignment},${style.marginL},${style.marginR},${style.marginV},${style.encoding}`;

  const shift = style.timingShiftSeconds;
  const dialogue = cues
    .map(c => {
      const start = Math.max(0, c.start + shift);
      const end = Math.max(start + 0.01, c.end + shift);
      const t0 = formatAssTime(start);
      const t1 = formatAssTime(end);
      const tx = escapeAssDialogueText(c.text);
      return `Dialogue: 0,${t0},${t1},Default,,0,0,0,,${tx}`;
    })
    .join('\n');

  return (
    `[Script Info]\n` +
    `Title: MediaForge\n` +
    `ScriptType: v4.00+\n` +
    `WrapStyle: ${style.wrapStyle}\n` +
    `PlayResX: ${style.playResX}\n` +
    `PlayResY: ${style.playResY}\n` +
    `\n` +
    `[V4+ Styles]\n` +
    `Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n` +
    `${styleLine}\n` +
    `\n` +
    `[Events]\n` +
    `Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n` +
    `${dialogue}\n`
  );
};

export const loadCuesFromSubtitleFile = async (fullPath: string): Promise<SubtitleCue[]> => {
  const raw = stripUtf8Bom(await fs.readFile(fullPath, 'utf-8'));
  const ext = path.extname(fullPath).toLowerCase();
  const preserveBreaks = false;
  if (ext === '.ass' || ext === '.ssa') {
    return parseAssCues(raw, preserveBreaks);
  }
  return parseSrtVttCues(raw, preserveBreaks);
};

export const writeStyledAssFile = async (
  sourceSubtitlePath: string,
  style: AssRenderStyle,
  outputAssPath: string
): Promise<void> => {
  const cues = await loadCuesFromSubtitleFile(sourceSubtitlePath);
  if (!cues.length) {
    throw new Error('Subtitle file has no parseable cues');
  }
  const doc = buildAssDocument(cues, style);
  /** No BOM: a leading BOM can break parsers that expect `[Script Info]` on line 1. */
  await fs.writeFile(outputAssPath, doc, 'utf-8');
};
