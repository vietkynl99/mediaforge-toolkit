import React, { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  LayoutDashboard, 
  Hammer, 
  Database, 
  Settings, 
  Terminal, 
  Play, 
  Pause, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  ChevronRight,
  Download,
  Trash2,
  RefreshCw,
  Cpu,
  Activity,
  HardDrive,
  Plus,
  FileVideo,
  FileAudio,
  Type,
  File,
  Image,
  Folder,
  FolderOpen,
  Languages,
  Scissors,
  Search,
  Filter,
  Upload,
  MousePointer2,
  Menu,
  Save
} from 'lucide-react';
import { TASK_ICONS, MediaJob, JobStatus } from './types';

// --- Components ---

const SidebarItem = ({ icon: Icon, label, active, onClick, collapsed }: { icon: any, label: string, active?: boolean, onClick: () => void, collapsed?: boolean }) => (
  <button 
    onClick={onClick}
    className={`flex items-center w-full ${collapsed ? 'justify-center px-2' : 'gap-3 px-4'} py-3 transition-colors rounded-lg group ${
      active ? 'bg-lime-500/10 text-lime-400' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100'
    }`}
  >
    <Icon size={20} className={active ? 'text-lime-400' : 'group-hover:text-zinc-100'} />
    {!collapsed && <span className="text-sm font-medium">{label}</span>}
  </button>
);

const formatDurationMs = (ms: number) => {
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

  const formatLocalDateTime = (value?: string) => {
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

const coerceNumber = (value: string | number | null | undefined, fallback?: number) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return fallback;
};

const parseResolution = (value: string | null | undefined, fallback = { w: 1920, h: 1080 }) => {
  if (!value) return fallback;
  const match = String(value).trim().match(/(\d+)\s*[x×]\s*(\d+)/i);
  if (!match) return fallback;
  const w = Number(match[1]);
  const h = Number(match[2]);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return fallback;
  return { w: Math.round(w), h: Math.round(h) };
};

/** Render Studio / pipeline: blur region as inset % from each edge (like CSS top/right/bottom/left). */
type RenderBlurRegionEffect = {
  type: 'blur_region';
  left: number;
  right: number;
  top: number;
  bottom: number;
  sigma: number;
  /** 0 = hard edge; 1–20 softer transition toward full blur at center. */
  feather: number;
};

const num = (v: unknown, fb: number) => coerceNumber(v as string | number | null | undefined, fb) ?? fb;

type RenderSubtitleAssState = {
  fontName: string;
  fontSize: string;
  primaryColor: string;
  outlineColor: string;
  bold: string;
  italic: string;
  spacing: string;
  outline: string;
  shadow: string;
  alignment: string;
  marginL: string;
  marginR: string;
  marginV: string;
  wrapStyle: string;
};

/** ASS / libass V4+ style fields used for temp .ass burn (see server/subtitleAss.ts). */
const DEFAULT_RENDER_SUBTITLE_ASS: RenderSubtitleAssState = {
  fontName: 'Arial',
  fontSize: '48',
  primaryColor: '#ffffff',
  outlineColor: '#000000',
  bold: '0',
  italic: '0',
  spacing: '0',
  outline: '2',
  shadow: '2',
  alignment: '2',
  marginL: '30',
  marginR: '30',
  marginV: '36',
  wrapStyle: '0'
};

const BASE_SUBTITLE_STYLE: RenderSubtitleAssState = {
  fontName: DEFAULT_RENDER_SUBTITLE_ASS.fontName,
  fontSize: DEFAULT_RENDER_SUBTITLE_ASS.fontSize,
  primaryColor: DEFAULT_RENDER_SUBTITLE_ASS.primaryColor,
  outlineColor: DEFAULT_RENDER_SUBTITLE_ASS.outlineColor,
  bold: DEFAULT_RENDER_SUBTITLE_ASS.bold,
  italic: DEFAULT_RENDER_SUBTITLE_ASS.italic,
  spacing: DEFAULT_RENDER_SUBTITLE_ASS.spacing,
  outline: DEFAULT_RENDER_SUBTITLE_ASS.outline,
  shadow: DEFAULT_RENDER_SUBTITLE_ASS.shadow,
  alignment: DEFAULT_RENDER_SUBTITLE_ASS.alignment,
  marginL: DEFAULT_RENDER_SUBTITLE_ASS.marginL,
  marginR: DEFAULT_RENDER_SUBTITLE_ASS.marginR,
  marginV: DEFAULT_RENDER_SUBTITLE_ASS.marginV,
  wrapStyle: DEFAULT_RENDER_SUBTITLE_ASS.wrapStyle
};

type SubtitleStylePreset = {
  id: string;
  label: string;
  style: Partial<RenderSubtitleAssState>;
};

const SUBTITLE_STYLE_PRESETS: SubtitleStylePreset[] = [
  {
    id: 'default',
    label: 'Default',
    style: { ...BASE_SUBTITLE_STYLE }
  },
  {
    id: 'bold-white',
    label: 'Bold',
    style: { ...BASE_SUBTITLE_STYLE, bold: '1', outline: '3', shadow: '3' }
  },
  {
    id: 'yellow',
    label: 'Yellow',
    style: { ...BASE_SUBTITLE_STYLE, primaryColor: '#ffd400' }
  },
  {
    id: 'cyan',
    label: 'Cyan',
    style: { ...BASE_SUBTITLE_STYLE, primaryColor: '#56d7ff' }
  },
  {
    id: 'pink',
    label: 'Pink',
    style: { ...BASE_SUBTITLE_STYLE, primaryColor: '#ff6ad5' }
  },
  {
    id: 'green',
    label: 'Green',
    style: { ...BASE_SUBTITLE_STYLE, primaryColor: '#9dff57' }
  },
  {
    id: 'red',
    label: 'Red',
    style: { ...BASE_SUBTITLE_STYLE, primaryColor: '#ff6b6b' }
  },
  {
    id: 'orange',
    label: 'Orange',
    style: { ...BASE_SUBTITLE_STYLE, primaryColor: '#ff9f1c' }
  },
  {
    id: 'blue',
    label: 'Blue',
    style: { ...BASE_SUBTITLE_STYLE, primaryColor: '#4dabff' }
  },
  {
    id: 'dark-box',
    label: 'Dark Box',
    style: {
      ...BASE_SUBTITLE_STYLE,
      outline: '0',
      shadow: '0'
    }
  },
  {
    id: 'light-box',
    label: 'Light Box',
    style: {
      ...BASE_SUBTITLE_STYLE,
      primaryColor: '#111111',
      outlineColor: '#ffffff',
      outline: '0',
      shadow: '0'
    }
  },
  {
    id: 'outline-only',
    label: 'Outline',
    style: {
      ...BASE_SUBTITLE_STYLE,
      outline: '4',
      shadow: '0'
    }
  }
];

const VIET_SUBTITLE_FONTS = [
  'Be Vietnam Pro',
  'Noto Sans',
  'Noto Sans Display',
  'Roboto',
  'Inter',
  'Montserrat',
  'Lato',
  'Open Sans',
  'Source Sans 3',
  'Poppins',
  'Merriweather',
  'Playfair Display',
  'Times New Roman',
  'Arial',
  'Tahoma',
  'Verdana'
];

const isCleanFontName = (value: string) => {
  if (!value) return false;
  if (/\\u[0-9a-fA-F]{4}/.test(value)) return false;
  if (value.includes('�')) return false;
  if (/[\p{C}]/u.test(value)) return false;
  return true;
};

const buildSubtitlePreviewStyle = (preset: SubtitleStylePreset) => {
  const merged = { ...BASE_SUBTITLE_STYLE, ...preset.style };
  const outline = Math.max(0, Number(merged.outline ?? 0));
  const shadow = Math.max(0, Number(merged.shadow ?? 0));
  const shadows: string[] = [];
  if (outline > 0) {
    const o = Math.min(6, outline);
    shadows.push(
      `${-o}px 0 0 ${merged.outlineColor}`,
      `${o}px 0 0 ${merged.outlineColor}`,
      `0 ${-o}px 0 ${merged.outlineColor}`,
      `0 ${o}px 0 ${merged.outlineColor}`
    );
  }
  if (shadow > 0) {
    const s = Math.min(6, shadow);
    shadows.push(`${s}px ${s}px 0 ${merged.outlineColor}`);
  }
  return {
    color: merged.primaryColor,
    background: 'transparent',
    fontWeight: merged.bold === '1' ? 800 : 600,
    fontStyle: merged.italic === '1' ? 'italic' : 'normal',
    textShadow: shadows.length ? shadows.join(', ') : 'none'
  } as React.CSSProperties;
};

const migrateLegacySubtitleFields = (r: Record<string, unknown>): Partial<RenderSubtitleAssState> => {
  const out: Partial<Record<string, string>> = {};
  if (r.fontName === undefined && r.fontFamily != null && String(r.fontFamily).trim() !== '') {
    out.fontName = String(r.fontFamily);
  }
  if (r.primaryColor === undefined && r.color != null) out.primaryColor = String(r.color);
  if (r.outline === undefined && r.outlineWidth != null) out.outline = String(r.outlineWidth);
  if ((r.marginL === undefined || r.marginR === undefined) && r.maxWidth != null) {
    const mw = coerceNumber(r.maxWidth as string | number, 90) ?? 90;
    const side = Math.round(((100 - Math.min(100, Math.max(0, mw))) / 200) * 1920);
    if (r.marginL === undefined) out.marginL = String(Math.max(0, side));
    if (r.marginR === undefined) out.marginR = String(Math.max(0, side));
  }
  if (r.marginV === undefined && r.safeArea != null) {
    const sa = coerceNumber(r.safeArea as string | number, 5) ?? 5;
    out.marginV = String(Math.max(0, Math.round((Math.min(100, Math.max(0, sa)) / 100) * 1080)));
  }
  if (r.alignment === undefined && r.position != null) {
    const p = String(r.position);
    if (p === 'top') out.alignment = '8';
    else if (p === 'custom') out.alignment = '5';
    else out.alignment = '2';
  }
  return out as Partial<RenderSubtitleAssState>;
};

const normalizeLoadedSubtitleState = (raw: unknown): RenderSubtitleAssState => {
  const base: RenderSubtitleAssState = { ...DEFAULT_RENDER_SUBTITLE_ASS };
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Record<string, unknown>;
  const leg = migrateLegacySubtitleFields(r);
  const next = { ...base, ...leg };
  (Object.keys(base) as (keyof RenderSubtitleAssState)[]).forEach(k => {
    if (r[k] !== undefined && r[k] !== null && String(r[k]).trim() !== '') {
      (next as Record<string, string>)[k] = String(r[k]);
    }
  });
  return next;
};

const normalizeLoadedRenderEffects = (raw: unknown): RenderBlurRegionEffect[] | undefined => {
  if (!Array.isArray(raw)) return undefined;
  const out: RenderBlurRegionEffect[] = [];
  raw.forEach(item => {
    if (!item || typeof item !== 'object') return;
    const o = item as Record<string, unknown>;
    if (o.type !== 'blur_region') return;
    const sigma = Math.min(80, Math.max(0.5, num(o.sigma, 15)));
    const feather = Math.min(RENDER_BLUR_FEATHER_MAX, Math.max(0, num(o.feather, 0)));

    let left: number;
    let right: number;
    let top: number;
    let bottom: number;
    if (
      o.left !== undefined ||
      o.right !== undefined ||
      o.top !== undefined ||
      o.bottom !== undefined
    ) {
      left = Math.min(100, Math.max(0, num(o.left, 0)));
      right = Math.min(100, Math.max(0, num(o.right, 0)));
      top = Math.min(100, Math.max(0, num(o.top, 0)));
      bottom = Math.min(100, Math.max(0, num(o.bottom, 0)));
    } else {
      const x = Math.min(100, Math.max(0, num(o.x, 0)));
      const y = Math.min(100, Math.max(0, num(o.y, 0)));
      const w = Math.min(100, Math.max(0, num(o.w, 0)));
      const h = Math.min(100, Math.max(0, num(o.h, 0)));
      if (w <= 0 || h <= 0) return;
      left = x;
      top = y;
      right = Math.min(100, Math.max(0, 100 - x - w));
      bottom = Math.min(100, Math.max(0, 100 - y - h));
    }

    if (left + right >= 100 || top + bottom >= 100) return;
    out.push({ type: 'blur_region', left, right, top, bottom, sigma, feather });
  });
  return out;
};

const StatusBadge = ({ status }: { status: JobStatus }) => {
  const configs = {
    queued: { icon: Clock, color: 'text-zinc-400 bg-zinc-400/10', label: 'Queued' },
    processing: { icon: RefreshCw, color: 'text-blue-400 bg-blue-400/10', label: 'Processing' },
    awaiting_input: { icon: AlertCircle, color: 'text-amber-400 bg-amber-400/10', label: 'Awaiting Review' },
    completed: { icon: CheckCircle2, color: 'text-lime-400 bg-lime-400/10', label: 'Completed' },
    failed: { icon: AlertCircle, color: 'text-red-400 bg-red-400/10', label: 'Failed' },
    cancelled: { icon: Pause, color: 'text-zinc-400 bg-zinc-400/10', label: 'Cancelled' },
  };
  const config = configs[status];
  const Icon = config.icon;

  return (
    <div className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${config.color}`}>
      <Icon size={12} className={status === 'processing' ? 'animate-spin-soft' : ''} />
      {config.label}
    </div>
  );
};

type JobRowProps = {
  job: MediaJob;
  index: number;
  onContextMenu: (event: React.MouseEvent<HTMLDivElement>, job: MediaJob) => void;
};

function JobRow({ job, index, onContextMenu }: JobRowProps) {
  return (
  <motion.div 
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    className="grid grid-cols-[28px_130px_minmax(0,1fr)_130px_120px_110px_80px] items-center gap-4 p-4 border-b border-zinc-800 hover:bg-zinc-800/30 transition-colors group"
    onContextMenu={(event) => onContextMenu(event, job)}
  >
    <div className="text-xs text-zinc-600 font-mono text-right pr-0.5">
      {index}
    </div>

    <div className="text-xs text-zinc-500">
      {formatLocalDateTime(job.createdAt)}
    </div>

    <div className="flex min-w-0 flex-col gap-1 overflow-hidden">
      <div className="flex items-center gap-2">
        <span className="font-semibold text-zinc-100 truncate">
          {job.projectName || 'Unknown Project'}
        </span>
      </div>
      <span className="text-xs text-zinc-500 truncate">
        {job.fileName} • {job.fileSize}
      </span>
    </div>

    <div className="flex w-[130px] flex-col gap-1 shrink-0">
      <div className="text-[11px] text-zinc-300 font-semibold truncate">
        {job.name}
      </div>
      <div className="flex items-center gap-0.5">
        {job.tasks.map((task, i) => {
          const Icon = TASK_ICONS[task.type] ?? File;
          const statusLabel = {
            pending: 'Pending',
            active: 'Active',
            done: 'Done',
            error: 'Error'
          }[task.status] ?? task.status;
          return (
            <React.Fragment key={task.id}>
              <div 
                title={`${task.name} • ${statusLabel} • ${task.status === 'error' ? 100 : Math.round(task.progress ?? 0)}%`}
                className={`p-1.5 rounded-md relative ${
                  task.status === 'done' ? 'bg-lime-500/20 text-lime-400' : 
                  task.status === 'active' ? 'bg-blue-500/20 text-blue-400 animate-pulse' : 
                  'bg-zinc-800 text-zinc-600'
                }`}
              >
                <Icon size={14} />
                {task.status === 'active' && typeof task.progress === 'number' && task.progress > 0 && (
                  <span className="absolute -bottom-1 -right-1 text-[8px] font-bold text-blue-200">
                    {Math.round(task.progress)}%
                  </span>
                )}
                {task.status === 'error' && (
                  <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-red-500 text-[9px] leading-3 text-white flex items-center justify-center">✕</span>
                )}
              </div>
              {i < job.tasks.length - 1 && <ChevronRight size={12} className="text-zinc-700 -mx-0.5" />}
            </React.Fragment>
          );
        })}
      </div>
    </div>

    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between text-[10px] font-mono text-zinc-400">
        <span>{job.progress}%</span>
        <span>{job.eta || '--'}</span>
      </div>
      <div className="h-1 w-full bg-zinc-800 rounded-full overflow-hidden">
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: `${job.progress}%` }}
          className={`h-full ${
            job.status === 'failed' ? 'bg-red-500' : job.status === 'cancelled' ? 'bg-zinc-500' : 'bg-lime-500'
          }`}
        />
      </div>
    </div>

    <div className="flex w-[100px] justify-start shrink-0">
      <StatusBadge status={job.status} />
    </div>

    <div className="text-xs text-zinc-500 text-right -ml-2">
      {job.durationMs !== undefined ? formatDurationMs(job.durationMs) : '--'}
    </div>
  </motion.div>
  );
}

// --- Media Vault Mock Data ---

type VaultFileType = 'video' | 'audio' | 'subtitle' | 'image' | 'output' | 'other';
type VaultStatus = 'raw' | 'partial' | 'complete' | 'error' | 'processing';

interface VaultFile {
  id: string;
  name: string;
  type: VaultFileType;
  size: string;
  relativePath?: string;
  duration?: string;
  durationSeconds?: number;
  language?: string;
  linkedTo?: string;
  linkedToPath?: string;
  status?: VaultStatus;
  origin?: 'source' | 'vr' | 'tts';
  progress?: number;
  version?: string;
  uvr?: {
    processedAt: string;
    backend?: string;
    model?: string;
    outputFormat?: string;
    outputs?: string[];
    role?: 'source' | 'output';
    sourceRelativePath?: string;
  };
  createdAt: string;
}

interface VaultFolder {
  id: string;
  name: string;
  status: VaultStatus;
  lastActivity: string;
  tags: string[];
  files: VaultFile[];
  suggestedAction?: string;
}

const VAULT_FOLDERS: VaultFolder[] = [];

type PipelineSummary = {
  id: string;
  name: string;
  steps: number;
  updatedAt: string;
  kind: 'saved' | 'task';
  primaryType?: string | null;
};

const PIPELINE_LIBRARY: PipelineSummary[] = [];

type VaultFileDTO = {
  name: string;
  relativePath: string;
  sizeBytes: number;
  modifiedAt: string;
  type: VaultFileType;
  extension: string;
  durationSeconds?: number;
  linkedTo?: string;
  uvr?: {
    processedAt: string;
    backend?: string;
    model?: string;
    outputFormat?: string;
    outputs?: string[];
    role?: 'source' | 'output';
    sourceRelativePath?: string;
  };
  tts?: {
    processedAt: string;
    voice?: string;
    rate?: number;
    pitch?: number;
    volume?: number;
    outputs?: string[];
    role?: 'source' | 'output';
    sourceRelativePath?: string;
  };
};

type VaultFolderDTO = {
  name: string;
  path: string;
  files: VaultFileDTO[];
};

const formatBytes = (bytes: number) => {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, index);
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
};

const truncateLabel = (value: string, max = 48) => {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 3))}...`;
};

const formatRelativeTime = (iso: string) => {
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

const formatDuration = (seconds?: number) => {
  if (!seconds || seconds <= 0) return undefined;
  const total = Math.floor(seconds);
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hrs > 0) return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  return `${mins}:${String(secs).padStart(2, '0')}`;
};

const formatDurationFine = (seconds?: number) => {
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

const parseSrtVttCues = (content: string, removeLineBreaks: boolean) => {
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

const parseSubtitleCues = (content: string) => parseSrtVttCues(content, true);

const formatDurationVerbose = (seconds?: number) => {
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

const formatOverlapDisplay = (overlapSeconds?: number, totalSeconds?: number) => {
  if (overlapSeconds === undefined || overlapSeconds === null) return undefined;
  const timeText = formatDurationVerbose(overlapSeconds);
  if (!totalSeconds || totalSeconds <= 0) return timeText;
  const percent = Math.min(100, Math.max(0, (overlapSeconds / totalSeconds) * 100));
  return `${timeText} (${percent.toFixed(1)}%)`;
};

const getVideoMimeType = (name?: string) => {
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

const canBrowserPlayVideo = (mimeType: string) => {
  if (typeof document === 'undefined') return true;
  const video = document.createElement('video');
  return video.canPlayType(mimeType) !== '';
};

const toEdgeTtsRate = (value: string) => {
  const trimmed = value.trim().replace(',', '.');
  if (!trimmed) return '';
  if (/^[+-]?\d+%$/.test(trimmed)) return trimmed;
  const numeric = Number(trimmed);
  if (!Number.isFinite(numeric) || numeric <= 0) return trimmed;
  const percent = Math.round((numeric - 1) * 100);
  return `${percent >= 0 ? '+' : ''}${percent}%`;
};

const PITCH_BASE_HZ = 200;

const toEdgeTtsPitch = (value: string) => {
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

const fromEdgeTtsPitch = (value?: string) => {
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

const fromEdgeTtsRate = (value?: string) => {
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

const parseDurationToSeconds = (value?: string) => {
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

const guessLanguage = (fileName: string) => {
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

const guessVersion = (fileName: string) => {
  const match = fileName.toLowerCase().match(/v(\d+)/);
  return match ? `v${match[1]}` : undefined;
};

const computeFolderStatus = (files: VaultFile[]) => {
  if (files.some(file => file.status === 'error')) return 'error';
  const hasVideo = files.some(file => file.type === 'video');
  const hasSubtitle = files.some(file => file.type === 'subtitle');
  const hasOutput = files.some(file => file.type === 'output');
  if (hasVideo && hasSubtitle && hasOutput) return 'complete';
  if (hasVideo && (hasSubtitle || hasOutput)) return 'partial';
  return 'raw';
};

// --- Main App ---

/** Render Studio: extra strip after content end (pixels only); logical duration = longest track. */
const RENDER_TIMELINE_VIEW_PAD = 0.12;

const RENDER_BLUR_FEATHER_MAX = 20;

/** Solid black JPEG when preview cannot be loaded (matches server fallback). */
const RENDER_PREVIEW_BLACK_DATA_URL =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAgAAAQABAAD//gAQTGF2YzU4LjU0LjEwMAD/2wBDAAg+Pkk+SVVVVVVVVWRdZGhoaGRkZGRoaGhwcHCDg4NwcHBoaHBwfHyDg4+Tj4eHg4eTk5ubm7q6srLZ2eD/////xABLAAEBAAAAAAAAAAAAAAAAAAAACAEBAAAAAAAAAAAAAAAAAAAAABABAAAAAAAAAAAAAAAAAAAAABEBAAAAAAAAAAAAAAAAAAAAAP/AABEIAPABQAMBIgACEQADEQD/2gAMAwEAAhEDEQA/AJ/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB//9k=';

const RenderStudioPage = lazy(() => import('./RenderStudioPage'));

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [searchQuery, setSearchQuery] = useState('');
  const [jobs, setJobs] = useState<MediaJob[]>([]);
  const [jobPage, setJobPage] = useState(1);
  const [jobLogOpen, setJobLogOpen] = useState(false);
  const [jobLogJobId, setJobLogJobId] = useState<string | null>(null);
  const previousJobsRef = useRef<MediaJob[]>([]);
  const [jobContextMenu, setJobContextMenu] = useState<{ open: boolean; x: number; y: number; jobId: string | null }>({
    open: false,
    x: 0,
    y: 0,
    jobId: null
  });
  const [paramPresetContextMenu, setParamPresetContextMenu] = useState<{
    open: boolean;
    x: number;
    y: number;
    presetId: number | null;
  }>({
    open: false,
    x: 0,
    y: 0,
    presetId: null
  });
  const [paramPresetLabelDraft, setParamPresetLabelDraft] = useState('');
  const [pipelineContextMenu, setPipelineContextMenu] = useState<{
    open: boolean;
    x: number;
    y: number;
    pipelineId: string | null;
  }>({
    open: false,
    x: 0,
    y: 0,
    pipelineId: null
  });
  const [fileContextMenu, setFileContextMenu] = useState<{
    open: boolean;
    x: number;
    y: number;
    file: VaultFile | null;
  }>({
    open: false,
    x: 0,
    y: 0,
    file: null
  });
  const [vaultFolders, setVaultFolders] = useState<VaultFolder[]>([]);
  const [vaultLoading, setVaultLoading] = useState(false);
  const [vaultError, setVaultError] = useState<string | null>(null);
  const [vaultRoot, setVaultRoot] = useState('/media/MediaVault');
  const [vaultFolderId, setVaultFolderId] = useState<string | null>(null);
  const [vaultFileId, setVaultFileId] = useState<string | null>(null);
  const [vaultFolderQuery, setVaultFolderQuery] = useState('');
  const [vaultQuery, setVaultQuery] = useState('');
  const [vaultTypeFilter, setVaultTypeFilter] = useState<'all' | VaultFileType>('all');
  const [vaultSort, setVaultSort] = useState<'recent' | 'name' | 'size'>('recent');
  const [vaultView, setVaultView] = useState<'grouped' | 'flat'>('grouped');
  const [vaultGroupCollapsed, setVaultGroupCollapsed] = useState<Record<VaultFileType, boolean>>({
    video: false,
    audio: false,
    subtitle: false,
    image: false,
    output: false,
    other: false
  });
  const [showFolderPanel, setShowFolderPanel] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastVisible, setToastVisible] = useState(false);
  const [toastType, setToastType] = useState<'info' | 'success' | 'warning' | 'error'>('info');
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [lastFolderNames, setLastFolderNames] = useState<string[]>([]);
  const [vrModels, setVrModels] = useState<string[]>([]);
  const [vrModel, setVrModel] = useState('MGM_MAIN_v4.pth');
  const [vrOutputType, setVrOutputType] = useState<'Mp3' | 'Wav' | 'Flac'>('Mp3');
  const [vrProjectId, setVrProjectId] = useState<string | null>(null);
  const [vrInputId, setVrInputId] = useState<string | null>(null);
  const [vrRunning, setVrRunning] = useState(false);
  const [vrResult, setVrResult] = useState<string[]>([]);
  const [vrError, setVrError] = useState<string | null>(null);
  const [pipelineTasks, setPipelineTasks] = useState<Array<{
    id: string;
    type: string;
    label: string;
    inputs: string[];
    outputs: string[];
  }>>([]);
  const [showPipelineEditor, setShowPipelineEditor] = useState(false);
  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    title: string;
    description?: string;
    confirmLabel?: string;
    variant?: 'danger' | 'primary';
  }>({ open: false, title: '' });
  const confirmActionRef = useRef<null | (() => void)>(null);
  const [vaultContextMenu, setVaultContextMenu] = useState<{
    open: boolean;
    x: number;
    y: number;
    folder: VaultFolder | null;
  }>({ open: false, x: 0, y: 0, folder: null });
  const [importPopupOpen, setImportPopupOpen] = useState(false);
  const [importProjectName, setImportProjectName] = useState('');
  const [importProjectPickerOpen, setImportProjectPickerOpen] = useState(false);
  const [importFiles, setImportFiles] = useState<File[]>([]);
  const [importSubmitting, setImportSubmitting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [graphNodes, setGraphNodes] = useState<Array<{
    id: string;
    type: string;
    label: string;
    inputs: string[];
    outputs: string[];
    x: number;
    y: number;
  }>>([]);
  const [graphEdges, setGraphEdges] = useState<Array<{ id: string; from: string; to: string }>>([]);
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null);
  const [pendingConnection, setPendingConnection] = useState<string | null>(null);
  const canvasRef = React.useRef<HTMLDivElement | null>(null);
  const [pipelineLibrary, setPipelineLibrary] = useState(PIPELINE_LIBRARY);
  const [pipelineName, setPipelineName] = useState('New Pipeline');
  const [pipelineSaving, setPipelineSaving] = useState(false);
  const [showRunPipeline, setShowRunPipeline] = useState(false);
  const [showRenderStudio, setShowRenderStudio] = useState(false);
  const [renderPresetSaveMenuOpen, setRenderPresetSaveMenuOpen] = useState(false);
  const [renderStudioLeftMenuOpen, setRenderStudioLeftMenuOpen] = useState(false);
  const [renderStudioMediaBinOpen, setRenderStudioMediaBinOpen] = useState(false);
  const [renderStudioProjectOpen, setRenderStudioProjectOpen] = useState(false);
  const [renderStudioInspectorOpen, setRenderStudioInspectorOpen] = useState<
    Record<'timeline' | 'video' | 'audio' | 'subtitle' | 'effects', boolean>
  >({
    timeline: false,
    video: false,
    audio: false,
    subtitle: false,
    effects: false
  });
  const [showPipelinePreview, setShowPipelinePreview] = useState(false);
  const [isEditingPipelineName, setIsEditingPipelineName] = useState(false);
  const renderPresetMenuCloseRef = React.useRef<number | null>(null);
  const [pipelinePreviewTask, setPipelinePreviewTask] = useState<{
    type: string;
    label: string;
    desc: string;
    inputs: string[];
    outputs: string[];
    params?: Array<{ name: string; desc: string; type: 'string' | 'number' | 'boolean'; default?: string | number | boolean }>;
    preview?: 'tts';
  } | null>(null);
  const [showParamPresetEditor, setShowParamPresetEditor] = useState(false);
  const [paramPresetEditorMode, setParamPresetEditorMode] = useState<'create' | 'edit'>('create');
  const [paramPresetEditingId, setParamPresetEditingId] = useState<number | null>(null);
  const [paramPresetTaskType, setParamPresetTaskType] = useState('');
  const [paramPresetValues, setParamPresetValues] = useState<Record<string, string | boolean>>({});
  const [previewTtsText, setPreviewTtsText] = useState('Xin chào, hôm nay trời đẹp và mình nói tiếng Việt.');
  const [previewTtsVoice, setPreviewTtsVoice] = useState('vi-VN-HoaiMyNeural');
  const [previewTtsRate, setPreviewTtsRate] = useState('');
  const [previewTtsPitch, setPreviewTtsPitch] = useState('');
  const [runPipelineTtsVoice, setRunPipelineTtsVoice] = useState('vi-VN-HoaiMyNeural');
  const [runPipelineTtsRate, setRunPipelineTtsRate] = useState('');
  const [runPipelineTtsPitch, setRunPipelineTtsPitch] = useState('');
  const [runPipelineTtsOverlapMode, setRunPipelineTtsOverlapMode] = useState<'truncate' | 'overlap'>('overlap');
  const [runPipelineTtsRemoveLineBreaks, setRunPipelineTtsRemoveLineBreaks] = useState(true);
  const [renderVideoId, setRenderVideoId] = useState<string | null>(null);
  const [renderAudioId, setRenderAudioId] = useState<string | null>(null);
  const [renderSubtitleId, setRenderSubtitleId] = useState<string | null>(null);
  const [renderInputFileIds, setRenderInputFileIds] = useState<string[]>([]);
  const [renderTimelineScale, setRenderTimelineScale] = useState(1);
  const [renderPlayheadSeconds, setRenderPlayheadSeconds] = useState(0);
  const [renderPreviewUrl, setRenderPreviewUrl] = useState<string | null>(null);
  const [renderPreviewLoading, setRenderPreviewLoading] = useState(false);
  const [renderPreviewError, setRenderPreviewError] = useState<string | null>(null);
  const [saveRenderPresetLoading, setSaveRenderPresetLoading] = useState(false);
  const [renderSubtitleCues, setRenderSubtitleCues] = useState<Array<{ start: number; end: number; text: string }>>([]);
  const [renderStudioFocus, setRenderStudioFocus] = useState<'timeline' | 'item'>('timeline');
  const [renderStudioItemType, setRenderStudioItemType] = useState<'video' | 'audio' | 'subtitle' | null>(null);
  const [renderTimelineViewportWidth, setRenderTimelineViewportWidth] = useState(0);
  const renderTimelineScrollRef = useRef<HTMLDivElement | null>(null);
  const prevShowRenderStudioForZoomRef = useRef(false);
  const renderTimelineDragRef = useRef<{ active: boolean; startX: number; scrollLeft: number; moved: boolean }>({
    active: false,
    startX: 0,
    scrollLeft: 0,
    moved: false
  });
  const [renderParams, setRenderParams] = useState({
    timeline: {
      framerate: '30',
      resolution: '1920x1080'
    },
    video: {
      trimStart: '',
      trimEnd: '',
      speed: '1',
      volume: '100',
      fit: 'contain',
      positionX: '50',
      positionY: '50',
      scale: '1',
      rotation: '0',
      opacity: '100',
      colorLut: '',
      cropX: '0',
      cropY: '0',
      cropW: '100',
      cropH: '100',
      fadeIn: '0',
      fadeOut: '0'
    },
    audio: {
      gainDb: '0',
      mute: false,
      fadeIn: '0',
      fadeOut: '0'
    },
    subtitle: { ...DEFAULT_RENDER_SUBTITLE_ASS },
    effects: [] as RenderBlurRegionEffect[]
  });
  const runAgainPrefillRef = useRef(false);
  const [paramPresets, setParamPresets] = useState<Array<{
    id: number;
    taskType: string;
    params: Record<string, any>;
    label: string;
    updatedAt?: string;
  }>>([]);
  const [previewTtsLoading, setPreviewTtsLoading] = useState(false);
  const [previewTtsError, setPreviewTtsError] = useState<string | null>(null);
  const [previewTtsUrl, setPreviewTtsUrl] = useState<string | null>(null);
  const previewTtsAudioRef = useRef<HTMLAudioElement | null>(null);
  const [previewTtsVoices, setPreviewTtsVoices] = useState<Array<{
    Name: string;
    ShortName?: string;
    Locale?: string;
    Gender?: string;
  }>>([]);
  const [previewTtsVoicesLoading, setPreviewTtsVoicesLoading] = useState(false);
  const [subtitleFontOptions, setSubtitleFontOptions] = useState<string[]>(VIET_SUBTITLE_FONTS);
  const [subtitleFontLoading, setSubtitleFontLoading] = useState(false);
  const [previewCustomParams, setPreviewCustomParams] = useState<Record<string, string | number>>({});
  const [runPipelineId, setRunPipelineId] = useState<string | null>(null);
  const [runPipelineGraph, setRunPipelineGraph] = useState<any>(null);
  const [runPipelineLoading, setRunPipelineLoading] = useState(false);
  const [runPipelineInputId, setRunPipelineInputId] = useState<string | null>(null);
  const [runPipelineProjectId, setRunPipelineProjectId] = useState<string | null>(null);
  const [runPipelineProjectLocked, setRunPipelineProjectLocked] = useState(false);
  const [runPipelineSubmitting, setRunPipelineSubmitting] = useState(false);
  const [runPipelineParamPreset, setRunPipelineParamPreset] = useState<Record<string, string>>({});
  const [runPipelineBackend, setRunPipelineBackend] = useState('vr');
  const [downloadUrl, setDownloadUrl] = useState('');
  const [downloadProjectName, setDownloadProjectName] = useState('');
  const [downloadProjectPickerOpen, setDownloadProjectPickerOpen] = useState(false);
  const [downloadCookiesFile, setDownloadCookiesFile] = useState<File | null>(null);
  const [downloadNoPlaylist, setDownloadNoPlaylist] = useState(true);
  const [downloadMode, setDownloadMode] = useState<'all' | 'subs' | 'media'>('all');
  const [downloadSubtitleLang, setDownloadSubtitleLang] = useState('ai-zh');
  const [downloadAnalyzeLoading, setDownloadAnalyzeLoading] = useState(false);
  const [downloadAnalyzeError, setDownloadAnalyzeError] = useState<string | null>(null);
  const [downloadAnalyzeResult, setDownloadAnalyzeResult] = useState<any>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [runPipelinePrefsReady, setRunPipelinePrefsReady] = useState(false);
  const runPipelinePrefsReadyRef = useRef(false);
  const runPipelinePrefsSourceRef = useRef<Record<string, string> | null>(null);
  const runPipelinePrefsSourceAppliedRef = useRef(false);
  const runPipelinePrefsPipelineIdRef = useRef<string | null>(null);
  const runPipelinePrefsPipelineAppliedRef = useRef(false);
  const paramPresetsLoadedRef = useRef(false);

  const TASK_PIPELINE_PREFIX = 'task:';
  const RUN_PIPELINE_PREFS_KEY = 'mediaforge.runPipelinePrefs.v1';

  const selectedFolder = vaultFolders.find(folder => folder.id === vaultFolderId) ?? null;
  const selectedFile = selectedFolder?.files.find(file => file.id === vaultFileId) ?? null;
  const runPipelineProject = vaultFolders.find(folder => folder.id === (runPipelineProjectId ?? '')) ?? null;
  const runPipelineInput = runPipelineProject?.files.find(file => file.id === runPipelineInputId) ?? null;
  const runPipelineHasUvr = Boolean(runPipelineGraph?.nodes?.some((node: any) => node?.type === 'uvr'));
  const runPipelineHasTts = runPipelineId?.startsWith(TASK_PIPELINE_PREFIX)
    ? runPipelineId.slice(TASK_PIPELINE_PREFIX.length) === 'tts'
    : Boolean(runPipelineGraph?.nodes?.some((node: any) => node?.type === 'tts'));
  const runPipelineHasDownload = runPipelineId?.startsWith(TASK_PIPELINE_PREFIX)
    ? runPipelineId.slice(TASK_PIPELINE_PREFIX.length) === 'download'
    : Boolean(runPipelineGraph?.nodes?.some((node: any) => node?.type === 'download'));
  const runPipelineHasRender = runPipelineId?.startsWith(TASK_PIPELINE_PREFIX)
    ? runPipelineId.slice(TASK_PIPELINE_PREFIX.length) === 'render'
    : Boolean(runPipelineGraph?.nodes?.some((node: any) => node?.type === 'render'));
  const renderReady = Boolean(renderVideoId);
  const renderVideoFile = runPipelineProject?.files.find(file => file.id === renderVideoId) ?? null;
  const renderAudioFile = runPipelineProject?.files.find(file => file.id === renderAudioId) ?? null;
  const renderSubtitleFile = runPipelineProject?.files.find(file => file.id === renderSubtitleId) ?? null;
  const selectProjectDefaults = () => {
    const files = runPipelineProject?.files ?? [];
    const firstVideo = files.find(file => file.type === 'video');
    const firstAudio = files.find(file => file.type === 'audio');
    const firstSubtitle = files.find(file => file.type === 'subtitle');
    setRenderVideoId(firstVideo?.id ?? null);
    setRenderAudioId(firstAudio?.id ?? null);
    setRenderSubtitleId(firstSubtitle?.id ?? null);
    setRenderInputFileIds(
      [firstVideo?.id, firstAudio?.id, firstSubtitle?.id].filter(Boolean) as string[]
    );
    setRenderStudioFocus('timeline');
    setRenderStudioItemType(null);
  };
  const renderVideoDuration = renderVideoFile?.durationSeconds ?? parseDurationToSeconds(renderVideoFile?.duration);
  const renderAudioDuration = renderAudioFile?.durationSeconds ?? parseDurationToSeconds(renderAudioFile?.duration);
  const renderSubtitleDuration = renderSubtitleFile?.durationSeconds ?? parseDurationToSeconds(renderSubtitleFile?.duration);
  const updateRenderParam = (section: 'timeline' | 'video' | 'audio' | 'subtitle', key: string, value: any) => {
    setRenderParams(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [key]: value
      }
    }));
  };

  const [renderParamsDraft, setRenderParamsDraft] = useState(renderParams);

  useEffect(() => {
    setRenderParamsDraft(renderParams);
  }, [renderParams]);

  const updateRenderParamDraft = (section: 'timeline' | 'video' | 'audio' | 'subtitle', key: string, value: any) => {
    setRenderParamsDraft(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [key]: value
      }
    }));
  };

  const commitRenderParamDraftValue = (section: 'timeline' | 'video' | 'audio' | 'subtitle', key: string) => {
    const value = (renderParamsDraft as any)?.[section]?.[key];
    updateRenderParam(section, key, value);
  };

  const commitRenderParamDraftOnEnter = (section: 'timeline' | 'video' | 'audio' | 'subtitle', key: string) =>
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') {
        commitRenderParamDraftValue(section, key);
      }
    };

  const updateRenderEffectDraft = (index: number, patch: Partial<RenderBlurRegionEffect>) => {
    setRenderParamsDraft(prev => ({
      ...prev,
      effects: prev.effects.map((e, i) => (i === index ? { ...e, ...patch } : e))
    }));
  };

  const commitRenderEffectDraftValue = (index: number, key: keyof RenderBlurRegionEffect) => {
    const value = renderParamsDraft.effects[index]?.[key];
    if (value === undefined) return;
    patchRenderEffect(index, { [key]: value } as Partial<RenderBlurRegionEffect>);
  };

  const patchRenderEffect = (index: number, patch: Partial<RenderBlurRegionEffect>) => {
    setRenderParams(prev => ({
      ...prev,
      effects: prev.effects.map((e, i) => (i === index ? { ...e, ...patch } : e))
    }));
  };

  const removeRenderEffect = (index: number) => {
    setRenderParams(prev => ({
      ...prev,
      effects: prev.effects.filter((_, i) => i !== index)
    }));
  };

  const addBlurRegionEffect = () => {
    setRenderParams(prev => ({
      ...prev,
      effects: [
        ...prev.effects,
        { type: 'blur_region' as const, left: 10, right: 10, top: 40, bottom: 40, sigma: 20, feather: 0 }
      ]
    }));
  };
  const renderTimelineMax = Math.max(
    renderVideoDuration ?? 0,
    renderAudioDuration ?? 0,
    renderSubtitleDuration ?? 0
  );
  /** Thời lượng thật = track dài nhất (hiển thị, preview, export). */
  const renderTimelineDuration = renderTimelineMax > 0 ? renderTimelineMax : 0;
  /** Chỉ UI: strip timeline rộng thêm một phần sau điểm cuối nội dung (scroll / click map theo giá trị này, thời gian clamp về duration thật). */
  const renderTimelineViewDuration =
    renderTimelineDuration > 0 ? renderTimelineDuration * (1 + RENDER_TIMELINE_VIEW_PAD) : 0;
  const renderSubtitleLanes = useMemo(() => {
    if (renderSubtitleCues.length === 0) return [];
    const sorted = [...renderSubtitleCues].sort((a, b) => {
      if (a.start !== b.start) return a.start - b.start;
      return a.end - b.end;
    });
    const lanes: Array<Array<{ start: number; end: number; text: string }>> = [];
    sorted.forEach(cue => {
      let placed = false;
      for (let i = 0; i < lanes.length; i += 1) {
        const lane = lanes[i];
        const last = lane[lane.length - 1];
        if (!last || last.end <= cue.start) {
          lane.push(cue);
          placed = true;
          break;
        }
      }
      if (!placed) lanes.push([cue]);
    });
    return lanes;
  }, [renderSubtitleCues]);
  const renderSubtitleLaneHeight = 24;
  const renderSubtitleTrackHeight = Math.max(1, renderSubtitleLanes.length) * renderSubtitleLaneHeight;
  const showRenderTimelineSubtitleTrack = Boolean(renderSubtitleFile);
  const showRenderTimelineVideoTrack = Boolean(renderVideoFile);
  const showRenderTimelineAudioTrack = Boolean(renderAudioFile);
  const showRenderTimelineEffectTracks = renderParams.effects.length > 0;
  const renderSelectedItem = useMemo(() => {
    if (renderStudioFocus !== 'item') return null;
    const files = runPipelineProject?.files ?? [];
    if (renderStudioItemType === 'video') return files.find(file => file.id === renderVideoId) ?? null;
    if (renderStudioItemType === 'audio') return files.find(file => file.id === renderAudioId) ?? null;
    if (renderStudioItemType === 'subtitle') return files.find(file => file.id === renderSubtitleId) ?? null;
    return null;
  }, [renderStudioFocus, renderStudioItemType, runPipelineProject?.files, renderVideoId, renderAudioId, renderSubtitleId]);
  const renderTimelineMinScale = renderTimelineViewDuration > 0 && renderTimelineViewportWidth > 0
    ? Math.min(1, Math.max(0.1, renderTimelineViewportWidth / (renderTimelineViewDuration * 24)))
    : 0.1;
  const renderTimelineWidth = Math.max(320, renderTimelineViewDuration * 24 * renderTimelineScale);
  const renderTimelineTickCount = Math.max(4, Math.round(renderTimelineWidth / 160));
  const downloadAnalyzeData = downloadAnalyzeResult?.data ?? null;
  const downloadAnalyzeWarnings: string[] = Array.isArray(downloadAnalyzeResult?.warnings) ? downloadAnalyzeResult.warnings : [];
  const downloadAnalyzeFormats = Array.isArray(downloadAnalyzeData?.formats) ? downloadAnalyzeData.formats : [];
  const downloadAnalyzeListSubs = Array.isArray(downloadAnalyzeResult?.listSubs) ? downloadAnalyzeResult.listSubs : [];
  const downloadAnalyzeVideoFormats = downloadAnalyzeFormats.filter((item: any) => item?.vcodec && item.vcodec !== 'none');
  const downloadAnalyzeAudioFormats = downloadAnalyzeFormats.filter((item: any) => item?.vcodec === 'none' && item?.acodec && item.acodec !== 'none');
  const downloadAnalyzeMuxedFormats = downloadAnalyzeFormats.filter((item: any) => item?.vcodec && item.vcodec !== 'none' && item?.acodec && item.acodec !== 'none');
  const bestVideoFormat = downloadAnalyzeVideoFormats
    .slice()
    .sort((a: any, b: any) => {
      const heightA = Number(a?.height ?? 0);
      const heightB = Number(b?.height ?? 0);
      if (heightB !== heightA) return heightB - heightA;
      const tbrA = Number(a?.tbr ?? 0);
      const tbrB = Number(b?.tbr ?? 0);
      return tbrB - tbrA;
    })[0];
  const bestMuxedFormat = downloadAnalyzeMuxedFormats
    .slice()
    .sort((a: any, b: any) => {
      const heightA = Number(a?.height ?? 0);
      const heightB = Number(b?.height ?? 0);
      if (heightB !== heightA) return heightB - heightA;
      const tbrA = Number(a?.tbr ?? 0);
      const tbrB = Number(b?.tbr ?? 0);
      return tbrB - tbrA;
    })[0];
  const bestAudioFormat = downloadAnalyzeAudioFormats
    .slice()
    .sort((a: any, b: any) => {
      const abrA = Number(a?.abr ?? 0);
      const abrB = Number(b?.abr ?? 0);
      if (abrB !== abrA) return abrB - abrA;
      const tbrA = Number(a?.tbr ?? 0);
      const tbrB = Number(b?.tbr ?? 0);
      return tbrB - tbrA;
    })[0];
  const bestSingleFormat = bestMuxedFormat ?? bestVideoFormat ?? bestAudioFormat ?? null;
  const downloadAnalyzeSubtitleCount = downloadAnalyzeListSubs.length;

  const showToast = (message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') => {
    setToastType(type);
    setToastMessage(message);
    setToastVisible(true);
  };

  const toastStyles: Record<'info' | 'success' | 'warning' | 'error', string> = {
    info: 'border-zinc-500/30 bg-zinc-500/15 text-zinc-200',
    success: 'border-lime-500/30 bg-lime-500/15 text-lime-200',
    warning: 'border-amber-500/30 bg-amber-500/15 text-amber-200',
    error: 'border-red-500/30 bg-red-500/15 text-red-200'
  };

  const forgeProject = vaultFolders.find(folder => folder.id === (vrProjectId ?? vaultFolders[0]?.id));
  const forgeInputs = (forgeProject?.files ?? []).filter(file => file.type === 'video' || file.type === 'audio');
  const selectedForgeInput = forgeInputs.find(file => file.id === vrInputId) ?? forgeInputs[0] ?? null;

  const filteredFolders = vaultFolders.filter(folder => {
    if (!vaultFolderQuery.trim()) return true;
    return folder.name.toLowerCase().includes(vaultFolderQuery.toLowerCase());
  });

  const fileTypeIcons: Record<VaultFileType, any> = {
    video: FileVideo,
    audio: FileAudio,
    subtitle: Type,
    image: Image,
    output: FileVideo,
    other: FileAudio
  };

  const fileTypeLabels: Record<VaultFileType, string> = {
    video: 'Video',
    audio: 'Audio',
    subtitle: 'Subtitle',
    image: 'Image',
    output: 'Output',
    other: 'Other'
  };


  const filteredFiles = (selectedFolder?.files ?? [])
    .filter(file => (vaultTypeFilter === 'all' ? true : file.type === vaultTypeFilter))
    .filter(file => {
      if (!vaultQuery.trim()) return true;
      const query = vaultQuery.toLowerCase();
      return file.name.toLowerCase().includes(query) || (file.language ?? '').toLowerCase().includes(query);
    })
    .sort((a, b) => {
      if (vaultSort === 'name') return a.name.localeCompare(b.name);
      if (vaultSort === 'size') return a.size.localeCompare(b.size);
      return b.createdAt.localeCompare(a.createdAt);
    });

  const groupedFiles = ['video', 'audio', 'subtitle', 'image', 'output', 'other'].map(type => ({
    type: type as VaultFileType,
    items: filteredFiles.filter(file => file.type === type)
  }));

  const activeJobCount = jobs.filter(job => job.status === 'queued' || job.status === 'processing').length;
  const completedJobCount = jobs.filter(job => job.status === 'completed').length;
  const failedJobCount = jobs.filter(job => job.status === 'failed').length;
  const settledJobCount = completedJobCount + failedJobCount;
  const successRate = settledJobCount > 0 ? Math.round((completedJobCount / settledJobCount) * 1000) / 10 : null;
  const activeJob = jobs.find(job => job.status === 'processing') ?? jobs.find(job => job.status === 'queued') ?? null;
  const jobLogTarget = jobs.find(job => job.id === jobLogJobId) ?? activeJob;
  const jobContextTarget = jobs.find(job => job.id === jobContextMenu.jobId) ?? null;
  const pipelineContextTarget = pipelineLibrary.find(item => item.id === pipelineContextMenu.pipelineId) ?? null;

  const previewGroups = (folder: VaultFolder) => ([
    { type: 'video' as VaultFileType, label: 'Video' },
    { type: 'audio' as VaultFileType, label: 'Audio' },
    { type: 'subtitle' as VaultFileType, label: 'Subtitle' },
    { type: 'image' as VaultFileType, label: 'Image' },
    { type: 'other' as VaultFileType, label: 'Other' }
  ]).map(group => ({
    ...group,
    items: folder.files.filter(file => file.type === group.type)
  }));

  const buildTooltip = (files: VaultFile[]) =>
    files.length ? files.map(file => file.name).join('\n') : 'No files';

  const PREFERRED_TTS_VOICES = ['vi-VN-HoaiMyNeural', 'vi-VN-NamMinhNeural'];
  const DOWNLOAD_MODE_OPTIONS = [
    { value: 'all', label: 'All (subs + audio + video)' },
    { value: 'subs', label: 'Subtitles only' },
    { value: 'media', label: 'Audio + video only' }
  ];

  const getParamPresetsForType = (taskType: string) => (
    paramPresets
      .filter(preset => preset.taskType === taskType)
      .slice()
      .sort((a, b) => {
        const labelA = (a.label || '').trim().toLowerCase();
        const labelB = (b.label || '').trim().toLowerCase();
        if (!labelA && !labelB) return a.id - b.id;
        if (!labelA) return 1;
        if (!labelB) return -1;
        const cmp = labelA.localeCompare(labelB);
        return cmp !== 0 ? cmp : a.id - b.id;
      })
  );

  const hasParamPresets = (taskType: string) => getParamPresetsForType(taskType).length > 0;

  const getSelectedParamPresetId = (taskType: string) => {
    const value = runPipelineParamPreset[taskType];
    if (typeof value === 'string' && value.startsWith('preset:')) {
      const id = Number(value.slice('preset:'.length));
      return Number.isFinite(id) ? id : null;
    }
    return null;
  };

  const getSelectedParamPreset = (taskType: string) => {
    const selectedId = getSelectedParamPresetId(taskType);
    if (selectedId !== null) {
      return paramPresets.find(preset => preset.id === selectedId) ?? null;
    }
    return getParamPresetsForType(taskType)[0] ?? null;
  };

  const getSelectedParamPresetLabel = (taskType: string) => {
    const selected = getSelectedParamPreset(taskType);
    if (selected?.label) return selected.label;
    const fallback = availableTasks.find(task => task.type === taskType)?.label ?? taskType;
    return fallback;
  };

  const getSelectedParamPresetParams = (taskType: string) => getSelectedParamPreset(taskType)?.params ?? {};

  const formatDefaultValue = (value: any) => {
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (value === null || value === undefined) return '--';
    return String(value);
  };

  const isParamOverridden = (taskType: string, key: string, currentValue: any) => {
    if (!runPipelineParamPreset[taskType] || runPipelineParamPreset[taskType] === 'custom') return false;
    const presetParams = getSelectedParamPresetParams(taskType);
    if (!(key in presetParams)) return false;
    const normalize = (value: any) => (value === null || value === undefined ? '' : String(value));
    return normalize(currentValue) !== normalize(presetParams[key]);
  };

  const normalizePresetValue = (value: any) => (value === null || value === undefined ? '' : String(value));

  const isRenderPresetDirty = React.useMemo(() => {
    const selectedId = getSelectedParamPresetId('render');
    if (!selectedId) return false;
    const presetParams = getSelectedParamPresetParams('render');
    if (!presetParams || typeof presetParams !== 'object') return false;
    for (const [key, value] of Object.entries(presetParams)) {
      if (key === 'effects.list') {
        try {
          const parsed = JSON.parse(String(value));
          const normalized = normalizeLoadedRenderEffects(parsed);
          if (normalized === undefined) continue;
          if (JSON.stringify(normalized) !== JSON.stringify(renderParams.effects)) return true;
        } catch {
          continue;
        }
        continue;
      }
      if (!key.includes('.')) continue;
      const [section, field] = key.split('.');
      if (section !== 'timeline' && section !== 'video' && section !== 'audio' && section !== 'subtitle') continue;
      const sectionObj = (renderParams as any)[section];
      if (!sectionObj || !(field in sectionObj)) continue;
      if (normalizePresetValue(sectionObj[field]) !== normalizePresetValue(value)) return true;
    }
    return false;
  }, [renderParams, runPipelineParamPreset.render, paramPresets]);

  const applyParamPresetParams = (taskType: string) => {
    const params = getSelectedParamPresetParams(taskType);
    if (!params || typeof params !== 'object') return;
    if (taskType === 'uvr') {
      if (params.backend !== undefined) setRunPipelineBackend(String(params.backend));
      if (params.model !== undefined) setVrModel(String(params.model));
      if (params.outputFormat !== undefined) {
        setVrOutputType(String(params.outputFormat) as 'Mp3' | 'Wav' | 'Flac');
      }
      return;
    }
    if (taskType === 'tts') {
      if (params.voice !== undefined) setRunPipelineTtsVoice(String(params.voice));
      if (params.rate !== undefined) setRunPipelineTtsRate(String(params.rate));
      if (params.pitch !== undefined) setRunPipelineTtsPitch(String(params.pitch));
      if (params.overlapMode !== undefined) {
        const mode = String(params.overlapMode);
        if (mode === 'overlap' || mode === 'truncate') {
          setRunPipelineTtsOverlapMode(mode);
        }
      }
      if (params.removeLineBreaks !== undefined) {
        setRunPipelineTtsRemoveLineBreaks(Boolean(params.removeLineBreaks));
      }
      return;
    }
    if (taskType === 'download') {
      if (params.downloadMode !== undefined) {
        const mode = String(params.downloadMode);
        if (mode === 'all' || mode === 'subs' || mode === 'media') {
          setDownloadMode(mode);
        }
      }
      if (params.subLangs !== undefined) setDownloadSubtitleLang(String(params.subLangs));
      if (params.noPlaylist !== undefined) setDownloadNoPlaylist(Boolean(params.noPlaylist));
      return;
    }
    if (taskType === 'render') {
      Object.entries(params).forEach(([key, value]) => {
        if (key === 'effects.list') {
          if (value === undefined || value === null) return;
          try {
            const parsed = JSON.parse(String(value));
            const normalized = normalizeLoadedRenderEffects(parsed);
            if (normalized !== undefined) {
              setRenderParams(prev => ({ ...prev, effects: normalized }));
            }
          } catch {
            /* ignore invalid preset JSON */
          }
          return;
        }
        if (!key.includes('.')) return;
        const [section, field] = key.split('.');
        if (section !== 'timeline' && section !== 'video' && section !== 'audio' && section !== 'subtitle') return;
        if (value === undefined || value === null) return;
        if (section === 'audio' && (field === 'normalize' || field === 'pan' || field === 'channelMode')) return;
        if (section === 'audio' && field === 'mute') {
          updateRenderParam('audio', 'mute', Boolean(value));
          return;
        }
        updateRenderParam(section as 'timeline' | 'video' | 'audio' | 'subtitle', field, String(value));
      });
    }
  };

  const handleParamPresetChange = (taskType: string, value: string) => {
    setRunPipelineParamPreset(prev => ({ ...prev, [taskType]: value }));
    if (value !== 'custom') {
      applyParamPresetParams(taskType);
    }
  };

  const applySubtitleStylePreset = (preset: SubtitleStylePreset) => {
    setRenderParams(prev => ({
      ...prev,
      subtitle: {
        ...prev.subtitle,
        ...BASE_SUBTITLE_STYLE,
        ...preset.style,
        fontName: prev.subtitle.fontName,
        fontSize: prev.subtitle.fontSize
      }
    }));
  };

  const isSubtitlePresetActive = (preset: SubtitleStylePreset) => {
    const merged = { ...BASE_SUBTITLE_STYLE, ...preset.style };
    return (Object.keys(merged) as Array<keyof RenderSubtitleAssState>).every(key => {
      if (key === 'fontName' || key === 'fontSize') return true;
      const current = renderParams.subtitle[key];
      const next = merged[key];
      if (next === undefined) return true;
      return String(current) === String(next);
    });
  };

  const onRenderTimelineMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const target = renderTimelineScrollRef.current;
    if (!target) return;
    event.preventDefault();
    renderTimelineDragRef.current.active = true;
    renderTimelineDragRef.current.startX = event.pageX;
    renderTimelineDragRef.current.scrollLeft = target.scrollLeft;
    renderTimelineDragRef.current.moved = false;
  };

  const onRenderTimelineMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!renderTimelineDragRef.current.active) return;
    const target = renderTimelineScrollRef.current;
    if (!target) return;
    if (event.buttons === 0) {
      renderTimelineDragRef.current.active = false;
      return;
    }
    const delta = event.pageX - renderTimelineDragRef.current.startX;
    if (Math.abs(delta) > 3) {
      renderTimelineDragRef.current.moved = true;
    }
    target.scrollLeft = renderTimelineDragRef.current.scrollLeft - delta;
  };

  const onRenderTimelineMouseUp = () => {
    renderTimelineDragRef.current.active = false;
  };

  const onRenderTimelineClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = renderTimelineScrollRef.current;
    if (!target) return;
    if (renderTimelineDragRef.current.moved) {
      renderTimelineDragRef.current.moved = false;
      return;
    }
    setRenderStudioFocus('timeline');
    setRenderStudioItemType(null);
    if (renderTimelineDuration <= 0 || renderTimelineViewDuration <= 0) return;
    const rect = target.getBoundingClientRect();
    const x = event.clientX - rect.left + target.scrollLeft;
    const clamped = Math.max(0, Math.min(renderTimelineWidth, x));
    const secondsRaw = (clamped / renderTimelineWidth) * renderTimelineViewDuration;
    const seconds = Math.max(0, Math.min(renderTimelineDuration, secondsRaw));
    setRenderPlayheadSeconds(seconds);
  };

  const onRenderTimelineWheelNative = (event: WheelEvent) => {
    const target = renderTimelineScrollRef.current;
    if (!target) return;
    if (!event.ctrlKey) return;
    if (!(event.target instanceof Node) || !target.contains(event.target)) return;
    event.preventDefault();
    setRenderTimelineScale(prev => {
      const next = Math.max(renderTimelineMinScale, Math.min(4, prev + (event.deltaY > 0 ? -0.25 : 0.25)));
      return Number(next.toFixed(2));
    });
  };

  useEffect(() => {
    const handleWindowMouseUp = () => {
      renderTimelineDragRef.current.active = false;
    };
    window.addEventListener('mouseup', handleWindowMouseUp);
    return () => {
      window.removeEventListener('mouseup', handleWindowMouseUp);
    };
  }, []);

  useEffect(() => {
    const target = renderTimelineScrollRef.current;
    if (!target) return;
    const updateWidth = () => {
      if (!renderTimelineScrollRef.current) return;
      setRenderTimelineViewportWidth(renderTimelineScrollRef.current.clientWidth);
    };
    const observer = new ResizeObserver(updateWidth);
    observer.observe(target);
    const raf = requestAnimationFrame(updateWidth);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [showRenderStudio, renderTimelineViewDuration]);

  useEffect(() => {
    if (renderTimelineScale < renderTimelineMinScale) {
      setRenderTimelineScale(renderTimelineMinScale);
    }
  }, [renderTimelineMinScale, renderTimelineScale]);

  useEffect(() => {
    if (showRenderStudio) {
      if (!prevShowRenderStudioForZoomRef.current) {
        setRenderTimelineScale(renderTimelineMinScale);
      }
      prevShowRenderStudioForZoomRef.current = true;
    } else {
      prevShowRenderStudioForZoomRef.current = false;
    }
  }, [showRenderStudio, renderTimelineMinScale]);

  useEffect(() => {
    if (renderTimelineDuration <= 0) return;
    setRenderPlayheadSeconds(prev => Math.min(prev, renderTimelineDuration));
  }, [renderTimelineDuration]);

  const renderPreviewParamsKey = JSON.stringify(renderParams);

  useEffect(() => {
    if (!showRenderStudio) return;
    if (renderStudioFocus !== 'timeline') {
      setRenderPreviewLoading(false);
      return;
    }
    if (!renderVideoFile?.relativePath) {
      setRenderPreviewUrl(null);
      setRenderPreviewError(null);
      setRenderPreviewLoading(false);
      return;
    }
    const controller = new AbortController();
    const RENDER_PREVIEW_DEBOUNCE_MS = 380;
    const timeout = window.setTimeout(async () => {
      try {
        setRenderPreviewLoading(true);
        setRenderPreviewError(null);
        const previewRes = parseResolution(renderParams.timeline.resolution);
        const params = new URLSearchParams({
          videoPath: renderVideoFile.relativePath,
          at: String(
            Math.max(
              0,
              renderTimelineDuration > 0
                ? Math.min(renderPlayheadSeconds, renderTimelineDuration)
                : renderPlayheadSeconds
            )
          )
        });
        if (renderSubtitleFile?.relativePath) {
          params.set('subtitlePath', renderSubtitleFile.relativePath);
          params.set(
            'subtitleStyle',
            JSON.stringify({
              ...renderParams.subtitle,
              playResX: previewRes.w,
              playResY: previewRes.h
            })
          );
        }
        if (renderParams.effects.length > 0) {
          params.set('effects', JSON.stringify(renderParams.effects));
        }
        const response = await fetch(`/api/render-preview?${params.toString()}`, { signal: controller.signal });
        const useBlackPreview = () => {
          setRenderPreviewUrl(prev => {
            if (prev?.startsWith('blob:')) URL.revokeObjectURL(prev);
            return RENDER_PREVIEW_BLACK_DATA_URL;
          });
          setRenderPreviewError(null);
        };

        if (!response.ok) {
          useBlackPreview();
          return;
        }
        const blob = await response.blob();
        if (!blob.type.startsWith('image/')) {
          useBlackPreview();
          return;
        }
        const url = URL.createObjectURL(blob);
        setRenderPreviewUrl(prev => {
          if (prev?.startsWith('blob:')) URL.revokeObjectURL(prev);
          return url;
        });
        setRenderPreviewError(null);
      } catch (error) {
        if (controller.signal.aborted) return;
        setRenderPreviewUrl(prev => {
          if (prev?.startsWith('blob:')) URL.revokeObjectURL(prev);
          return RENDER_PREVIEW_BLACK_DATA_URL;
        });
        setRenderPreviewError(null);
      } finally {
        if (!controller.signal.aborted) setRenderPreviewLoading(false);
      }
    }, RENDER_PREVIEW_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [
    showRenderStudio,
    renderStudioFocus,
    renderVideoFile?.relativePath,
    renderSubtitleFile?.relativePath,
    renderPlayheadSeconds,
    renderTimelineDuration,
    renderPreviewParamsKey
  ]);

  useEffect(() => {
    if (!showRenderStudio) return;
    if (!renderSubtitleFile?.relativePath) {
      setRenderSubtitleCues([]);
      return;
    }
    const controller = new AbortController();
    const load = async () => {
      try {
        const response = await fetch(`/api/vault/text?path=${encodeURIComponent(renderSubtitleFile.relativePath)}`, {
          signal: controller.signal
        });
        if (!response.ok) return;
        const data = await response.json().catch(() => ({}));
        const content = typeof data.content === 'string' ? data.content : '';
        const cues = parseSubtitleCues(content);
        setRenderSubtitleCues(cues);
      } catch {
        if (controller.signal.aborted) return;
        setRenderSubtitleCues([]);
      }
    };
    load();
    return () => controller.abort();
  }, [showRenderStudio, renderSubtitleFile?.relativePath]);

  useEffect(() => {
    return () => {
      setRenderPreviewUrl(prev => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    };
  }, []);

  useEffect(() => {
    window.addEventListener('wheel', onRenderTimelineWheelNative, { passive: false, capture: true });
    return () => {
      window.removeEventListener('wheel', onRenderTimelineWheelNative as EventListener, { capture: true } as AddEventListenerOptions);
    };
  }, []);


  const switchPresetToManual = (taskType: string) => {
    if (runPipelineParamPreset[taskType] === 'custom') return;
    applyParamPresetParams(taskType);
    setRunPipelineParamPreset(prev => ({ ...prev, [taskType]: 'custom' }));
  };

  const resolvePipelineIcon = (pipeline: PipelineSummary) => {
    const type = pipeline.primaryType ?? (pipeline.kind === 'task' ? pipeline.id.slice(TASK_PIPELINE_PREFIX.length) : null);
    const task = type ? availableTasks.find(item => item.type === type) : null;
    return task?.icon ?? File;
  };

  const buildSingleTaskGraph = (task: { type: string; label: string; inputs: string[]; outputs: string[] }) => ({
    nodes: [
      {
        id: `${task.type}-1`,
        type: task.type,
        label: task.label,
        inputs: task.inputs,
        outputs: task.outputs,
        x: 120,
        y: 80
      }
    ],
    edges: []
  });

  const availableTasks = React.useMemo(() => ([
    {
      type: 'download',
      icon: Download,
      label: 'Download',
      desc: 'Download video and subtitles using yt-dlp.',
      inputs: ['URL'],
      outputs: ['Project'],
      params: [
        { name: 'downloadMode', desc: 'Download scope: all | subs | media.', type: 'string', default: 'all' },
        { name: 'subLangs', desc: 'Subtitle language codes (comma-separated).', type: 'string', default: 'ai-zh' },
        { name: 'noPlaylist', desc: 'Disable playlist downloads.', type: 'boolean', default: true }
      ]
    },
    {
      type: 'uvr',
      icon: FileAudio,
      label: 'Vocal Removal',
      desc: 'Separate stems using UVR5.',
      inputs: ['Video/Audio'],
      outputs: ['Audio'],
      params: [
        { name: 'backend', desc: 'Processing backend', type: 'string', default: 'vr' },
        { name: 'model', desc: 'Model file to use', type: 'string', default: 'MGM_MAIN_v4.pth' },
        { name: 'outputFormat', desc: 'Output audio format', type: 'string', default: 'Mp3' }
      ]
    },
    {
      type: 'tts',
      icon: FileAudio,
      label: 'Text-to-Speech',
      desc: 'Generate speech audio from subtitle.',
      inputs: ['Subtitle'],
      outputs: ['Audio'],
      params: [
        { name: 'voice', desc: 'Voice name', type: 'string', default: 'vi-VN-HoaiMyNeural' },
        { name: 'rate', desc: 'Speaking rate factor', type: 'number', default: 1 },
        { name: 'pitch', desc: 'Pitch in semitone', type: 'number', default: 0 }
      ],
      preview: 'tts'
    },
    {
      type: 'render',
      icon: FileVideo,
      label: 'Render',
      desc: 'Combine video, audio, and subtitle into final output.',
      inputs: ['Files'],
      outputs: ['Video'],
      params: [
        { name: 'timeline.framerate', desc: 'Frame rate', type: 'number', default: 30 },
        { name: 'timeline.resolution', desc: 'Output resolution (e.g. 1920x1080)', type: 'string', default: '1920x1080' },
        { name: 'video.trimStart', desc: 'Trim start (s)', type: 'number', default: 0 },
        { name: 'video.trimEnd', desc: 'Trim end (s)', type: 'number', default: 0 },
        { name: 'video.speed', desc: 'Playback speed', type: 'number', default: 1 },
        { name: 'video.volume', desc: 'Video audio volume (%)', type: 'number', default: 100 },
        { name: 'video.fit', desc: 'contain | cover | stretch', type: 'string', default: 'contain' },
        { name: 'video.positionX', desc: 'Position X (%)', type: 'number', default: 50 },
        { name: 'video.positionY', desc: 'Position Y (%)', type: 'number', default: 50 },
        { name: 'video.scale', desc: 'Scale', type: 'number', default: 1 },
        { name: 'video.rotation', desc: 'Rotation (deg)', type: 'number', default: 0 },
        { name: 'video.opacity', desc: 'Opacity (%)', type: 'number', default: 100 },
        { name: 'video.colorLut', desc: 'Color LUT id', type: 'string', default: '' },
        { name: 'video.cropX', desc: 'Crop X (%)', type: 'number', default: 0 },
        { name: 'video.cropY', desc: 'Crop Y (%)', type: 'number', default: 0 },
        { name: 'video.cropW', desc: 'Crop W (%)', type: 'number', default: 100 },
        { name: 'video.cropH', desc: 'Crop H (%)', type: 'number', default: 100 },
        { name: 'video.fadeIn', desc: 'Fade in (s)', type: 'number', default: 0 },
        { name: 'video.fadeOut', desc: 'Fade out (s)', type: 'number', default: 0 },
        { name: 'audio.gainDb', desc: 'Gain (dB)', type: 'number', default: 0 },
        { name: 'audio.mute', desc: 'Mute audio', type: 'boolean', default: false },
        { name: 'audio.fadeIn', desc: 'Fade in (s)', type: 'number', default: 0 },
        { name: 'audio.fadeOut', desc: 'Fade out (s)', type: 'number', default: 0 },
        { name: 'subtitle.fontName', desc: 'ASS Fontname (libass)', type: 'string', default: 'Arial' },
        { name: 'subtitle.fontSize', desc: 'Font size (px at PlayRes)', type: 'number', default: 72 },
        { name: 'subtitle.primaryColor', desc: 'Primary fill #RRGGBB', type: 'string', default: '#ffffff' },
        { name: 'subtitle.outlineColor', desc: 'Outline #RRGGBB', type: 'string', default: '#000000' },
        { name: 'subtitle.bold', desc: '1 = bold', type: 'string', default: '0' },
        { name: 'subtitle.italic', desc: '1 = italic', type: 'string', default: '0' },
        { name: 'subtitle.spacing', desc: 'Character spacing', type: 'number', default: 0 },
        { name: 'subtitle.outline', desc: 'Outline width', type: 'number', default: 2 },
        { name: 'subtitle.shadow', desc: 'Shadow depth', type: 'number', default: 2 },
        { name: 'subtitle.alignment', desc: 'ASS numpad 1–9', type: 'number', default: 2 },
        { name: 'subtitle.marginL', desc: 'MarginL px (PlayRes)', type: 'number', default: 30 },
        { name: 'subtitle.marginR', desc: 'MarginR px (PlayRes)', type: 'number', default: 30 },
        { name: 'subtitle.marginV', desc: 'MarginV px (PlayRes)', type: 'number', default: 36 },
        { name: 'subtitle.wrapStyle', desc: 'Script WrapStyle 0–3', type: 'number', default: 0 },
        { name: 'effects.list', desc: 'JSON array of effects (blur_region: left,right,top,bottom,sigma,feather 0–20)', type: 'string', default: '[]' }
      ]
    }
  ]), []);

  const paramPresetCards = paramPresets
    .map(preset => {
      const task = availableTasks.find(item => item.type === preset.taskType);
      const params = preset.params && typeof preset.params === 'object'
        ? Object.keys(preset.params).filter(key => preset.params[key] !== undefined)
        : [];
      return {
        id: preset.id,
        type: preset.taskType,
        label: preset.label || task?.label || preset.taskType,
        taskLabel: task?.label ?? preset.taskType,
        icon: task?.icon,
        params: params.map(name => ({ name }))
      };
    })
    .filter(node => node.params.length > 0);

  const paramPresetContextTarget = paramPresetCards.find(node => node.id === paramPresetContextMenu.presetId) ?? null;

  const paramPresetTask = availableTasks.find(task => task.type === paramPresetTaskType) ?? null;

  const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const getDefaultParamPresetName = (taskLabel: string, taskType: string) => {
    const matcher = new RegExp(`^${escapeRegExp(taskLabel)}\\s+preset\\s+(\\d+)$`, 'i');
    let maxIndex = 0;
    const candidates = paramPresets.filter(preset => preset.taskType === taskType);
    candidates.forEach(preset => {
      const label = (preset.label || taskLabel || '').trim();
      const match = label.match(matcher);
      if (!match) return;
      const value = Number(match[1]);
      if (Number.isFinite(value)) {
        maxIndex = Math.max(maxIndex, value);
      }
    });
    return `${taskLabel} preset ${maxIndex + 1}`;
  };

  const buildRenderParamPresetPayload = (): Record<string, string | boolean> => {
    const out: Record<string, string | boolean> = {};
    out['timeline.framerate'] = String(renderParams.timeline.framerate);
    out['timeline.resolution'] = String(renderParams.timeline.resolution);
    Object.entries(renderParams.video).forEach(([k, v]) => {
      out[`video.${k}`] = typeof v === 'boolean' ? v : String(v);
    });
    Object.entries(renderParams.audio).forEach(([k, v]) => {
      out[`audio.${k}`] = typeof v === 'boolean' ? v : String(v);
    });
    Object.entries(renderParams.subtitle).forEach(([k, v]) => {
      out[`subtitle.${k}`] = typeof v === 'boolean' ? v : String(v);
    });
    out['effects.list'] = JSON.stringify(renderParams.effects);
    return out;
  };

  const saveRenderStudioParamPreset = async (mode: 'save' | 'saveAs') => {
    const defaultName = getDefaultParamPresetName('Render', 'render');
    const selectedId = getSelectedParamPresetId('render');
    const selectedPreset = getSelectedParamPreset('render');
    let label = (selectedPreset?.label ?? '').trim();
    let targetId: number | null = null;

    if (mode === 'save' && selectedId) {
      targetId = selectedId;
      if (!label) label = defaultName;
    } else {
      const labelInput = window.prompt('Tên preset:', label || defaultName);
      if (labelInput === null) return;
      label = labelInput.trim();
      if (!label) {
        showToast('Nhập tên preset.', 'warning');
        return;
      }
    }

    const params = buildRenderParamPresetPayload();
    setSaveRenderPresetLoading(true);
    try {
      const response = await fetch('/api/param-presets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskType: 'render', params, label, ...(targetId ? { id: targetId } : {}) })
      });
      if (!response.ok) throw new Error('save failed');
      const data = await response.json().catch(() => ({}));
      const savedId = Number(data?.id);
      await loadParamPresets();
      if (Number.isFinite(savedId)) {
        setRunPipelineParamPreset(prev => ({ ...prev, render: `preset:${savedId}` }));
      }
      showToast(
        mode === 'save' && targetId
          ? 'Đã lưu preset Render.'
          : 'Đã lưu preset Render mới.',
        'success'
      );
    } catch {
      showToast('Không lưu được preset.', 'error');
    } finally {
      setSaveRenderPresetLoading(false);
    }
  };

  const openParamPresetEditor = (taskType?: string, mode: 'create' | 'edit' = 'create') => {
    const fallbackType = availableTasks[0]?.type ?? '';
    setParamPresetEditorMode(mode);
    setParamPresetTaskType(taskType ?? fallbackType);
    setParamPresetEditingId(null);
    setShowParamPresetEditor(true);
  };

  const openParamPresetEditorForEdit = (presetId: number) => {
    const target = paramPresets.find(preset => preset.id === presetId);
    if (!target) return;
    setParamPresetEditorMode('edit');
    setParamPresetEditingId(presetId);
    setParamPresetTaskType(target.taskType);
    setShowParamPresetEditor(true);
  };

  const saveParamPreset = async () => {
    if (!paramPresetTask) return;
    const params: Record<string, any> = {};
    (paramPresetTask.params ?? []).forEach(param => {
      const raw = paramPresetValues[param.name];
      if (raw === undefined || (typeof raw === 'string' && raw.trim() === '')) return;
      if (param.type === 'number') {
        const numeric = Number(raw);
        if (Number.isFinite(numeric)) {
          params[param.name] = numeric;
        }
        return;
      }
      if (param.type === 'boolean') {
        params[param.name] = Boolean(raw);
        return;
      }
      params[param.name] = raw;
    });
    if (Object.keys(params).length === 0) {
      showToast('Please set at least one param value.', 'error');
      return;
    }
    try {
      const label = paramPresetLabelDraft.trim() || paramPresetTask.label;
      const normalizedLabel = label.trim().toLowerCase();
      const hasDuplicateLabel = paramPresets.some(preset => {
        if (paramPresetEditingId !== null && preset.id === paramPresetEditingId) return false;
        return preset.label.trim().toLowerCase() === normalizedLabel;
      });
      if (hasDuplicateLabel) {
        showToast('Param preset name already exists.', 'error');
        return;
      }
      const response = await fetch('/api/param-presets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: paramPresetEditingId ?? undefined,
          taskType: paramPresetTask.type,
          params,
          label
        })
      });
      if (!response.ok) throw new Error('Unable to save');
      const data = await response.json().catch(() => ({}));
      const savedId = Number.isFinite(Number(data?.id)) ? Number(data.id) : paramPresetEditingId;
      if (paramPresetEditorMode === 'create' && savedId) {
        setRunPipelineParamPreset(prev => {
          if (prev[paramPresetTask.type] === 'custom') return prev;
          return { ...prev, [paramPresetTask.type]: `preset:${savedId}` };
        });
      }
      await loadParamPresets();
      showToast('Param preset saved.', 'success');
      setShowParamPresetEditor(false);
    } catch {
      showToast('Unable to save param preset.', 'error');
    }
  };

  const deleteParamPreset = async (presetId: number, taskType: string) => {
    try {
      await fetch(`/api/param-presets/${presetId}`, {
        method: 'DELETE'
      });
      setRunPipelineParamPreset(prev => {
        const selected = prev[taskType];
        if (selected !== `preset:${presetId}`) return prev;
        return { ...prev, [taskType]: 'custom' };
      });
      showToast('Param preset deleted.', 'success');
      await loadParamPresets();
    } catch {
      showToast('Unable to delete param preset.', 'error');
    }
  };

  useEffect(() => {
    if (!showParamPresetEditor) return;
    const task = availableTasks.find(item => item.type === paramPresetTaskType) ?? availableTasks[0];
    if (!task) return;
    if (paramPresetTaskType !== task.type) {
      setParamPresetTaskType(task.type);
    }
    const editingPreset = paramPresetEditingId
      ? paramPresets.find(preset => preset.id === paramPresetEditingId)
      : null;
    const savedParams = editingPreset?.params ?? {};
    const nextValues: Record<string, string | boolean> = {};
    (task.params ?? []).forEach(param => {
      const savedValue = savedParams[param.name];
      if (savedValue !== undefined) {
        nextValues[param.name] = param.type === 'boolean' ? Boolean(savedValue) : String(savedValue);
      } else if (param.default !== undefined) {
        nextValues[param.name] = param.type === 'boolean' ? Boolean(param.default) : String(param.default);
      } else {
        nextValues[param.name] = param.type === 'boolean' ? false : '';
      }
    });
    setParamPresetValues(nextValues);
    if (paramPresetEditorMode === 'create') {
      setParamPresetLabelDraft(getDefaultParamPresetName(task.label, task.type));
    } else {
      setParamPresetLabelDraft(editingPreset?.label ?? task.label);
    }
  }, [showParamPresetEditor, paramPresetTaskType, paramPresetEditingId, paramPresets, availableTasks, paramPresetEditorMode]);

  const handleTaskDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const taskType = event.dataTransfer.getData('text/task');
    const task = availableTasks.find(item => item.type === taskType);
    if (!task) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    const dropX = rect ? event.clientX - rect.left : 40;
    const dropY = rect ? event.clientY - rect.top : 40;
    const nodeId = `${task.type}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setGraphNodes(prev => [
      ...prev,
      {
        id: nodeId,
        type: task.type,
        label: task.label,
        inputs: task.inputs,
        outputs: task.outputs,
        x: Math.max(20, dropX - 120),
        y: Math.max(20, dropY - 40)
      }
    ]);
    setPipelineTasks(prev => [
      ...prev,
      {
        id: `${task.type}-${Date.now()}-${prev.length}`,
        type: task.type,
        label: task.label,
        inputs: task.inputs,
        outputs: task.outputs
      }
    ]);
  };

  const openConfirm = (config: {
    title: string;
    description?: string;
    confirmLabel?: string;
    variant?: 'danger' | 'primary';
  }, onConfirm: () => void) => {
    confirmActionRef.current = onConfirm;
    setConfirmState({
      open: true,
      title: config.title,
      description: config.description,
      confirmLabel: config.confirmLabel,
      variant: config.variant ?? 'primary'
    });
  };

  const openPipelinePreview = (pipeline: PipelineSummary) => {
    if (pipeline.kind !== 'task') return;
    const taskType = pipeline.primaryType ?? pipeline.id.slice(TASK_PIPELINE_PREFIX.length);
    const task = availableTasks.find(item => item.type === taskType);
    setPipelinePreviewTask(task ?? null);
    setShowPipelinePreview(true);
    setPreviewTtsError(null);
    if (task?.params?.length) {
      const defaults: Record<string, string | number> = {};
      task.params.forEach(param => {
        if (param.default !== undefined) {
          defaults[param.name] = param.default;
        }
      });
      setPreviewCustomParams(defaults);
      if (task.type === 'tts') {
        if (defaults.voice !== undefined) setPreviewTtsVoice(String(defaults.voice));
        setPreviewTtsRate(fromEdgeTtsRate(defaults.rate !== undefined ? String(defaults.rate) : undefined));
        setPreviewTtsPitch(fromEdgeTtsPitch(defaults.pitch !== undefined ? String(defaults.pitch) : undefined));
      }
    } else {
      setPreviewCustomParams({});
    }
    if (previewTtsUrl) {
      URL.revokeObjectURL(previewTtsUrl);
      setPreviewTtsUrl(null);
    }
  };

  useEffect(() => {
    if (showPipelinePreview && pipelinePreviewTask?.preview === 'tts') {
      setPreviewTtsVoicesLoading(false);
    }
  }, [showPipelinePreview, pipelinePreviewTask?.preview]);

  useEffect(() => {
    if (!showRunPipeline) return;
    if (runAgainPrefillRef.current) {
      runAgainPrefillRef.current = false;
      return;
    }

    if (runPipelineHasTts && runPipelineParamPreset.tts !== 'custom') {
      applyParamPresetParams('tts');
    }

    if (runPipelineHasUvr && runPipelineParamPreset.uvr !== 'custom') {
      applyParamPresetParams('uvr');
    }

    if (runPipelineHasRender && runPipelineParamPreset.render !== 'custom') {
      applyParamPresetParams('render');
    }

    if (runPipelineHasDownload && runPipelineParamPreset.download !== 'custom') {
      applyParamPresetParams('download');
    }
  }, [
    showRunPipeline,
    runPipelineHasTts,
    runPipelineHasUvr,
    runPipelineHasRender,
    runPipelineHasDownload,
    runPipelineId,
    paramPresets,
    runPipelineParamPreset
  ]);

  useEffect(() => {
    if (!showRunPipeline) return;
    if (runAgainPrefillRef.current) return;
    setRunPipelineParamPreset(prev => {
      const next = { ...prev };
      if (runPipelineHasDownload) next.download = next.download ?? 'custom';
      else delete next.download;
      if (runPipelineHasUvr) next.uvr = next.uvr ?? 'custom';
      else delete next.uvr;
      if (runPipelineHasTts) next.tts = next.tts ?? 'custom';
      else delete next.tts;
      if (runPipelineHasRender) next.render = next.render ?? 'custom';
      else delete next.render;
      const saved = runPipelinePrefsSourceRef.current;
      if (saved) {
        const idsByType = new Map<string, Set<number>>();
        paramPresets.forEach(preset => {
          const set = idsByType.get(preset.taskType) ?? new Set<number>();
          set.add(preset.id);
          idsByType.set(preset.taskType, set);
        });
        Object.entries(saved).forEach(([taskType, value]) => {
          if (typeof value !== 'string') return;
          if (!value.startsWith('preset:')) return;
          const id = Number(value.slice('preset:'.length));
          if (!Number.isFinite(id)) return;
          if (!idsByType.get(taskType)?.has(id)) return;
          next[taskType] = value;
        });
      }
      return next;
    });
  }, [showRunPipeline, runPipelineHasDownload, runPipelineHasUvr, runPipelineHasTts, runPipelineHasRender, runPipelineId, paramPresets]);

  useEffect(() => {
    if (!runPipelineHasRender && showRenderStudio) {
      setShowRenderStudio(false);
    }
  }, [runPipelineHasRender, showRenderStudio]);

  useEffect(() => {
    setRunPipelineParamPreset(prev => {
      if (!paramPresetsLoadedRef.current) return prev;
      const next = { ...prev };
      ['download', 'uvr', 'tts', 'render'].forEach(taskType => {
        if (next[taskType] !== 'custom' && !hasParamPresets(taskType)) {
          next[taskType] = 'custom';
        }
      });
      return next;
    });
  }, [paramPresets]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(RUN_PIPELINE_PREFS_KEY);
      if (!raw) {
        runPipelinePrefsReadyRef.current = true;
        return;
      }
      const data = JSON.parse(raw);
      if (data?.paramSource && typeof data.paramSource === 'object') {
        runPipelinePrefsSourceRef.current = { ...data.paramSource };
        setRunPipelineParamPreset(prev => ({ ...prev, ...data.paramSource }));
      }
      if (typeof data?.pipelineId === 'string' && data.pipelineId.trim()) {
        runPipelinePrefsPipelineIdRef.current = data.pipelineId;
        setRunPipelineId(data.pipelineId);
      }
      if (typeof data?.projectId === 'string' && data.projectId.trim()) {
        setRunPipelineProjectId(data.projectId);
      }
      if (data?.download && typeof data.download === 'object') {
        if (typeof data.download.downloadMode === 'string') {
          const mode = data.download.downloadMode;
          if (mode === 'all' || mode === 'subs' || mode === 'media') setDownloadMode(mode);
        }
        if (typeof data.download.downloadNoPlaylist === 'boolean') setDownloadNoPlaylist(data.download.downloadNoPlaylist);
        if (typeof data.download.downloadSubtitleLang === 'string') setDownloadSubtitleLang(data.download.downloadSubtitleLang);
      }
      if (data?.uvr && typeof data.uvr === 'object') {
        if (typeof data.uvr.backend === 'string') setRunPipelineBackend(data.uvr.backend);
        if (typeof data.uvr.model === 'string') setVrModel(data.uvr.model);
        if (typeof data.uvr.outputType === 'string') {
          const type = data.uvr.outputType;
          if (type === 'Mp3' || type === 'Wav' || type === 'Flac') setVrOutputType(type);
        }
      }
      if (data?.tts && typeof data.tts === 'object') {
        if (typeof data.tts.voice === 'string') setRunPipelineTtsVoice(data.tts.voice);
        if (typeof data.tts.rate === 'string') setRunPipelineTtsRate(data.tts.rate);
        if (typeof data.tts.pitch === 'string') setRunPipelineTtsPitch(data.tts.pitch);
        if (data.tts.overlapMode === 'overlap' || data.tts.overlapMode === 'truncate') {
          setRunPipelineTtsOverlapMode(data.tts.overlapMode);
        }
        if (typeof data.tts.removeLineBreaks === 'boolean') setRunPipelineTtsRemoveLineBreaks(data.tts.removeLineBreaks);
      }
      if (data?.render && typeof data.render === 'object') {
        if (data.render.renderParams && typeof data.render.renderParams === 'object') {
          const incomingAudio = (data.render.renderParams.audio ?? {}) as Record<string, unknown>;
          const { normalize, pan, channelMode, ...audioRest } = incomingAudio;
          setRenderParams(prev => ({
            timeline: { ...prev.timeline, ...(data.render.renderParams.timeline ?? {}) },
            video: { ...prev.video, ...(data.render.renderParams.video ?? {}) },
            audio: { ...prev.audio, ...audioRest },
            subtitle: normalizeLoadedSubtitleState({
              ...prev.subtitle,
              ...(data.render.renderParams.subtitle ?? {})
            }),
            effects: normalizeLoadedRenderEffects(data.render.renderParams.effects) ?? prev.effects
          }));
        }
      }
    } catch {
      // ignore bad storage
    } finally {
      runPipelinePrefsReadyRef.current = true;
      setRunPipelinePrefsReady(true);
    }
  }, []);

  useEffect(() => {
    if (!runPipelinePrefsReadyRef.current || !runPipelinePrefsReady) return;
    if (typeof window === 'undefined') return;
    if (paramPresetsLoadedRef.current) {
      runPipelinePrefsSourceRef.current = runPipelineParamPreset;
    }
    const effectiveParamSource = paramPresetsLoadedRef.current
      ? runPipelineParamPreset
      : (runPipelinePrefsSourceRef.current ?? runPipelineParamPreset);
    const payload = {
      pipelineId: runPipelineId,
      projectId: runPipelineProjectId,
      paramSource: effectiveParamSource,
      download: {
        downloadMode,
        downloadNoPlaylist,
        downloadSubtitleLang
      },
      uvr: {
        backend: runPipelineBackend,
        model: vrModel,
        outputType: vrOutputType
      },
      tts: {
        voice: runPipelineTtsVoice,
        rate: runPipelineTtsRate,
        pitch: runPipelineTtsPitch,
        overlapMode: runPipelineTtsOverlapMode,
        removeLineBreaks: runPipelineTtsRemoveLineBreaks
      },
      render: {
        renderParams
      }
    };
    try {
      window.localStorage.setItem(RUN_PIPELINE_PREFS_KEY, JSON.stringify(payload));
    } catch {
      // ignore storage errors
    }
  }, [
    runPipelinePrefsReady,
    runPipelineId,
    runPipelineParamPreset,
    downloadMode,
    downloadNoPlaylist,
    downloadSubtitleLang,
    runPipelineBackend,
    vrModel,
    vrOutputType,
    runPipelineTtsVoice,
    runPipelineTtsRate,
    runPipelineTtsPitch,
    runPipelineTtsOverlapMode,
    runPipelineTtsRemoveLineBreaks,
    renderParams
  ]);

  useEffect(() => {
    if (!runPipelinePrefsSourceRef.current || runPipelinePrefsSourceAppliedRef.current === true) return;
    const saved = runPipelinePrefsSourceRef.current;
    if (!saved || typeof saved !== 'object') return;
    const idsByType = new Map<string, Set<number>>();
    paramPresets.forEach(preset => {
      const set = idsByType.get(preset.taskType) ?? new Set<number>();
      set.add(preset.id);
      idsByType.set(preset.taskType, set);
    });
    let didApply = false;
    setRunPipelineParamPreset(prev => {
      const next = { ...prev };
      Object.entries(saved).forEach(([taskType, value]) => {
        if (typeof value !== 'string') return;
        if (!value.startsWith('preset:')) return;
        const id = Number(value.slice('preset:'.length));
        if (!Number.isFinite(id)) return;
        if (!idsByType.get(taskType)?.has(id)) return;
        if (next[taskType] && next[taskType] !== 'custom') return;
        next[taskType] = value;
        didApply = true;
      });
      return next;
    });
    if (didApply) {
      runPipelinePrefsSourceAppliedRef.current = true;
    }
  }, [paramPresets]);

  useEffect(() => {
    if (!runPipelinePrefsPipelineIdRef.current || runPipelinePrefsPipelineAppliedRef.current) return;
    const desired = runPipelinePrefsPipelineIdRef.current;
    if (!desired) return;
    if (pipelineLibrary.find(item => item.id === desired)) {
      setRunPipelineId(desired);
      runPipelinePrefsPipelineAppliedRef.current = true;
    }
  }, [pipelineLibrary]);

  useEffect(() => {
    if (!pipelinePreviewTask) return;
    setPreviewCustomParams(prev => {
      const next: Record<string, string | number> = { ...prev };
      if (pipelinePreviewTask.type === 'tts') {
        if (previewTtsRate) {
          const numeric = Number(previewTtsRate);
          next.rate = Number.isFinite(numeric) ? numeric : previewTtsRate;
        }
        if (previewTtsPitch) {
          const numeric = Number(previewTtsPitch);
          next.pitch = Number.isFinite(numeric) ? numeric : previewTtsPitch;
        }
      }
      return next;
    });
  }, [pipelinePreviewTask, previewTtsRate, previewTtsPitch]);

  useEffect(() => {
    if (!previewTtsUrl || !previewTtsAudioRef.current) return;
    previewTtsAudioRef.current.load();
    previewTtsAudioRef.current.currentTime = 0;
  }, [previewTtsUrl]);

  useEffect(() => {
    let cancelled = false;
    const loadFonts = async () => {
      setSubtitleFontLoading(true);
      try {
        const response = await fetch('/api/fonts');
        if (!response.ok) return;
        const data = await response.json().catch(() => ({}));
        const fonts = Array.isArray(data?.fonts)
          ? data.fonts.map((font: any) => String(font)).filter(isCleanFontName)
          : [];
        const merged = Array.from(new Set([...fonts, ...VIET_SUBTITLE_FONTS]));
        merged.sort((a, b) => a.localeCompare(b));
        if (!cancelled) setSubtitleFontOptions(merged);
      } catch {
        // ignore font load errors
      } finally {
        if (!cancelled) setSubtitleFontLoading(false);
      }
    };
    loadFonts();
    return () => {
      cancelled = true;
    };
  }, []);

  const openPipelineEditor = async (pipeline: PipelineSummary) => {
    if (pipeline.kind !== 'saved') return;
    const id = Number(pipeline.id);
    if (!Number.isFinite(id)) return;
    setRunPipelineLoading(true);
    try {
      const response = await fetch(`/api/pipelines/${id}`);
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Unable to load pipeline');
      }
      const data = await response.json();
      setPipelineName(data.name ?? 'Pipeline');
      setGraphNodes(Array.isArray(data.graph?.nodes) ? data.graph.nodes : []);
      setGraphEdges(Array.isArray(data.graph?.edges) ? data.graph.edges : []);
      setShowPipelineEditor(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load pipeline';
      showToast(message, 'error');
    } finally {
      setRunPipelineLoading(false);
    }
  };

  useEffect(() => {
    return () => {
      if (previewTtsUrl) URL.revokeObjectURL(previewTtsUrl);
    };
  }, [previewTtsUrl]);

  useEffect(() => {
    const handleMove = (event: MouseEvent) => {
      if (!draggingNodeId || !dragOffset || !canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const x = event.clientX - rect.left - dragOffset.x;
      const y = event.clientY - rect.top - dragOffset.y;
      setGraphNodes(prev => prev.map(node => node.id === draggingNodeId ? { ...node, x, y } : node));
    };
    const handleUp = () => {
      setDraggingNodeId(null);
      setDragOffset(null);
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [draggingNodeId, dragOffset]);

  const loadPipelines = async () => {
    try {
      const response = await fetch('/api/pipelines');
      if (!response.ok) return;
      const data = await response.json() as { pipelines: Array<{ id: string; name: string; steps: number; updatedAt: string; primaryType?: string | null }> };
      const savedPipelines: PipelineSummary[] = (data.pipelines ?? []).map(p => ({
        id: String(p.id),
        name: p.name,
        steps: p.steps,
        updatedAt: formatRelativeTime(p.updatedAt),
        kind: 'saved',
        primaryType: p.primaryType ?? null
      }));
      const taskPipelines: PipelineSummary[] = availableTasks.map(task => ({
        id: `${TASK_PIPELINE_PREFIX}${task.type}`,
        name: task.label,
        steps: 1,
        updatedAt: 'Built-in',
        kind: 'task',
        primaryType: task.type
      }));
      const nextPipelines = [...taskPipelines, ...savedPipelines];
      setPipelineLibrary(nextPipelines);
      const preferredId = runPipelinePrefsPipelineIdRef.current;
      if (preferredId && nextPipelines.find(item => item.id === preferredId)) {
        setRunPipelineId(preferredId);
        return;
      }
      if (!nextPipelines.find(item => item.id === runPipelineId)) {
        setRunPipelineId(nextPipelines[0]?.id ?? null);
      }
    } catch {
      paramPresetsLoadedRef.current = true;
      return;
    }
  };

  const loadParamPresets = async () => {
    try {
      const response = await fetch('/api/param-presets');
      if (!response.ok) {
        paramPresetsLoadedRef.current = true;
        return;
      }
      const data = await response.json();
      const presets = Array.isArray(data?.presets) ? data.presets : [];
      const normalizedPresets = presets
        .map((preset: any) => ({
          id: Number(preset?.id),
          taskType: String(preset?.taskType ?? ''),
          params: preset?.params && typeof preset.params === 'object' ? preset.params : {},
          label: String(preset?.label ?? ''),
          updatedAt: preset?.updatedAt
        }))
        .filter(preset => Number.isFinite(preset.id) && preset.taskType);
      setParamPresets(normalizedPresets);
      paramPresetsLoadedRef.current = true;
      setRunPipelineParamPreset(prev => {
        const next = { ...prev };
        const idsByType = new Map<string, Set<number>>();
        normalizedPresets.forEach(preset => {
          const set = idsByType.get(preset.taskType) ?? new Set<number>();
          set.add(preset.id);
          idsByType.set(preset.taskType, set);
        });
        Object.keys(next).forEach(taskType => {
          const value = next[taskType];
          if (typeof value === 'string' && value.startsWith('preset:')) {
            const id = Number(value.slice('preset:'.length));
            if (!idsByType.get(taskType)?.has(id)) {
              next[taskType] = 'custom';
            }
          }
        });
        return next;
      });
    } catch {
      return;
    }
  };

  useEffect(() => {
    loadPipelines();
  }, []);

  useEffect(() => {
    loadParamPresets();
  }, []);

  const loadJobs = async () => {
    try {
      const response = await fetch('/api/jobs');
      if (!response.ok) return;
      const data = await response.json() as { jobs: MediaJob[] };
      setJobs(data.jobs ?? []);
    } catch {
      return;
    }
  };

  const cancelJob = async (jobId: string) => {
    try {
      const response = await fetch(`/api/jobs/${jobId}/cancel`, { method: 'POST' });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Unable to cancel job');
      }
      await loadJobs();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to cancel job';
      showToast(message, 'error');
    }
  };

  const deleteJob = async (jobId: string) => {
    try {
      openConfirm(
        {
          title: 'Delete job history?',
          description: 'This action cannot be undone.',
          confirmLabel: 'Delete',
          variant: 'danger'
        },
        async () => {
          const response = await fetch(`/api/jobs/${jobId}`, { method: 'DELETE' });
          if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.error || 'Unable to delete job');
          }
          await loadJobs();
        }
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to delete job';
      showToast(message, 'error');
    }
  };

  const openFileContextMenu = (event: React.MouseEvent, file: VaultFile) => {
    event.preventDefault();
    setFileContextMenu({
      open: true,
      x: event.clientX,
      y: event.clientY,
      file
    });
  };

  const closeFileContextMenu = () => {
    setFileContextMenu(prev => ({ ...prev, open: false, file: null }));
  };

  const downloadVaultFile = (file: VaultFile) => {
    if (!file.relativePath) return;
    const link = document.createElement('a');
    link.href = `/api/vault/stream?path=${encodeURIComponent(file.relativePath)}`;
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const performImport = async () => {
    if (!importProjectName.trim()) {
      setImportError('Enter a project name');
      return;
    }
    if (importFiles.length === 0) {
      setImportError('Select at least one file');
      return;
    }
    setImportSubmitting(true);
    setImportError(null);
    try {
      const form = new FormData();
      form.append('projectName', importProjectName.trim());
      importFiles.forEach(file => form.append('files', file));
      const response = await fetch('/api/vault/import', {
        method: 'POST',
        body: form
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || 'Import failed');
      }
      showToast(`Imported ${data.count ?? importFiles.length} file(s)`, 'success');
      setImportPopupOpen(false);
      setImportProjectName('');
      setImportFiles([]);
      await loadVault();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Import failed';
      setImportError(message);
    } finally {
      setImportSubmitting(false);
    }
  };

  const openRunPipelineFromJob = (job: MediaJob) => {
    const jobAny = job as any;
    const jobParams = job.params ?? {};
    runAgainPrefillRef.current = true;
    const jobName = (job.name ?? '').trim().toLowerCase();
    const pipelineMatch = pipelineLibrary.find(item => item.name.trim().toLowerCase() === jobName);
    let nextPipelineId = pipelineMatch?.id ?? null;
    if (!nextPipelineId) {
      if (job.tasks.length === 1) {
        const taskType = job.tasks[0].type;
        if (availableTasks.some(task => task.type === taskType)) {
          nextPipelineId = `${TASK_PIPELINE_PREFIX}${taskType}`;
        }
      } else if (job.tasks.some(task => task.type.startsWith('download'))) {
        nextPipelineId = `${TASK_PIPELINE_PREFIX}download`;
      }
    }
    if (nextPipelineId) {
      setRunPipelineId(nextPipelineId);
    } else {
      showToast('Select a pipeline to rerun', 'warning');
    }

    const projectName = (jobParams.projectName ?? job.projectName)?.trim();
    const inputRelativePath = typeof jobParams.inputRelativePath === 'string'
      ? jobParams.inputRelativePath
      : (typeof jobAny.__inputRelativePath === 'string' ? jobAny.__inputRelativePath : '');
    let projectMatch: VaultFolder | undefined;
    let fileMatch: VaultFile | undefined;
    if (inputRelativePath) {
      projectMatch = vaultFolders.find(folder => folder.files.some(file => file.relativePath === inputRelativePath));
      fileMatch = projectMatch?.files.find(file => file.relativePath === inputRelativePath);
    }
    if (!projectMatch && projectName) {
      projectMatch = vaultFolders.find(folder => folder.name.toLowerCase() === projectName.toLowerCase());
    }
    if (projectMatch) {
      setRunPipelineProjectLocked(false);
      setRunPipelineProjectId(projectMatch.id);
      if (fileMatch) {
        setRunPipelineInputId(fileMatch.id);
      }
    }

    if (job.tasks.some(task => task.type.startsWith('download'))) {
      const url = jobParams.download?.url || (typeof jobAny.__downloadUrl === 'string' ? jobAny.__downloadUrl : job.fileName);
      setDownloadUrl(url || '');
      if (projectName) setDownloadProjectName(projectName);
      if (typeof jobParams.download?.noPlaylist === 'boolean') setDownloadNoPlaylist(jobParams.download.noPlaylist);
      else if (typeof jobAny.__downloadNoPlaylist === 'boolean') setDownloadNoPlaylist(jobAny.__downloadNoPlaylist);
      if (typeof jobParams.download?.subLangs === 'string') setDownloadSubtitleLang(jobParams.download.subLangs);
      else if (typeof jobAny.__downloadSubLangs === 'string') setDownloadSubtitleLang(jobAny.__downloadSubLangs);
      const mode = jobParams.download?.mode || (typeof jobAny.__downloadMode === 'string' ? jobAny.__downloadMode : '');
      if (mode === 'all' || mode === 'subs' || mode === 'media') setDownloadMode(mode);
    }

    if (typeof jobParams.uvr?.backend === 'string') setRunPipelineBackend(jobParams.uvr.backend);
    else if (typeof jobAny.__backend === 'string') setRunPipelineBackend(jobAny.__backend);
    if (typeof jobParams.uvr?.model === 'string') setVrModel(jobParams.uvr.model);
    else if (typeof jobAny.__model === 'string') setVrModel(jobAny.__model);
    if (typeof jobParams.uvr?.outputFormat === 'string') setVrOutputType(jobParams.uvr.outputFormat);
    else if (typeof jobAny.__outputFormat === 'string') setVrOutputType(jobAny.__outputFormat);
    if (typeof jobParams.tts?.voice === 'string') setRunPipelineTtsVoice(jobParams.tts.voice);
    else if (typeof jobAny.__ttsVoice === 'string') setRunPipelineTtsVoice(jobAny.__ttsVoice);
    if (typeof jobParams.tts?.rate === 'number') setRunPipelineTtsRate(String(jobParams.tts.rate));
    else if (typeof jobAny.__ttsRate === 'number') setRunPipelineTtsRate(String(jobAny.__ttsRate));
    if (typeof jobParams.tts?.pitch === 'number') setRunPipelineTtsPitch(String(jobParams.tts.pitch));
    else if (typeof jobAny.__ttsPitch === 'number') setRunPipelineTtsPitch(String(jobAny.__ttsPitch));
    const overlapMode = jobParams.tts?.overlapMode || jobAny.__ttsOverlapMode;
    if (overlapMode === 'overlap' || overlapMode === 'truncate') {
      setRunPipelineTtsOverlapMode(overlapMode);
    }
    if (typeof jobParams.tts?.removeLineBreaks === 'boolean') {
      setRunPipelineTtsRemoveLineBreaks(jobParams.tts.removeLineBreaks);
    } else if (typeof jobAny.__ttsRemoveLineBreaks === 'boolean') {
      setRunPipelineTtsRemoveLineBreaks(jobAny.__ttsRemoveLineBreaks);
    }

    setShowRunPipeline(true);
  };

  useEffect(() => {
    loadJobs();
    const interval = window.setInterval(loadJobs, 3000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(jobs.length / 10));
    if (jobPage > totalPages) {
      setJobPage(totalPages);
    }
  }, [jobs.length, jobPage]);

  useEffect(() => {
    if (!pipelineLibrary.length) return;
    if (!pipelineLibrary.find(item => item.id === runPipelineId)) {
      setRunPipelineId(pipelineLibrary[0].id ?? null);
    }
  }, [pipelineLibrary, runPipelineId]);

  useEffect(() => {
    if (!runPipelineProjectId) return;
    const match = vaultFolders.find(folder => folder.id === runPipelineProjectId);
    if (match) return;
    setRunPipelineProjectId(null);
    if (runPipelineHasDownload) {
      setDownloadProjectName('');
    }
  }, [runPipelineProjectId, runPipelineHasDownload, vaultFolders]);

  useEffect(() => {
    if (runPipelineHasDownload) {
      setDownloadProjectName(prev => prev || runPipelineProject?.name || '');
      return;
    }
    if (!runPipelineProjectId && downloadProjectName.trim()) {
      const match = vaultFolders.find(folder => folder.name.toLowerCase() === downloadProjectName.trim().toLowerCase());
      if (match) {
        setRunPipelineProjectId(match.id);
      }
    }
    setDownloadProjectName('');
    setDownloadUrl('');
    setDownloadCookiesFile(null);
    setDownloadNoPlaylist(true);
    setDownloadSubtitleLang('ai-zh');
    setDownloadAnalyzeError(null);
    setDownloadAnalyzeResult(null);
  }, [runPipelineHasDownload, runPipelineProject?.name, runPipelineProjectId, downloadProjectName, vaultFolders]);

  const loadPipelineDetail = async (id: string) => {
    if (id.startsWith(TASK_PIPELINE_PREFIX)) {
      const taskType = id.slice(TASK_PIPELINE_PREFIX.length);
      const task = availableTasks.find(item => item.type === taskType);
      setRunPipelineGraph(task ? buildSingleTaskGraph(task) : null);
      return;
    }
    if (!Number.isFinite(Number(id))) {
      setRunPipelineGraph(null);
      return;
    }
    setRunPipelineLoading(true);
    try {
      const response = await fetch(`/api/pipelines/${id}`);
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Unable to load pipeline');
      }
      const data = await response.json();
      setRunPipelineGraph(data.graph);
    } catch (error) {
      setRunPipelineGraph(null);
      const message = error instanceof Error ? error.message : 'Unable to load pipeline';
      showToast(message, 'error');
    } finally {
      setRunPipelineLoading(false);
    }
  };

  useEffect(() => {
    if (runPipelineId) {
      loadPipelineDetail(runPipelineId);
    }
  }, [runPipelineId]);


  useEffect(() => {
    if (!selectedFolder) return;
    const firstInput = runPipelineHasTts
      ? selectedFolder.files.find(file => file.type === 'subtitle')
      : selectedFolder.files.find(file => file.type === 'video' || file.type === 'audio');
    setRunPipelineInputId(firstInput?.id ?? null);
  }, [selectedFolder?.id, runPipelineHasTts]);

  useEffect(() => {
    if (!runPipelineProject) return;
    const firstInput = runPipelineHasTts
      ? runPipelineProject.files.find(file => file.type === 'subtitle')
      : runPipelineProject.files.find(file => file.type === 'video' || file.type === 'audio');
    setRunPipelineInputId(firstInput?.id ?? null);
  }, [runPipelineProject?.id, runPipelineHasTts]);

  useEffect(() => {
    if (!runPipelineProject || !runPipelineHasRender) return;
    const firstVideo = runPipelineProject.files.find(file => file.type === 'video');
    const firstAudio = runPipelineProject.files.find(file => file.type === 'audio');
    const firstSubtitle = runPipelineProject.files.find(file => file.type === 'subtitle');
    setRenderVideoId(firstVideo?.id ?? null);
    setRenderAudioId(firstAudio?.id ?? null);
    setRenderSubtitleId(firstSubtitle?.id ?? null);
    setRenderInputFileIds(
      [firstVideo?.id, firstAudio?.id, firstSubtitle?.id].filter(Boolean) as string[]
    );
  }, [runPipelineProject?.id, runPipelineHasRender]);

  useEffect(() => {
    setRenderInputFileIds(prev => {
      const validIds = new Set((runPipelineProject?.files ?? []).map(file => file.id));
      const next = new Set(prev.filter(id => validIds.has(id)));
      [renderVideoId, renderAudioId, renderSubtitleId]
        .filter((id): id is string => Boolean(id))
        .forEach(id => next.add(id));
      return Array.from(next);
    });
  }, [renderVideoId, renderAudioId, renderSubtitleId, runPipelineProject?.id]);

  const savePipeline = async (nameOverride?: string) => {
    if (!graphNodes.length) {
      showToast('Add at least 1 task', 'warning');
      return;
    }
    setPipelineSaving(true);
    try {
      const finalName = (nameOverride ?? pipelineName).trim() || 'Untitled Pipeline';
      const response = await fetch('/api/pipelines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: finalName,
          graph: {
            nodes: graphNodes,
            edges: graphEdges
          }
        })
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Unable to save pipeline');
      }
      await loadPipelines();
      showToast('Pipeline saved', 'success');
      setPipelineName(finalName);
      setShowPipelineEditor(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save pipeline';
      showToast(message, 'error');
    } finally {
      setPipelineSaving(false);
    }
  };

  const performDeletePipeline = async (id: string) => {
    if (id.startsWith(TASK_PIPELINE_PREFIX)) {
      showToast('Built-in tasks cannot be deleted.', 'warning');
      return;
    }
    const previous = pipelineLibrary;
    setPipelineLibrary(prev => prev.filter(item => item.id !== id));
    if (!Number.isFinite(Number(id))) {
      showToast('Pipeline removed (local)', 'info');
      return;
    }
    try {
      const response = await fetch(`/api/pipelines/${id}`, { method: 'DELETE' });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Unable to delete pipeline');
      }
      await loadPipelines();
      showToast('Pipeline deleted', 'success');
    } catch (error) {
      setPipelineLibrary(previous);
      const message = error instanceof Error ? error.message : 'Unable to delete pipeline';
      showToast(message, 'error');
    }
  };

  const deletePipeline = (id: string) => {
    if (id.startsWith(TASK_PIPELINE_PREFIX)) {
      showToast('Built-in tasks cannot be deleted.', 'warning');
      return;
    }
    const pipeline = pipelineLibrary.find(item => item.id === id);
    openConfirm(
      {
        title: 'Delete this pipeline?',
        description: pipeline?.name ? `This action cannot be undone: ${pipeline.name}` : 'This action cannot be undone.',
        confirmLabel: 'Delete',
        variant: 'danger'
      },
      () => performDeletePipeline(id)
    );
  };

  const loadVault = async () => {
    setVaultLoading(true);
    setVaultError(null);
    try {
      const response = await fetch('/api/vault');
      if (!response.ok) {
        throw new Error(`Vault API error (${response.status})`);
      }
      const data = await response.json() as { folders: VaultFolderDTO[] };
      const mappedFolders: VaultFolder[] = data.folders.map((folder, folderIndex) => {
        const mappedFiles: VaultFile[] = folder.files.map((file, fileIndex) => {
          const normalizedRelative = file.relativePath?.includes('/')
            ? file.relativePath
            : `${folder.name}/${file.relativePath}`;
          return {
            id: `${folderIndex}-${fileIndex}-${file.name}`,
            name: file.name,
            type: file.type,
            size: formatBytes(file.sizeBytes),
            relativePath: normalizedRelative,
            duration: formatDuration(file.durationSeconds),
            durationSeconds: file.durationSeconds,
            language: file.type === 'subtitle' ? guessLanguage(file.name) : undefined,
            status: file.type === 'output'
              ? 'complete'
              : file.type === 'subtitle'
                ? 'partial'
                : 'raw',
            version: file.type === 'subtitle' ? guessVersion(file.name) : undefined,
            createdAt: formatRelativeTime(file.modifiedAt),
            uvr: file.uvr,
            tts: file.tts,
            linkedToPath: file.linkedTo,
            origin: file.tts?.role === 'output'
              ? 'tts'
              : file.uvr?.role === 'output'
                ? 'vr'
                : 'source'
          };
        });

        const relativeToId = new Map(mappedFiles.map(item => [item.relativePath, item.id]));
        const mappedWithLinks = mappedFiles.map(item => {
          if (!item.linkedToPath) return item;
          const linkedId = relativeToId.get(item.linkedToPath);
          return linkedId ? { ...item, linkedTo: linkedId } : item;
        });

        const mainVideo = mappedWithLinks.find(item => item.type === 'video')?.id;
        const linkedFiles = mappedWithLinks;

        const status = computeFolderStatus(linkedFiles);
        const tags = status === 'complete'
          ? ['Ready']
          : status === 'partial'
            ? ['In progress']
            : status === 'error'
              ? ['Needs attention']
              : [];

        const hasSubtitle = linkedFiles.some(item => item.type === 'subtitle');
        const suggestedAction = !hasSubtitle
          ? 'No subtitles detected → Generate now?'
          : undefined;

        const lastActivity = linkedFiles.length
          ? formatRelativeTime(folder.files.map(file => file.modifiedAt).sort().slice(-1)[0])
          : 'No activity';

        return {
          id: `folder-${folderIndex}-${folder.name}`,
          name: folder.name,
          status,
          lastActivity,
          tags,
          suggestedAction,
          files: linkedFiles,
        };
      });

      const nextFolders = mappedFolders;
      setVaultFolders(nextFolders);

      const nextNames = nextFolders.map(folder => folder.name);
      if (hasLoadedOnce) {
        const added = nextNames.filter(name => !lastFolderNames.includes(name));
        const removed = lastFolderNames.filter(name => !nextNames.includes(name));
        const addedCount = added.length;
        const removedCount = removed.length;
        const message = addedCount === 0 && removedCount === 0
          ? 'No project changes'
          : [addedCount > 0 ? `+${addedCount} added` : null, removedCount > 0 ? `-${removedCount} removed` : null]
              .filter(Boolean)
              .join(' • ');
        showToast(message, 'info');
      } else {
        setHasLoadedOnce(true);
      }

      setLastFolderNames(nextNames);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load vault';
      setVaultError(message);
    } finally {
      setVaultLoading(false);
    }
  };

  useEffect(() => {
    const previousJobs = previousJobsRef.current;
    if (previousJobs.length === 0) {
      previousJobsRef.current = jobs;
      return;
    }
    const previousStatus = new Map(previousJobs.map(job => [job.id, job.status]));
    const outputCompleted = jobs.some(job => {
      const was = previousStatus.get(job.id);
      if (was === job.status) return false;
      if (job.status !== 'completed') return false;
      return job.tasks.some(task => task.type === 'uvr' || task.type === 'tts');
    });
    if (outputCompleted) {
      loadVault();
    }
    previousJobsRef.current = jobs;
  }, [jobs]);

  const performDeleteVaultProject = async (folder: VaultFolder) => {
    try {
      const response = await fetch('/api/vault/project', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectName: folder.name })
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `Delete failed (${response.status})`);
      }
      showToast(`Deleted ${folder.name}`, 'success');
      if (vaultFolderId === folder.id) {
        setVaultFolderId(null);
        setVaultFileId(null);
      }
      await loadVault();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to delete project';
      showToast(message, 'error');
    }
  };

  const deleteVaultProject = (folder: VaultFolder) => {
    openConfirm(
      {
        title: `Delete project "${folder.name}"?`,
        description: 'This will remove the project folder and all files inside Media Vault.',
        confirmLabel: 'Delete',
        variant: 'danger'
      },
      () => performDeleteVaultProject(folder)
    );
  };

  const openVaultContextMenu = (event: React.MouseEvent, folder: VaultFolder) => {
    event.preventDefault();
    const menuWidth = 200;
    const menuHeight = 120;
    const x = Math.min(event.clientX, window.innerWidth - menuWidth - 12);
    const y = Math.min(event.clientY, window.innerHeight - menuHeight - 12);
    setVaultContextMenu({ open: true, x, y, folder });
  };

  const closeVaultContextMenu = () => {
    setVaultContextMenu(prev => ({ ...prev, open: false, folder: null }));
  };

  useEffect(() => {
    if (!toastVisible) return;
    const timeout = window.setTimeout(() => setToastVisible(false), 2200);
    return () => window.clearTimeout(timeout);
  }, [toastVisible]);

  useEffect(() => {
    if (!vrProjectId && vaultFolders.length) {
      setVrProjectId(vaultFolders[0].id);
    }
  }, [vaultFolders, vrProjectId]);

  useEffect(() => {
    if (!forgeProject) return;
    const firstInput = forgeProject.files.find(file => file.type === 'video' || file.type === 'audio');
    setVrInputId(firstInput?.id ?? null);
  }, [forgeProject]);

  useEffect(() => {
    const loadModels = async () => {
      try {
        const response = await fetch('/api/tasks/vr/models');
        if (!response.ok) return;
        const data = await response.json() as { models: string[] };
        if (data.models?.length) {
          setVrModels(data.models);
          const preferred = data.models.includes('MGM_MAIN_v4.pth') ? 'MGM_MAIN_v4.pth' : data.models[0];
          setVrModel(preferred);
        }
      } catch {
        return;
      }
    };
    loadModels();
  }, []);

  const runVrTask = async () => {
    if (!selectedForgeInput?.relativePath) {
      setVrError('Select an input file first');
      return;
    }
    setVrRunning(true);
    setVrError(null);
    setVrResult([]);
    try {
      const response = await fetch('/api/tasks/vr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inputPath: selectedForgeInput.relativePath,
          model: vrModel,
          outputFormat: vrOutputType
        })
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `VR task failed (${response.status})`);
      }
      const data = await response.json() as { outputs: string[] };
      setVrResult(data.outputs ?? []);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'VR task failed';
      setVrError(message);
    } finally {
      setVrRunning(false);
    }
  };

  const runPipelineJob = async () => {
    if (!runPipelineId) {
      showToast('Select a pipeline first', 'warning');
      return;
    }
    if (runPipelineHasDownload) {
      if (!downloadUrl.trim()) {
        showToast('Enter a download URL first', 'warning');
        return;
      }
      if (!downloadProjectName.trim()) {
        showToast('Enter a project name first', 'warning');
        return;
      }
    } else if (runPipelineHasRender) {
      if (!renderVideoId) {
        showToast('Select a video track first', 'warning');
        return;
      }
    } else if (!runPipelineInput?.relativePath) {
      showToast('Select an input file first', 'warning');
      return;
    }
    const sendPipeline = async (overwrite: boolean) => {
      const pipelinePayload: Record<string, any> = runPipelineHasDownload
        ? {
            url: downloadUrl.trim(),
            projectName: downloadProjectName.trim(),
            noPlaylist: downloadNoPlaylist,
            downloadMode,
            subLangs: downloadSubtitleLang.trim(),
            model: vrModel,
            backend: runPipelineBackend,
            outputFormat: vrOutputType
          }
        : {
            inputPath: runPipelineInput?.relativePath,
            model: vrModel,
            backend: runPipelineBackend,
            outputFormat: vrOutputType
          };
      if (runPipelineHasRender) {
        const videoFile = runPipelineProject?.files.find(file => file.id === renderVideoId);
        const audioFile = runPipelineProject?.files.find(file => file.id === renderAudioId);
        const subtitleFile = runPipelineProject?.files.find(file => file.id === renderSubtitleId);
        const { w: playResX, h: playResY } = parseResolution(renderParams.timeline.resolution);
        pipelinePayload.inputPath = videoFile?.relativePath ?? pipelinePayload.inputPath;
        pipelinePayload.videoPath = videoFile?.relativePath;
        pipelinePayload.audioPath = audioFile?.relativePath;
        pipelinePayload.subtitlePath = subtitleFile?.relativePath;
        pipelinePayload.renderParams = {
          timeline: {
            framerate: coerceNumber(renderParams.timeline.framerate, 30),
            resolution: renderParams.timeline.resolution || null,
            scale: renderTimelineScale,
            playhead: renderPlayheadSeconds
          },
          video: {
            trimStart: coerceNumber(renderParams.video.trimStart, 0),
            trimEnd: coerceNumber(renderParams.video.trimEnd, 0),
            speed: coerceNumber(renderParams.video.speed, 1),
            volume: coerceNumber(renderParams.video.volume, 100),
            fit: renderParams.video.fit,
            position: {
              x: coerceNumber(renderParams.video.positionX, 50),
              y: coerceNumber(renderParams.video.positionY, 50)
            },
            scale: coerceNumber(renderParams.video.scale, 1),
            rotation: coerceNumber(renderParams.video.rotation, 0),
            opacity: coerceNumber(renderParams.video.opacity, 100),
            colorLut: renderParams.video.colorLut || null,
            crop: {
              x: coerceNumber(renderParams.video.cropX, 0),
              y: coerceNumber(renderParams.video.cropY, 0),
              w: coerceNumber(renderParams.video.cropW, 100),
              h: coerceNumber(renderParams.video.cropH, 100)
            },
            fadeIn: coerceNumber(renderParams.video.fadeIn, 0),
            fadeOut: coerceNumber(renderParams.video.fadeOut, 0)
          },
          audio: {
            gainDb: coerceNumber(renderParams.audio.gainDb, 0),
            mute: Boolean(renderParams.audio.mute),
            fadeIn: coerceNumber(renderParams.audio.fadeIn, 0),
            fadeOut: coerceNumber(renderParams.audio.fadeOut, 0)
          },
          subtitle: {
            playResX,
            playResY,
            fontName: renderParams.subtitle.fontName || null,
            fontSize: coerceNumber(renderParams.subtitle.fontSize, 48),
            primaryColor: renderParams.subtitle.primaryColor,
            outlineColor: renderParams.subtitle.outlineColor,
            bold: renderParams.subtitle.bold === '1',
            italic: renderParams.subtitle.italic === '1',
            spacing: coerceNumber(renderParams.subtitle.spacing, 0),
            outline: coerceNumber(renderParams.subtitle.outline, 2),
            shadow: coerceNumber(renderParams.subtitle.shadow, 2),
            alignment: coerceNumber(renderParams.subtitle.alignment, 2),
            marginL: coerceNumber(renderParams.subtitle.marginL, 30),
            marginR: coerceNumber(renderParams.subtitle.marginR, 30),
            marginV: coerceNumber(renderParams.subtitle.marginV, 36),
            wrapStyle: coerceNumber(renderParams.subtitle.wrapStyle, 0)
          },
          effects: renderParams.effects
            .map(effect => {
              const left = Math.min(100, Math.max(0, coerceNumber(effect.left, 0) ?? 0));
              const right = Math.min(100, Math.max(0, coerceNumber(effect.right, 0) ?? 0));
              const top = Math.min(100, Math.max(0, coerceNumber(effect.top, 0) ?? 0));
              const bottom = Math.min(100, Math.max(0, coerceNumber(effect.bottom, 0) ?? 0));
              const sigma = Math.min(80, Math.max(0.5, coerceNumber(effect.sigma, 15) ?? 15));
              const feather = Math.min(RENDER_BLUR_FEATHER_MAX, Math.max(0, coerceNumber(effect.feather, 0) ?? 0));
              if (left + right >= 100 || top + bottom >= 100) return null;
              return { type: 'blur_region' as const, left, right, top, bottom, sigma, feather };
            })
            .filter((e): e is NonNullable<typeof e> => e !== null)
        };
      }
      if (overwrite) {
        pipelinePayload.overwrite = true;
      }
      if (runPipelineHasTts) {
        pipelinePayload.voice = runPipelineTtsVoice;
        pipelinePayload.overlapMode = runPipelineTtsOverlapMode;
        pipelinePayload.removeLineBreaks = runPipelineTtsRemoveLineBreaks;
        if (runPipelineTtsRate !== '') {
          const numeric = Number(runPipelineTtsRate);
          if (Number.isFinite(numeric)) pipelinePayload.rate = numeric;
        }
        if (runPipelineTtsPitch !== '') {
          const numeric = Number(runPipelineTtsPitch);
          if (Number.isFinite(numeric)) pipelinePayload.pitch = numeric;
        }
      }
      if (runPipelineHasDownload && downloadCookiesFile) {
        pipelinePayload.cookiesFileName = downloadCookiesFile.name;
        pipelinePayload.cookiesContent = await downloadCookiesFile.text();
      }

      if (runPipelineId.startsWith(TASK_PIPELINE_PREFIX)) {
        const taskType = runPipelineId.slice(TASK_PIPELINE_PREFIX.length);
        const task = availableTasks.find(item => item.type === taskType);
        if (!task) {
          throw new Error('Selected task pipeline is invalid');
        }
        pipelinePayload.graph = buildSingleTaskGraph(task);
        pipelinePayload.name = task.label;
      } else {
        pipelinePayload.pipelineId = Number(runPipelineId);
      }

      const response = await fetch('/api/jobs/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pipelinePayload)
      });
      const data = await response.json().catch(() => ({}));
      if (response.status === 409) {
        return { conflict: true, data };
      }
      if (!response.ok) {
        throw new Error(data.error || 'Unable to run pipeline');
      }
      if (data?.skipped) {
        showToast(data.message || 'Project already exists. Skipped download.', 'warning');
        setShowRunPipeline(false);
        return { conflict: false, done: true };
      }
      await loadJobs();
      showToast('Pipeline queued', 'success');
      setShowRunPipeline(false);
      setActiveTab('dashboard');
      return { conflict: false, done: true };
    };

    setRunPipelineSubmitting(true);
    try {
      const result = await sendPipeline(false);
      if (result?.conflict) {
        setRunPipelineSubmitting(false);
        openConfirm(
          {
            title: 'Overwrite existing output?',
            description: 'Output already exists. Do you want to overwrite it or cancel?',
            confirmLabel: 'Overwrite',
            variant: 'danger'
          },
          async () => {
            setRunPipelineSubmitting(true);
            try {
              await sendPipeline(true);
            } catch (error) {
              const message = error instanceof Error ? error.message : 'Unable to run pipeline';
              showToast(message, 'error');
            } finally {
              setRunPipelineSubmitting(false);
            }
          }
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to run pipeline';
      showToast(message, 'error');
    } finally {
      setRunPipelineSubmitting(false);
    }
  };

  const resetDownloadForm = () => {
    setDownloadProjectName('');
    setDownloadUrl('');
    setDownloadCookiesFile(null);
    setDownloadNoPlaylist(true);
    setDownloadMode('all');
    setDownloadAnalyzeError(null);
    setDownloadAnalyzeResult(null);
  };

  const analyzeYtDlp = async () => {
    if (!downloadUrl.trim()) {
      setDownloadAnalyzeError('Enter a URL first');
      return;
    }
    setDownloadAnalyzeLoading(true);
    setDownloadAnalyzeError(null);
    setDownloadAnalyzeResult(null);
    try {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 60000);
      const payload: Record<string, any> = { url: downloadUrl.trim() };
      payload.noPlaylist = downloadNoPlaylist;
      if (downloadCookiesFile) {
        payload.cookiesFileName = downloadCookiesFile.name;
        payload.cookiesContent = await downloadCookiesFile.text();
      }
      const response = await fetch('/api/tasks/ytdlp/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      window.clearTimeout(timeout);
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Unable to analyze url');
      }
      const data = await response.json();
      setDownloadAnalyzeResult(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to analyze url';
      setDownloadAnalyzeError(message);
    } finally {
      setDownloadAnalyzeLoading(false);
    }
  };

  useEffect(() => {
    loadVault();
  }, []);

  useEffect(() => {
    if (!vaultFolders.length) {
      setVaultFolderId(null);
      return;
    }
    if (!vaultFolders.find(folder => folder.id === vaultFolderId)) {
      setVaultFolderId(vaultFolders[0].id);
    }
  }, [vaultFolders, vaultFolderId]);

  useEffect(() => {
    if (!selectedFolder) {
      setVaultFileId(null);
      return;
    }
    if (vaultFileId && selectedFolder.files.find(file => file.id === vaultFileId)) return;
    setVaultFileId(selectedFolder.files[0]?.id ?? null);
  }, [selectedFolder, vaultFileId]);

  const renderStudioProps = {
    runPipelineProject,
    renderReady,
    setShowRenderStudio,
    runPipelineJob,
    runPipelineSubmitting,
    renderStudioLeftMenuOpen,
    setRenderStudioLeftMenuOpen,
    renderStudioMediaBinOpen,
    setRenderStudioMediaBinOpen,
    renderStudioProjectOpen,
    setRenderStudioProjectOpen,
    renderStudioFocus,
    setRenderStudioFocus,
    renderStudioItemType,
    setRenderStudioItemType,
    renderVideoId,
    setRenderVideoId,
    renderAudioId,
    setRenderAudioId,
    renderSubtitleId,
    setRenderSubtitleId,
    renderVideoFile,
    renderAudioFile,
    renderSubtitleFile,
    formatDuration,
    formatDurationFine,
    renderTimelineDuration,
    renderSubtitleTrackHeight,
    renderSubtitleDuration,
    renderSubtitleLanes,
    renderSubtitleLaneHeight,
    renderSubtitleCues,
    renderTimelineViewDuration,
    showRenderTimelineSubtitleTrack,
    showRenderTimelineEffectTracks,
    renderParams,
    showRenderTimelineVideoTrack,
    renderVideoDuration,
    showRenderTimelineAudioTrack,
    renderAudioDuration,
    renderTimelineScrollRef,
    onRenderTimelineMouseDown,
    onRenderTimelineMouseMove,
    onRenderTimelineMouseUp,
    onRenderTimelineClick,
    renderTimelineWidth,
    renderTimelineTickCount,
    renderPlayheadSeconds,
    renderTimelineMinScale,
    renderTimelineScale,
    setRenderTimelineScale,
    renderPreviewUrl,
    renderPreviewLoading,
    renderPreviewError,
    canBrowserPlayVideo,
    getVideoMimeType,
    renderSelectedItem,
    renderParamsDraft,
    updateRenderParamDraft,
    commitRenderParamDraftValue,
    commitRenderParamDraftOnEnter,
    updateRenderParam,
    renderStudioInspectorOpen,
    setRenderStudioInspectorOpen,
    removeRenderEffect,
    addBlurRegionEffect,
    updateRenderEffectDraft,
    commitRenderEffectDraftValue,
    coerceNumber,
    RENDER_BLUR_FEATHER_MAX,
    RENDER_PREVIEW_BLACK_DATA_URL,
    runPipelineParamPreset,
    handleParamPresetChange,
    getParamPresetsForType,
    isRenderPresetDirty,
    selectProjectDefaults,
    renderPresetMenuCloseRef,
    renderPresetSaveMenuOpen,
    setRenderPresetSaveMenuOpen,
    saveRenderPresetLoading,
    saveRenderStudioParamPreset,
    subtitleFontOptions,
    subtitleFontLoading,
    SUBTITLE_STYLE_PRESETS,
    applySubtitleStylePreset,
    isSubtitlePresetActive,
    buildSubtitlePreviewStyle
  };

  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-300 font-sans selection:bg-lime-500/30 selection:text-lime-200">
      {/* Sidebar Navigation Rail */}
      <aside className={`${sidebarCollapsed ? 'w-20' : 'w-64'} border-r border-zinc-800 flex flex-col p-4 gap-6 transition-all duration-300`}>
        <button
          type="button"
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          aria-expanded={!sidebarCollapsed}
          title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={`flex items-center ${sidebarCollapsed ? 'justify-center' : 'gap-3 px-2'} mb-2 w-full text-left rounded-lg py-2 hover:bg-zinc-900/60 transition-colors`}
        >
          <div className="w-8 h-8 bg-lime-500 rounded-lg flex items-center justify-center text-zinc-950 font-black italic">MF</div>
          {!sidebarCollapsed && <h1 className="text-lg font-bold text-zinc-100 tracking-tight">MediaForge</h1>}
        </button>

        <nav className="flex flex-col gap-1 flex-1">
          <SidebarItem 
            icon={LayoutDashboard} 
            label="Dashboard" 
            active={activeTab === 'dashboard'} 
            onClick={() => setActiveTab('dashboard')} 
            collapsed={sidebarCollapsed}
          />
          <SidebarItem 
            icon={Hammer} 
            label="Pipeline Forge" 
            active={activeTab === 'forge'} 
            onClick={() => setActiveTab('forge')} 
            collapsed={sidebarCollapsed}
          />
          <SidebarItem 
            icon={Database} 
            label="Media Vault" 
            active={activeTab === 'vault'} 
            onClick={() => setActiveTab('vault')} 
            collapsed={sidebarCollapsed}
          />
          <div className="my-4 border-t border-zinc-800/50" />
          <SidebarItem 
            icon={Settings} 
            label="Settings" 
            active={activeTab === 'settings'} 
            onClick={() => setActiveTab('settings')} 
            collapsed={sidebarCollapsed}
          />
          <SidebarItem 
            icon={Terminal} 
            label="System Logs" 
            active={activeTab === 'logs'} 
            onClick={() => setActiveTab('logs')} 
            collapsed={sidebarCollapsed}
          />
        </nav>

        {/* System Health */}
        {!sidebarCollapsed && (
          <div className="bg-zinc-900/50 rounded-xl p-4 border border-zinc-800 flex flex-col gap-3">
            <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-zinc-500">
              <span>System Health</span>
              <Activity size={12} className="text-lime-500" />
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 text-zinc-400"><Cpu size={12} /> CPU</div>
                <span className="font-mono text-zinc-200">--</span>
              </div>
              <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
                <div className="h-full bg-lime-500 w-[0%]" />
              </div>
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 text-zinc-400"><HardDrive size={12} /> Disk</div>
                <span className="font-mono text-zinc-200">--</span>
              </div>
              <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 w-[0%]" />
              </div>
            </div>
          </div>
        )}
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header / Search */}
        <header className="h-16 border-b border-zinc-800 flex items-center justify-between px-8 bg-zinc-950/50 backdrop-blur-md z-10">
          <div className="flex items-center gap-4 flex-1 max-w-xl relative">
            <Search size={18} className="absolute left-3 text-zinc-500" />
            <input 
              type="text" 
              placeholder="Search jobs, files, or pipelines..."
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg py-2 pl-10 pr-4 text-sm focus:outline-none focus:border-lime-500/50 transition-colors"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          
          <div className="flex items-center gap-3">
            <button className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-lg transition-colors">
              <Filter size={18} />
              Filter
            </button>
            <button 
              onClick={() => {
                setRunPipelineProjectLocked(false);
                setRunPipelineProjectId(null);
                resetDownloadForm();
                setShowRunPipeline(true);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-lime-500 text-zinc-950 rounded-lg font-bold text-sm hover:bg-lime-400 transition-colors shadow-lg shadow-lime-500/10"
            >
              Run Pipeline
            </button>
          </div>
        </header>

        {/* Content View */}
        <div className="flex-1 overflow-y-auto">
          <AnimatePresence mode="sync">
            {activeTab === 'dashboard' && (
              <motion.div 
                key="dashboard"
                initial={false}
                animate={false as any}
                exit={false as any}
                className="p-8"
              >
                {/* Quick Stats Grid */}
                <div className="grid grid-cols-3 gap-4 mb-2">
                  <div className="p-4 bg-zinc-900/30 border border-zinc-800 rounded-xl">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="p-1.5 bg-blue-500/10 text-blue-400 rounded-lg"><RefreshCw size={16} /></div>
                      <h3 className="font-semibold text-zinc-200">Throughput</h3>
                    </div>
                    <div className="text-2xl font-bold text-zinc-100 mb-1">--</div>
                    <p className="text-[11px] text-zinc-500">No telemetry yet</p>
                  </div>
                  <div className="p-4 bg-zinc-900/30 border border-zinc-800 rounded-xl">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="p-1.5 bg-lime-500/10 text-lime-400 rounded-lg"><CheckCircle2 size={16} /></div>
                      <h3 className="font-semibold text-zinc-200">Success Rate</h3>
                    </div>
                    <div className="text-2xl font-bold text-zinc-100 mb-1">{successRate !== null ? `${successRate}%` : '--'}</div>
                    <p className="text-[11px] text-zinc-500">{completedJobCount} jobs completed, {failedJobCount} failed</p>
                  </div>
                  <div className="p-4 bg-zinc-900/30 border border-zinc-800 rounded-xl">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="p-1.5 bg-amber-500/10 text-amber-400 rounded-lg"><Clock size={16} /></div>
                      <h3 className="font-semibold text-zinc-200">Queue Time</h3>
                    </div>
                    <div className="text-2xl font-bold text-zinc-100 mb-1">--</div>
                    <p className="text-[11px] text-zinc-500">No telemetry yet</p>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 text-xs text-zinc-500 mb-2">
                  <span>
                    Page {jobPage} of {Math.max(1, Math.ceil(jobs.length / 10))}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setJobPage(prev => Math.max(1, prev - 1))}
                      disabled={jobPage === 1}
                      className="px-2 py-1 border border-zinc-800 rounded-md text-zinc-400 hover:text-zinc-100 hover:border-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Prev
                    </button>
                    <button
                      onClick={() => setJobPage(prev => prev + 1)}
                      disabled={jobPage >= Math.max(1, Math.ceil(jobs.length / 10))}
                      className="px-2 py-1 border border-zinc-800 rounded-md text-zinc-400 hover:text-zinc-100 hover:border-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                  </div>
                </div>

                {/* Job List Table */}
                <div className="bg-zinc-900/30 border border-zinc-800 rounded-xl overflow-hidden">
                  <div className="grid grid-cols-[28px_130px_minmax(0,1fr)_130px_120px_110px_80px] gap-4 px-4 py-3 bg-zinc-900/50 border-b border-zinc-800 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                    <span className="text-right pr-0.5">#</span>
                    <span>Created</span>
                    <span>Job Details</span>
                    <span>Pipeline</span>
                    <span>Progress</span>
                    <span>Status</span>
                    <span className="text-right -ml-2">Duration</span>
                  </div>
                  
                  <div className="flex flex-col">
                    {jobs.length === 0 ? (
                      <div className="p-6 text-sm text-zinc-500">No jobs yet. Run a pipeline to start processing.</div>
                    ) : (
                      jobs
                        .slice((jobPage - 1) * 10, jobPage * 10)
                        .map((job, index) => (
                          <React.Fragment key={job.id}>
                            <JobRow
                              job={job}
                              index={(jobPage - 1) * 10 + index + 1}
                              onContextMenu={(event, targetJob) => {
                                event.preventDefault();
                                setJobContextMenu({
                                  open: true,
                                  x: event.clientX,
                                  y: event.clientY,
                                  jobId: targetJob.id
                                });
                              }}
                            />
                          </React.Fragment>
                        ))
                    )}
                  </div>
                </div>

              </motion.div>
            )}

            {activeTab === 'logs' && (
              <motion.div
                key="logs"
                initial={false}
                animate={false as any}
                exit={false as any}
                className="p-8"
              >
                {jobs.length === 0 ? (
                  <div className="text-sm text-zinc-500">No logs yet.</div>
                ) : (
                  <div className="flex flex-col gap-4">
                    {jobs.map(job => (
                      <div key={job.id} className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-5">
                        <div className="flex items-start justify-between gap-4 mb-3">
                          <div className="min-w-0">
                            <div className="text-xs text-zinc-500 uppercase tracking-widest">System Log</div>
                            <div className="text-sm font-semibold text-zinc-100 truncate">
                              {job.projectName || 'Unknown Project'}
                            </div>
                            <div className="text-xs text-zinc-500 mt-1 truncate">
                              {job.fileName} • {job.fileSize} • {formatLocalDateTime(job.createdAt)}
                            </div>
                          </div>
                          <div className="shrink-0">
                            <StatusBadge status={job.status} />
                          </div>
                        </div>
                        <div className="bg-zinc-950/60 border border-zinc-800 rounded-xl p-4 text-xs text-zinc-200 whitespace-pre-wrap">
                          {job.log || job.error || 'No log output yet.'}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}

            {activeTab === 'forge' && (
              <motion.div 
                key="forge"
                initial={false}
                animate={false as any}
                exit={false as any}
                className="p-8 h-full flex flex-col"
              >
                <div className="mb-8">
                  <h2 className="text-2xl font-bold text-zinc-100">Pipeline Forge</h2>
                  <p className="text-sm text-zinc-500">Construct a multi-step processing sequence</p>
                </div>

                <div className="grid grid-cols-2 gap-6 mb-6">
                  <div className="bg-zinc-900/30 border border-zinc-800 rounded-xl p-5">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-500">Pipelines</h3>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-zinc-500">{pipelineLibrary.length} pipelines</span>
                        <button
                          onClick={() => setShowPipelineEditor(true)}
                          className="px-3 py-1 text-[10px] font-semibold bg-lime-500 text-zinc-950 rounded-md hover:bg-lime-400 transition-colors"
                        >
                          + New
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      {pipelineLibrary.map(pipeline => {
                        const PipelineIcon = resolvePipelineIcon(pipeline);
                        return (
                        <div
                          key={pipeline.id}
                          onClick={() => {
                            if (pipeline.kind === 'task') {
                              openPipelinePreview(pipeline);
                            } else {
                              openPipelineEditor(pipeline);
                            }
                          }}
                          onContextMenu={event => {
                            event.preventDefault();
                            setPipelineContextMenu({
                              open: true,
                              x: event.clientX,
                              y: event.clientY,
                              pipelineId: pipeline.id
                            });
                          }}
                          onKeyDown={event => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              if (pipeline.kind === 'task') {
                                openPipelinePreview(pipeline);
                              } else {
                                openPipelineEditor(pipeline);
                              }
                            }
                          }}
                          role="button"
                          tabIndex={0}
                          className="group text-left p-4 rounded-lg border border-zinc-800 bg-zinc-900/60 hover:border-lime-500/40 transition-colors flex items-start justify-between gap-3 cursor-pointer"
                        >
                          <div className="flex items-start gap-3">
                            <div className="h-9 w-9 rounded-lg border border-zinc-800 bg-zinc-900 flex items-center justify-center">
                              <PipelineIcon size={18} className="text-zinc-200" />
                            </div>
                            <div>
                            <div className="text-sm font-semibold text-zinc-100">{pipeline.name}</div>
                            <div className="mt-2 text-xs text-zinc-500">
                              {pipeline.updatedAt === 'Built-in'
                                ? 'Built-in'
                                : `${pipeline.steps} steps • Updated ${pipeline.updatedAt}`}
                            </div>
                            </div>
                          </div>
                        </div>
                      );
                      })}
                    </div>
                  </div>

                  <div className="bg-zinc-900/30 border border-zinc-800 rounded-xl p-5">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-500">Param Presets</h3>
                      <div className="flex items-center gap-2">
                        <div className="text-[10px] text-zinc-500">{paramPresetCards.length} presets</div>
                        <button
                          onClick={() => openParamPresetEditor(undefined, 'create')}
                          className="px-3 py-1 text-[10px] font-semibold bg-lime-500 text-zinc-950 rounded-md hover:bg-lime-400 transition-colors"
                        >
                          + New
                        </button>
                      </div>
                    </div>
                    {paramPresetCards.length === 0 ? (
                      <div className="text-sm text-zinc-500">No param presets yet. Click Add to create one.</div>
                    ) : (
                      <div className="grid grid-cols-3 gap-4">
                        {paramPresetCards.map(node => {
                        const NodeIcon = node.icon ?? Settings;
                        return (
                          <div
                            key={node.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => openParamPresetEditorForEdit(node.id)}
                            onContextMenu={event => {
                              event.preventDefault();
                              setParamPresetContextMenu({
                                open: true,
                                x: event.clientX,
                                y: event.clientY,
                                presetId: node.id
                              });
                            }}
                            onKeyDown={event => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                openParamPresetEditorForEdit(node.id);
                              }
                            }}
                            className="group text-left p-4 rounded-lg border border-zinc-800 bg-zinc-900/60 hover:border-lime-500/40 transition-colors flex items-start justify-between gap-3 cursor-pointer"
                          >
                            <div className="flex items-start gap-3">
                              <div className="h-9 w-9 rounded-lg border border-zinc-800 bg-zinc-900 flex items-center justify-center">
                                <NodeIcon size={18} className="text-zinc-200" />
                              </div>
                              <div>
                                <div className="text-sm font-semibold text-zinc-100">{node.label}</div>
                                <div className="mt-2 text-xs text-zinc-500">
                                  {node.taskLabel} • {node.params.length} params
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      </div>
                    )}
                  </div>
                </div>

                {showPipelineEditor && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/70 backdrop-blur-sm">
                    <div className="absolute inset-0" onClick={() => setShowPipelineEditor(false)} />
                    <div className="relative w-[min(1100px,92vw)] h-[min(680px,84vh)] bg-zinc-900/95 border border-zinc-800 rounded-2xl p-5 flex flex-col gap-5 shadow-2xl overflow-hidden">
                      <div className="flex items-center justify-between">
                        <div>
                          {isEditingPipelineName ? (
                            <input
                              value={pipelineName}
                              onChange={e => setPipelineName(e.target.value)}
                              onBlur={() => setIsEditingPipelineName(false)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  setIsEditingPipelineName(false);
                                }
                                if (e.key === 'Escape') {
                                  e.preventDefault();
                                  setIsEditingPipelineName(false);
                                }
                              }}
                              className="text-lg font-semibold text-zinc-100 bg-transparent border-b border-zinc-700 focus:outline-none focus:border-lime-500/60 w-full max-w-[420px]"
                              placeholder="New Pipeline"
                              autoFocus
                            />
                          ) : (
                            <button
                              onClick={() => setIsEditingPipelineName(true)}
                              className="text-lg font-semibold text-zinc-100 hover:text-lime-200 transition-colors"
                            >
                              {pipelineName || 'New Pipeline'}
                            </button>
                          )}
                          <div className="text-sm text-zinc-500 mt-2">Drag tasks from the right panel to build a graph</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              setIsEditingPipelineName(false);
                              savePipeline();
                            }}
                            disabled={pipelineSaving || graphNodes.length === 0}
                            className="px-3 py-2 text-xs font-semibold bg-lime-500 text-zinc-950 rounded-lg hover:bg-lime-400 transition-colors disabled:opacity-60"
                          >
                            {pipelineSaving ? 'Saving...' : 'Save'}
                          </button>
                          <button
                            onClick={() => setShowPipelineEditor(false)}
                            className="px-3 py-2 text-xs font-semibold border border-zinc-800 rounded-lg text-zinc-400 hover:text-zinc-100 hover:border-zinc-700"
                          >
                            Close
                          </button>
                        </div>
                      </div>

                      <div className="flex-1 grid grid-cols-[minmax(0,1fr)_320px] gap-6 min-h-0 overflow-y-auto pr-1">
                        {/* Pipeline Builder Canvas */}
                        <div
                          onDragOver={event => event.preventDefault()}
                          onDrop={handleTaskDrop}
                          ref={canvasRef}
                          className="bg-zinc-900/20 rounded-2xl flex flex-col p-2 relative overflow-hidden min-h-0"
                        >
                          {/* Grid Background Effect */}
                          <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
                          
                          <div className="relative z-10 flex flex-col h-full min-h-0">
                            {graphNodes.length === 0 ? (
                              <div className="flex-1 min-h-0 h-full border border-dashed border-zinc-800 rounded-xl flex flex-col items-center justify-center gap-3 text-zinc-500 text-sm">
                                <div className="w-12 h-12 rounded-full bg-zinc-800/70 flex items-center justify-center">
                                  <Plus size={22} />
                                </div>
                                Drop tasks here
                              </div>
                            ) : (
                              <div className="flex-1 min-h-0 h-full relative rounded-xl bg-zinc-950/30 overflow-hidden p-2">
                                <svg className="absolute inset-0 w-full h-full">
                                  {graphEdges.map(edge => {
                                    const fromNode = graphNodes.find(node => node.id === edge.from);
                                    const toNode = graphNodes.find(node => node.id === edge.to);
                                    if (!fromNode || !toNode) return null;
                                    const x1 = fromNode.x + 220;
                                    const y1 = fromNode.y + 40;
                                    const x2 = toNode.x;
                                    const y2 = toNode.y + 40;
                                    return (
                                      <path
                                        key={edge.id}
                                        d={`M ${x1} ${y1} C ${x1 + 60} ${y1}, ${x2 - 60} ${y2}, ${x2} ${y2}`}
                                        stroke="rgba(99, 102, 241, 0.6)"
                                        strokeWidth="2"
                                        fill="none"
                                      />
                                    );
                                  })}
                                </svg>

                                {graphNodes.map(node => (
                                  <div
                                    key={node.id}
                                    className="absolute bg-zinc-900/80 border border-zinc-800 rounded-xl px-3 py-2 shadow-lg w-[210px] group"
                                    style={{ left: node.x, top: node.y }}
                                  >
                                    <div className="flex items-center justify-between relative">
                                      <div
                                        className="flex items-center gap-2 cursor-move"
                                        onMouseDown={event => {
                                          event.preventDefault();
                                          setDraggingNodeId(node.id);
                                          setDragOffset({
                                            x: event.clientX - (canvasRef.current?.getBoundingClientRect().left ?? 0) - node.x,
                                            y: event.clientY - (canvasRef.current?.getBoundingClientRect().top ?? 0) - node.y
                                          });
                                        }}
                                      >
                                        <div className="text-sm font-semibold text-zinc-100">{node.label}</div>
                                      </div>
                                      <button
                                        onClick={() => {
                                          setGraphNodes(prev => prev.filter(item => item.id !== node.id));
                                          setGraphEdges(prev => prev.filter(edge => edge.from !== node.id && edge.to !== node.id));
                                        }}
                                        className="absolute -top-4 -right-4 w-5 h-5 rounded-full bg-zinc-900 text-zinc-400 hover:text-red-300 transition-colors opacity-0 group-hover:opacity-100"
                                        title="Remove block"
                                      >
                                        <span className="text-xs">×</span>
                                      </button>
                                    </div>
                                    <div className="mt-2 grid grid-cols-2 gap-2 text-[10px] text-zinc-400">
                                      <div className="flex flex-col gap-1">
                                        <div className="uppercase tracking-widest text-zinc-500">Input</div>
                                        {node.inputs.map((input, idx) => (
                                          <button
                                            key={`${node.id}-in-${idx}`}
                                            onClick={() => {
                                              if (!pendingConnection) return;
                                              setGraphEdges(prev => [...prev, { id: `${pendingConnection}-${node.id}-${Date.now()}`, from: pendingConnection, to: node.id }]);
                                              setPendingConnection(null);
                                            }}
                                            className={`px-2 py-0.5 rounded-full text-zinc-300 border border-zinc-700 ${pendingConnection ? 'hover:border-lime-500/60' : ''}`}
                                          >
                                            {input}
                                          </button>
                                        ))}
                                      </div>
                                      <div className="flex flex-col gap-1 items-end">
                                        <div className="uppercase tracking-widest text-zinc-500">Output</div>
                                        {node.outputs.map((output, idx) => (
                                          <button
                                            key={`${node.id}-out-${idx}`}
                                            onClick={() => setPendingConnection(node.id)}
                                            className={`px-2 py-0.5 rounded-full text-zinc-300 border border-zinc-700 ${pendingConnection === node.id ? 'border-lime-500/60 text-lime-300' : ''}`}
                                          >
                                            {output}
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Task Library / Inspector */}
                        <div className="flex flex-col gap-6">
                          <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5 flex-1 min-h-0">
                            <h4 className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-4">Available Tasks</h4>
                            <div className="flex flex-col gap-2 overflow-y-auto pr-1">
                            {availableTasks.map((task, i) => (
                                <button
                                  key={i}
                                  draggable
                                  onDragStart={event => event.dataTransfer.setData('text/task', task.type)}
                                  className="flex items-start gap-3 p-3 bg-zinc-900 border border-zinc-800 rounded-lg hover:border-lime-500/50 hover:bg-zinc-800 transition-all text-left group"
                                >
                                  <div className="p-2 bg-zinc-800 rounded-md text-zinc-400 group-hover:text-lime-400 transition-colors">
                                    <task.icon size={18} />
                                  </div>
                                  <div>
                                    <div className="text-sm font-semibold text-zinc-200">{task.label}</div>
                                    <div className="text-[10px] text-zinc-500">{task.desc}</div>
                                  </div>
                                </button>
                              ))}
                            </div>
                          </div>


                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {showParamPresetEditor && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/70 backdrop-blur-sm">
                    <div className="absolute inset-0" onClick={() => setShowParamPresetEditor(false)} />
                    <div className="relative w-[min(520px,92vw)] max-h-[85vh] bg-zinc-900/95 border border-zinc-800 rounded-2xl p-5 flex flex-col gap-4 shadow-2xl overflow-hidden">
                      <div>
                        <div className="text-xs text-zinc-500 uppercase tracking-widest">
                          {paramPresetEditorMode === 'edit' ? 'Edit Param Preset' : 'Create Param Preset'}
                        </div>
                        <div className="mt-1 flex items-center gap-2">
                          <span className="text-sm font-semibold text-zinc-100">
                            {paramPresetTask?.label ?? 'Pipeline'}
                          </span>
                          <span className="text-[10px] font-semibold uppercase tracking-widest px-2 py-0.5 rounded bg-zinc-800 text-zinc-400">
                            Pipeline
                          </span>
                        </div>
                        <div className="mt-3 flex flex-col gap-1.5">
                          <label className="text-xs text-zinc-500 uppercase tracking-widest">Name</label>
                          <input
                            value={paramPresetLabelDraft}
                            onChange={e => setParamPresetLabelDraft(e.target.value)}
                            className="w-full bg-transparent text-lg font-semibold text-zinc-100 placeholder:text-zinc-600 focus:outline-none"
                            placeholder="Param preset name"
                          />
                        </div>
                      </div>
                      {paramPresetEditorMode === 'create' && (
                        <div className="flex flex-col gap-2">
                          <label className="text-xs text-zinc-500 uppercase tracking-widest">Pipeline</label>
                          <select
                            value={paramPresetTaskType}
                            onChange={e => setParamPresetTaskType(e.target.value)}
                            className="bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-2 text-sm text-zinc-200 focus:outline-none"
                          >
                            {availableTasks.map(task => (
                              <option key={task.type} value={task.type}>{task.label}</option>
                            ))}
                          </select>
                        </div>
                      )}
                      <div className="flex flex-col gap-3 max-h-[50vh] overflow-y-auto pr-1">
                        <div className="text-xs text-zinc-500 uppercase tracking-widest">Params</div>
                        {paramPresetTask?.params?.length ? (
                          <div className="flex flex-col gap-2">
                            {paramPresetTask.params.map(param => (
                              <div key={param.name} className="flex flex-col gap-1.5">
                                <label className="text-[11px] text-zinc-500">{param.name}</label>
                                {param.type === 'boolean' ? (
                                  <label className="flex items-center gap-2 text-sm text-zinc-200">
                                    <input
                                      type="checkbox"
                                      checked={Boolean(paramPresetValues[param.name])}
                                      onChange={e => setParamPresetValues(prev => ({ ...prev, [param.name]: e.target.checked }))}
                                      className="accent-lime-400"
                                    />
                                  </label>
                                ) : param.name === 'downloadMode' ? (
                                  <select
                                    value={typeof paramPresetValues[param.name] === 'string' ? paramPresetValues[param.name] : 'all'}
                                    onChange={e => setParamPresetValues(prev => ({ ...prev, [param.name]: e.target.value }))}
                                    className="bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-sm text-zinc-200 focus:outline-none"
                                  >
                                    {DOWNLOAD_MODE_OPTIONS.map(option => (
                                      <option key={option.value} value={option.value}>
                                        {option.label}
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  <input
                                    type={param.type === 'number' ? 'number' : 'text'}
                                    value={typeof paramPresetValues[param.name] === 'string' ? paramPresetValues[param.name] : ''}
                                    onChange={e => setParamPresetValues(prev => ({ ...prev, [param.name]: e.target.value }))}
                                    className="bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-sm text-zinc-200 focus:outline-none"
                                    placeholder={param.default !== undefined ? String(param.default) : ''}
                                  />
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-sm text-zinc-500">No params for this pipeline.</div>
                        )}
                      </div>
                      <div className="flex items-center justify-end gap-3">
                        <button
                          onClick={() => setShowParamPresetEditor(false)}
                          className="px-4 py-2 text-xs font-semibold border border-zinc-800 rounded-lg text-zinc-400 hover:text-zinc-100 hover:border-zinc-700"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={saveParamPreset}
                          disabled={!paramPresetTask?.params?.length}
                          className="px-4 py-2 text-xs font-semibold rounded-lg bg-lime-500 text-zinc-950 hover:bg-lime-400 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  </div>
                )}


                {showPipelinePreview && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/70 backdrop-blur-sm">
                    <div className="absolute inset-0" onClick={() => setShowPipelinePreview(false)} />
                    <div className="relative w-[min(900px,92vw)] h-[min(560px,80vh)] bg-zinc-900/95 border border-zinc-800 rounded-2xl p-5 flex flex-col gap-5 shadow-2xl overflow-hidden">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-lg font-semibold text-zinc-100">{pipelinePreviewTask?.label ?? 'Pipeline Preview'}</div>
                          <div className="text-sm text-zinc-500 mt-2">Built-in pipeline overview</div>
                        </div>
                        <button
                          onClick={() => setShowPipelinePreview(false)}
                          className="px-3 py-2 text-xs font-semibold border border-zinc-800 rounded-lg text-zinc-400 hover:text-zinc-100 hover:border-zinc-700"
                        >
                          Close
                        </button>
                      </div>

                      <div
                        className={`flex-1 min-h-0 grid gap-5 overflow-y-auto pr-1 ${
                          pipelinePreviewTask?.preview === 'tts'
                            ? 'grid-cols-[minmax(0,1fr)_minmax(0,1fr)]'
                            : 'grid-cols-1'
                        }`}
                      >
                        <div className="flex flex-col gap-4">
                          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
                            <div className="text-xs text-zinc-500 uppercase tracking-widest">Overview</div>
                            <div className="text-sm text-zinc-200 mt-2">{pipelinePreviewTask?.desc ?? 'No description yet.'}</div>
                            <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-zinc-400">
                              <span className="px-2 py-1 rounded-md border border-zinc-800 bg-zinc-900/80">Inputs: {pipelinePreviewTask?.inputs?.join(', ') ?? '--'}</span>
                              <span className="px-2 py-1 rounded-md border border-zinc-800 bg-zinc-900/80">Outputs: {pipelinePreviewTask?.outputs?.join(', ') ?? '--'}</span>
                            </div>
                          </div>

                          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
                            <div className="text-xs text-zinc-500 uppercase tracking-widest">Custom Parameters</div>
                            <div className="mt-3 flex flex-col gap-3 text-xs text-zinc-300">
                              {pipelinePreviewTask?.params?.length ? (() => {
                                const visibleParams = pipelinePreviewTask.params.filter(param => {
                                  if (pipelinePreviewTask.type === 'tts' && param.name === 'text') return false;
                                  return true;
                                });
                                if (!visibleParams.length) {
                                  return <div className="text-xs text-zinc-500">No custom parameters.</div>;
                                }
                                return visibleParams.map(param => (
                                  <div key={param.name} className="border border-zinc-800 rounded-lg p-3 bg-zinc-900/70 flex flex-col gap-2">
                                    <div className="flex items-center justify-between gap-3">
                                      <div className="text-xs font-semibold text-zinc-100">{param.name}</div>
                                      <div className="text-[11px] text-zinc-500">{param.desc}</div>
                                    </div>
                                    {pipelinePreviewTask.preview === 'tts' && pipelinePreviewTask.type === 'tts' && param.name === 'voice' ? (
                                      <select
                                        value={previewTtsVoice}
                                        onChange={e => {
                                          const value = e.target.value;
                                          setPreviewTtsVoice(value);
                                          setPreviewCustomParams(prev => ({ ...prev, voice: value }));
                                        }}
                                        className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none"
                                      >
                                        {PREFERRED_TTS_VOICES.map(name => (
                                          <option key={name} value={name}>
                                            {name}
                                          </option>
                                        ))}
                                      </select>
                                    ) : pipelinePreviewTask.preview === 'tts' && pipelinePreviewTask.type === 'tts' && param.name === 'rate' ? (
                                      <input
                                        type="number"
                                        step="0.1"
                                        value={previewTtsRate}
                                        onChange={e => {
                                          const value = e.target.value;
                                          setPreviewTtsRate(value);
                                          const numeric = Number(value);
                                          setPreviewCustomParams(prev => ({
                                            ...prev,
                                            rate: value === '' || Number.isNaN(numeric) ? '' : numeric
                                          }));
                                        }}
                                        placeholder="1.1"
                                        className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none"
                                      />
                                    ) : pipelinePreviewTask.preview === 'tts' && pipelinePreviewTask.type === 'tts' && param.name === 'pitch' ? (
                                      <div className="flex items-center gap-2">
                                        <input
                                          type="number"
                                          step="0.1"
                                          value={previewTtsPitch}
                                          onChange={e => {
                                            const value = e.target.value;
                                            setPreviewTtsPitch(value);
                                            const numeric = Number(value);
                                            setPreviewCustomParams(prev => ({
                                              ...prev,
                                              pitch: value === '' || Number.isNaN(numeric) ? '' : numeric
                                            }));
                                          }}
                                          placeholder="1"
                                          className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none"
                                        />
                                        <span className="text-xs text-zinc-500">st</span>
                                      </div>
                                    ) : pipelinePreviewTask.preview === 'tts' ? (
                                      <input
                                        type={param.type === 'number' ? 'number' : 'text'}
                                        step={param.type === 'number' ? '0.1' : undefined}
                                        value={previewCustomParams[param.name] ?? ''}
                                        onChange={e => {
                                          const value = e.target.value;
                                          if (param.type === 'number') {
                                            const numeric = Number(value);
                                            setPreviewCustomParams(prev => ({
                                              ...prev,
                                              [param.name]: Number.isFinite(numeric) && value !== '' ? numeric : ''
                                            }));
                                          } else {
                                            setPreviewCustomParams(prev => ({ ...prev, [param.name]: value }));
                                          }
                                        }}
                                        className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none"
                                        placeholder={param.default ?? `Enter ${param.name}`}
                                      />
                                    ) : null}
                                  </div>
                                ));
                              })() : (
                                <div className="text-xs text-zinc-500">No custom parameters.</div>
                              )}
                            </div>
                          </div>
                        </div>

                        {pipelinePreviewTask?.preview === 'tts' && (
                          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 flex flex-col gap-3">
                            <div className="text-xs text-zinc-500 uppercase tracking-widest">Preview</div>
                            <label className="text-[11px] text-zinc-500 uppercase tracking-widest">Text</label>
                            <textarea
                              value={previewTtsText}
                              onChange={e => {
                                const value = e.target.value;
                                setPreviewTtsText(value);
                              }}
                              className="min-h-[110px] bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none"
                            />
                            <button
                              onClick={async () => {
                                if (!previewTtsText.trim()) return;
                                setPreviewTtsLoading(true);
                                setPreviewTtsError(null);
                                try {
                                  const response = await fetch('/api/tts', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                      text: previewTtsText,
                                      voice: previewCustomParams.voice ?? previewTtsVoice,
                                      rate: (() => {
                                        const raw = previewCustomParams.rate ?? previewTtsRate;
                                        const numeric = Number(raw);
                                        return Number.isFinite(numeric) && raw !== '' ? numeric : undefined;
                                      })(),
                                      pitch: (() => {
                                        const raw = previewCustomParams.pitch ?? previewTtsPitch;
                                        const numeric = Number(raw);
                                        return Number.isFinite(numeric) && raw !== '' ? numeric : undefined;
                                      })()
                                    })
                                  });
                                  if (!response.ok) {
                                    const data = await response.json().catch(() => ({}));
                                    throw new Error(data.error || 'TTS preview failed');
                                  }
                                  const arrayBuffer = await response.arrayBuffer();
                                  if (previewTtsUrl) URL.revokeObjectURL(previewTtsUrl);
                                  const url = URL.createObjectURL(new Blob([arrayBuffer], { type: 'audio/mpeg' }));
                                  setPreviewTtsUrl(url);
                                } catch (error) {
                                  setPreviewTtsError(error instanceof Error ? error.message : 'TTS preview failed');
                                } finally {
                                  setPreviewTtsLoading(false);
                                }
                              }}
                              className="px-4 py-2 bg-lime-500 text-zinc-950 rounded-lg text-xs font-semibold hover:bg-lime-400 transition-colors disabled:opacity-60"
                              disabled={previewTtsLoading}
                            >
                              {previewTtsLoading ? 'Generating...' : 'Generate Preview'}
                            </button>
                            {previewTtsError && <div className="text-xs text-red-300">{previewTtsError}</div>}
                            {previewTtsUrl && (
                              <audio key={previewTtsUrl} ref={previewTtsAudioRef} controls className="w-full">
                                <source src={previewTtsUrl} type="audio/mpeg" />
                              </audio>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

              </motion.div>
            )}

            {toastVisible && toastMessage && (
              <div className={`fixed bottom-6 right-6 z-[70] px-4 py-2 rounded-lg border text-sm shadow-lg ${toastStyles[toastType]}`}>
                {toastMessage}
              </div>
            )}

            {vaultContextMenu.open && vaultContextMenu.folder && (
              <div className="fixed inset-0 z-[80]" onClick={closeVaultContextMenu}>
                <div
                  className="absolute bg-zinc-900 border border-zinc-800 rounded-xl shadow-xl p-2 w-48 text-xs text-zinc-200"
                  style={{ left: vaultContextMenu.x, top: vaultContextMenu.y }}
                  onClick={event => event.stopPropagation()}
                >
                  <button
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-zinc-800 transition-colors"
                    onClick={() => {
                      const folder = vaultContextMenu.folder;
                      if (!folder) return;
                      setVaultFolderId(folder.id);
                      setVaultFileId(folder.files[0]?.id ?? null);
                      setShowFolderPanel(true);
                      closeVaultContextMenu();
                    }}
                  >
                    Open Project
                  </button>
                  <button
                    className="w-full text-left px-3 py-2 rounded-lg text-red-300 hover:bg-red-500/10 transition-colors"
                    onClick={() => {
                      const folder = vaultContextMenu.folder;
                      if (!folder) return;
                      closeVaultContextMenu();
                      deleteVaultProject(folder);
                    }}
                  >
                    Delete Project
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'vault' && (
              <motion.div
                key="vault"
                initial={false}
                animate={false as any}
                exit={false as any}
                className="p-8 h-full flex flex-col gap-4"
              >
                {vaultError && (
                  <div className="bg-red-500/10 border border-red-500/30 text-red-200 px-4 py-3 rounded-xl text-sm">
                    {vaultError}
                  </div>
                )}

                <div className="grid grid-cols-[minmax(0,7fr)_minmax(0,3fr)] gap-6 flex-1 min-h-0">
                  {/* Folder Navigation */}
                  <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-4 flex flex-col gap-4 min-h-0 min-w-0">
                    <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-400">
                      <Search size={14} />
                      <input
                        value={vaultFolderQuery}
                        onChange={e => setVaultFolderQuery(e.target.value)}
                        placeholder="Search"
                        className="bg-transparent focus:outline-none"
                      />
                      <div className="ml-auto flex items-center gap-2">
                        <button
                          onClick={() => setImportPopupOpen(true)}
                          className="px-2 py-1 rounded-md border border-zinc-800 text-zinc-400 hover:text-zinc-100 hover:border-lime-500/40"
                          title="Import files"
                        >
                          <Upload size={14} />
                        </button>
                        <button
                          onClick={loadVault}
                          className="text-zinc-400 hover:text-zinc-100 transition-colors"
                          title="Rescan folders"
                        >
                          <RefreshCw size={14} className={vaultLoading ? 'animate-spin-soft' : ''} />
                        </button>
                      </div>
                    </div>

                    <div className="flex-1 overflow-y-auto pr-1">
                      <div className="flex flex-col gap-2">
                        {filteredFolders.map(folder => {
                          const isActive = folder.id === selectedFolder?.id;
                          const firstVideo = folder.files.find(file => file.type === 'video');
                          const videoCount = folder.files.filter(file => file.type === 'video').length;
                          const audioCount = folder.files.filter(file => file.type === 'audio').length;
                          const subtitleCount = folder.files.filter(file => file.type === 'subtitle').length;
                          const otherCount = folder.files.filter(file => file.type === 'other').length;
                          const totalVideoSeconds = folder.files
                            .filter(file => file.type === 'video')
                            .reduce((sum, file) => sum + parseDurationToSeconds(file.duration), 0);
                          const totalVideoDuration = formatDuration(totalVideoSeconds);
                          return (
                            <button
                              key={folder.id}
                              onClick={() => {
                                setVaultFolderId(folder.id);
                                setVaultFileId(folder.files[0]?.id ?? null);
                              }}
                              onContextMenu={event => openVaultContextMenu(event, folder)}
                              className={`text-left p-3 rounded-xl border transition-colors ${
                                isActive ? 'border-lime-500/40 bg-lime-500/10' : 'border-zinc-800 bg-zinc-900/60 hover:border-zinc-700'
                              }`}
                            >
                              <div className="flex items-start gap-4">
                                <div className="w-28 shrink-0">
                                  <div className="w-full aspect-video rounded-lg bg-zinc-800/80 border border-zinc-700 flex items-center justify-center text-zinc-500 text-xs font-semibold overflow-hidden">
                                    {firstVideo?.relativePath ? (
                                      <img
                                        src={`/api/vault/thumb?path=${encodeURIComponent(firstVideo.relativePath)}`}
                                        alt={firstVideo.name}
                                        className="w-full h-full object-cover"
                                      />
                                    ) : firstVideo ? (
                                      <FileVideo size={22} />
                                    ) : (
                                      <File size={18} />
                                    )}
                                  </div>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      <span className="text-sm font-semibold text-zinc-100 truncate">{folder.name}</span>
                                    </div>
                                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-zinc-500/15 text-zinc-400">
                                      Project
                                    </span>
                                  </div>
                                  <div className="mt-2 flex items-center justify-between text-[10px] text-zinc-500">
                                    <div className="flex items-center gap-3">
                                      {videoCount > 0 && (
                                        <span
                                          className="flex items-center gap-1"
                                          title={buildTooltip(folder.files.filter(file => file.type === 'video'))}
                                        >
                                          <FileVideo size={12} />
                                          {videoCount}
                                        </span>
                                      )}
                                      {audioCount > 0 && (
                                        <span
                                          className="flex items-center gap-1"
                                          title={buildTooltip(folder.files.filter(file => file.type === 'audio'))}
                                        >
                                          <FileAudio size={12} />
                                          {audioCount}
                                        </span>
                                      )}
                                      {subtitleCount > 0 && (
                                        <span
                                          className="flex items-center gap-1"
                                          title={buildTooltip(folder.files.filter(file => file.type === 'subtitle'))}
                                        >
                                          <Type size={12} />
                                          {subtitleCount}
                                        </span>
                                      )}
                                      {otherCount > 0 && (
                                        <span
                                          className="flex items-center gap-1"
                                          title={buildTooltip(folder.files.filter(file => file.type === 'other'))}
                                        >
                                          <File size={12} />
                                          {otherCount}
                                        </span>
                                      )}
                                    </div>
                                    <span>
                                      {totalVideoDuration ? `Total ${totalVideoDuration}` : `Updated ${folder.lastActivity}`}
                                    </span>
                                  </div>
                                  <div className="mt-2 flex flex-wrap gap-1">
                                    {folder.tags.map(tag => (
                                      <span key={tag} className="px-2 py-0.5 rounded-full text-[10px] bg-zinc-800 text-zinc-400">
                                        {tag}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Preview Panel */}
                  <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-5 flex flex-col gap-4 min-h-0 min-w-0">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-xs text-zinc-500 uppercase tracking-widest">Preview</div>
                        <div className="text-sm font-semibold text-zinc-100">{selectedFolder?.name ?? 'Select a project'}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        {selectedFile && (
                          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                            selectedFile.origin === 'tts'
                              ? 'bg-amber-500/15 text-amber-300'
                              : selectedFile.origin === 'vr'
                                ? 'bg-lime-500/15 text-lime-400'
                                : 'bg-zinc-500/15 text-zinc-400'
                          }`}>
                            {selectedFile.origin === 'tts' ? 'TTS' : selectedFile.origin === 'vr' ? 'VR' : 'Source'}
                          </span>
                        )}
                        <button
                          onClick={() => setShowFolderPanel(true)}
                          disabled={!selectedFolder}
                          className="px-2 py-1 text-[10px] border border-zinc-800 rounded-md text-zinc-400 hover:text-zinc-100 hover:border-lime-500/40 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Open Project
                        </button>
                      </div>
                    </div>

                    {selectedFolder && (
                      <button
                        onClick={() => {
                          setRunPipelineProjectLocked(true);
                          setRunPipelineProjectId(selectedFolder.id);
                          resetDownloadForm();
                          setShowRunPipeline(true);
                        }}
                        className="w-full px-3 py-2 bg-lime-500 text-zinc-950 rounded-lg text-xs font-semibold hover:bg-lime-400 transition-colors"
                      >
                        Run Pipeline
                      </button>
                    )}

                    {selectedFolder ? (
                      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-4">
                        {previewGroups(selectedFolder)
                          .filter(group => group.items.length > 0)
                          .map(group => (
                          <div key={group.type} className="border border-zinc-800 rounded-xl p-4 bg-zinc-900/80">
                            <div className="flex items-center justify-between text-xs text-zinc-500 uppercase tracking-widest">
                              <span>{group.label}</span>
                              <span>{group.items.length}</span>
                            </div>
                            {group.items.length === 0 ? (
                              <div className="mt-3 text-xs text-zinc-500">No files</div>
                            ) : (
                              <div className="mt-3 flex flex-col gap-2">
                                {group.items.map(item => (
                                  <div
                                    key={item.id}
                                    className="flex items-center justify-between text-xs text-zinc-300"
                                    onContextMenu={event => openFileContextMenu(event, item)}
                                  >
                                    <div className="min-w-0">
                                      <div className="truncate text-zinc-200">{item.name}</div>
                                      <div className="text-[10px] text-zinc-500 mt-1">
                                        {item.size}
                                        {item.duration ? ` • ${item.duration}` : ''}
                                        {item.language ? ` • ${item.language}` : ''}
                                      </div>
                                      {item.linkedTo && (
                                        <div className="text-[10px] text-zinc-500 mt-1">
                                          Generated from {selectedFolder.files.find(file => file.id === item.linkedTo)?.name ?? 'source file'}
                                        </div>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                                        item.origin === 'tts'
                                          ? 'bg-amber-500/15 text-amber-300'
                                          : item.origin === 'vr'
                                            ? 'bg-lime-500/15 text-lime-400'
                                            : 'bg-zinc-500/15 text-zinc-400'
                                      }`}>
                                        {item.origin === 'tts' ? 'TTS' : item.origin === 'vr' ? 'VR' : 'Source'}
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex-1 flex items-center justify-center text-sm text-zinc-500 border border-dashed border-zinc-800 rounded-2xl">
                        No projects loaded
                      </div>
                    )}
                  </div>
                </div>

              </motion.div>
            )}

            {showFolderPanel && selectedFolder && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/70 backdrop-blur-sm">
                <div className="absolute inset-0" onClick={() => setShowFolderPanel(false)} />
                <div className="relative w-[min(960px,92vw)] h-[min(720px,86vh)] bg-zinc-900/95 border border-zinc-800 rounded-2xl p-4 flex flex-col gap-4 shadow-2xl min-h-0 overflow-y-auto">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-xl font-bold text-zinc-100">{selectedFolder.name}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-zinc-500/15 text-zinc-400">
                          Project
                        </span>
                        <span className="text-xs text-zinc-500">Last activity {selectedFolder.lastActivity}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button className="px-2.5 py-1.5 text-xs font-semibold bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-200 hover:border-lime-500/40 transition-colors">
                        Quick Actions
                      </button>
                      <button className="px-2.5 py-1.5 text-xs font-semibold bg-lime-500 text-zinc-950 rounded-lg hover:bg-lime-400 transition-colors">
                        New Job
                      </button>
                      <button
                        onClick={() => setShowFolderPanel(false)}
                        className="px-2.5 py-1.5 text-xs font-semibold border border-zinc-800 rounded-lg text-zinc-400 hover:text-zinc-100 hover:border-zinc-700"
                      >
                        Close
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3">
                    {selectedFolder.suggestedAction && (
                      <div className="flex items-center justify-between bg-blue-500/10 border border-blue-500/30 text-blue-200 px-3 py-2 rounded-xl text-sm">
                        <span>{selectedFolder.suggestedAction}</span>
                        <button className="px-2.5 py-1 text-xs font-semibold bg-blue-500/20 text-blue-100 rounded-lg border border-blue-500/40">
                          Do It
                        </button>
                      </div>
                    )}

                    <div className="grid grid-cols-5 gap-2">
                      {(['video', 'audio', 'subtitle', 'image', 'output'] as VaultFileType[]).map(type => {
                        const count = selectedFolder.files.filter(file => file.type === type).length;
                        const Icon = fileTypeIcons[type];
                        return (
                          <div key={type} className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-2.5">
                            <div className="flex items-center gap-2 text-xs text-zinc-500">
                              <Icon size={14} />
                              {fileTypeLabels[type]}
                            </div>
                            <div className="text-lg font-bold text-zinc-100 mt-2">{count}</div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <div className="text-xs text-zinc-500 uppercase tracking-widest">Files</div>
                        <div className="text-xs text-zinc-500">({filteredFiles.length})</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-400">
                          <Search size={14} />
                          <input
                            value={vaultQuery}
                            onChange={e => setVaultQuery(e.target.value)}
                            placeholder="Search inside folder"
                            className="bg-transparent focus:outline-none"
                          />
                        </div>
                        <select
                          value={vaultTypeFilter}
                          onChange={e => setVaultTypeFilter(e.target.value as VaultFileType | 'all')}
                          className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-300 focus:outline-none"
                        >
                          <option value="all">All Types</option>
                          <option value="video">Video</option>
                          <option value="audio">Audio</option>
                          <option value="subtitle">Subtitle</option>
                          <option value="image">Image</option>
                          <option value="output">Output</option>
                          <option value="other">Other</option>
                        </select>
                        <select
                          value={vaultSort}
                          onChange={e => setVaultSort(e.target.value as 'recent' | 'name' | 'size')}
                          className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-300 focus:outline-none"
                        >
                          <option value="recent">Recent</option>
                          <option value="name">Name</option>
                          <option value="size">Size</option>
                        </select>
                        <button
                          onClick={() => setVaultView(vaultView === 'grouped' ? 'flat' : 'grouped')}
                          className="px-2.5 py-1.5 text-xs border border-zinc-800 rounded-lg text-zinc-300 hover:border-lime-500/40"
                        >
                          {vaultView === 'grouped' ? 'Flat View' : 'Grouped View'}
                        </button>
                      </div>
                    </div>

                    <div className="pr-1">
                      <div className="flex flex-col gap-4">
                        {vaultView === 'grouped' ? (
                          groupedFiles.map(group => {
                            if (group.items.length === 0) return null;
                            return (
                              <div key={group.type} className="flex flex-col gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setVaultGroupCollapsed(prev => ({ ...prev, [group.type]: !prev[group.type] }))}
                                  className="flex items-center justify-between text-[10px] font-semibold text-zinc-400 uppercase tracking-widest hover:text-zinc-300"
                                >
                                  <span className="flex items-center gap-2">
                                    <ChevronRight
                                      size={12}
                                      className={`transition-transform ${vaultGroupCollapsed[group.type] ? '' : 'rotate-90'}`}
                                    />
                                    {fileTypeLabels[group.type]}
                                  </span>
                                  <span>{group.items.length}</span>
                                </button>
                                {!vaultGroupCollapsed[group.type] && (
                                  <div className="flex flex-col gap-1.5">
                                    {group.items.map(file => {
                                      const isSelected = file.id === selectedFile?.id;
                                      const Icon = fileTypeIcons[file.type];
                                      return (
                                        <button
                                          key={file.id}
                                          onClick={() => setVaultFileId(file.id)}
                                          onContextMenu={event => openFileContextMenu(event, file)}
                                          className={`group text-left border rounded-xl p-2.5 transition-colors ${
                                            isSelected ? 'border-lime-500/50 bg-lime-500/10' : 'border-zinc-800 bg-zinc-900/70 hover:border-zinc-700'
                                          }`}
                                        >
                                          <div className="flex items-start justify-between gap-4">
                                            <div className="flex items-start gap-3">
                                              <div className="p-1.5 bg-zinc-800 rounded-lg text-zinc-400">
                                                <Icon size={14} />
                                              </div>
                                              <div>
                                                <div className="text-xs font-semibold text-zinc-100">{file.name}</div>
                                                <div className="text-[11px] text-zinc-500 mt-0.5">
                                                  {fileTypeLabels[file.type]} • {file.size}{file.duration ? ` • ${file.duration}` : ''}{file.language ? ` • ${file.language}` : ''}
                                                </div>
                                                  {file.linkedTo && (
                                                    <div className="text-[11px] text-zinc-500 mt-0.5">
                                                      Generated from {selectedFolder.files.find(item => item.id === file.linkedTo)?.name ?? 'source file'}
                                                    </div>
                                                  )}
                                                  {file.origin === 'tts' && file.tts?.overlapSeconds !== undefined && file.tts?.overlapMode !== 'truncate' && (
                                                    <div className="text-[11px] text-zinc-500 mt-0.5">
                                                      Overlap total {formatOverlapDisplay(file.tts.overlapSeconds, file.durationSeconds)}
                                                    </div>
                                                  )}
                                              </div>
                                            </div>
                                            <div className="flex flex-col items-end gap-1.5">
                                              <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                                                file.origin === 'tts'
                                                  ? 'bg-amber-500/15 text-amber-300'
                                                  : file.origin === 'vr'
                                                    ? 'bg-lime-500/15 text-lime-400'
                                                    : 'bg-zinc-500/15 text-zinc-400'
                                              }`}>
                                                {file.origin === 'tts' ? 'TTS' : file.origin === 'vr' ? 'VR' : 'Source'}
                                              </span>
                                              <span className="text-[10px] text-zinc-500">{file.createdAt}</span>
                                            </div>
                                          </div>
                                          {file.status === 'processing' && typeof file.progress === 'number' && (
                                            <div className="mt-3">
                                              <div className="flex justify-between text-[10px] text-zinc-500">
                                                <span>Processing</span>
                                                <span>{file.progress}%</span>
                                              </div>
                                              <div className="h-1 bg-zinc-800 rounded-full overflow-hidden mt-1">
                                                <div className="h-full bg-blue-500" style={{ width: `${file.progress}%` }} />
                                              </div>
                                            </div>
                                          )}
                                          {isSelected && file.type === 'audio' && file.relativePath && (
                                            <div className="mt-2 border border-zinc-800 rounded-lg p-2 bg-zinc-900/80">
                                              <audio
                                                className="w-full mt-1.5 h-8 rounded-md bg-zinc-900"
                                                style={{ colorScheme: 'dark' }}
                                                controls
                                              >
                                                <source src={`/api/vault/stream?path=${encodeURIComponent(file.relativePath)}&preview=1`} />
                                              </audio>
                                              {file.sizeBytes > 20 * 1024 * 1024 && (
                                                <div className="text-[11px] text-zinc-500 mt-1.5">
                                                  Preview limited to the first 60 seconds for files over 20MB.
                                                </div>
                                              )}
                                            </div>
                                          )}
                                          <div className="mt-2" />
                                        </button>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })
                        ) : (
                          <div className="flex flex-col gap-1.5">
                            {filteredFiles.map(file => {
                              const isSelected = file.id === selectedFile?.id;
                              const Icon = fileTypeIcons[file.type];
                              return (
                                <button
                                  key={file.id}
                                  onClick={() => setVaultFileId(file.id)}
                                  onContextMenu={event => openFileContextMenu(event, file)}
                                  className={`group text-left border rounded-xl p-2.5 transition-colors ${
                                    isSelected ? 'border-lime-500/50 bg-lime-500/10' : 'border-zinc-800 bg-zinc-900/70 hover:border-zinc-700'
                                  }`}
                                >
                                  <div className="flex items-start justify-between gap-4">
                                    <div className="flex items-start gap-3">
                                      <div className="p-1.5 bg-zinc-800 rounded-lg text-zinc-400">
                                        <Icon size={14} />
                                      </div>
                                      <div>
                                        <div className="text-xs font-semibold text-zinc-100">{file.name}</div>
                                        <div className="text-[11px] text-zinc-500 mt-0.5">
                                          {fileTypeLabels[file.type]} • {file.size}{file.duration ? ` • ${file.duration}` : ''}{file.language ? ` • ${file.language}` : ''}
                                        </div>
                                        {file.linkedTo && (
                                          <div className="text-[11px] text-zinc-500 mt-0.5">
                                            Generated from {selectedFolder.files.find(item => item.id === file.linkedTo)?.name ?? 'source file'}
                                          </div>
                                        )}
                                        {file.origin === 'tts' && file.tts?.overlapSeconds !== undefined && file.tts?.overlapMode !== 'truncate' && (
                                          <div className="text-[11px] text-zinc-500 mt-0.5">
                                            Overlap total {formatOverlapDisplay(file.tts.overlapSeconds, file.durationSeconds)}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                    <div className="flex flex-col items-end gap-1.5">
                                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                                        file.origin === 'tts'
                                          ? 'bg-amber-500/15 text-amber-300'
                                          : file.origin === 'vr'
                                            ? 'bg-lime-500/15 text-lime-400'
                                            : 'bg-zinc-500/15 text-zinc-400'
                                      }`}>
                                        {file.origin === 'tts' ? 'TTS' : file.origin === 'vr' ? 'VR' : 'Source'}
                                      </span>
                                      <span className="text-[10px] text-zinc-500">{file.createdAt}</span>
                                    </div>
                                  </div>
                                  {file.status === 'processing' && typeof file.progress === 'number' && (
                                    <div className="mt-3">
                                      <div className="flex justify-between text-[10px] text-zinc-500">
                                        <span>Processing</span>
                                        <span>{file.progress}%</span>
                                      </div>
                                      <div className="h-1 bg-zinc-800 rounded-full overflow-hidden mt-1">
                                        <div className="h-full bg-blue-500" style={{ width: `${file.progress}%` }} />
                                      </div>
                                    </div>
                                  )}
                                  {isSelected && file.type === 'audio' && file.relativePath && (
                                    <div className="mt-2 border border-zinc-800 rounded-lg p-2 bg-zinc-900/80">
                                      <audio
                                        className="w-full mt-1.5 h-8 rounded-md bg-zinc-900"
                                        style={{ colorScheme: 'dark' }}
                                        controls
                                      >
                                        <source src={`/api/vault/stream?path=${encodeURIComponent(file.relativePath)}&preview=1`} />
                                      </audio>
                                      {file.sizeBytes > 20 * 1024 * 1024 && (
                                        <div className="text-[11px] text-zinc-500 mt-1.5">
                                          Preview limited to the first 60 seconds for files over 20MB.
                                        </div>
                                      )}
                                    </div>
                                  )}
                                  <div className="mt-2" />
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {importPopupOpen && (
              <div className="fixed inset-0 z-[60] flex items-center justify-center bg-zinc-950/70 backdrop-blur-sm">
                <div className="absolute inset-0" onClick={() => setImportPopupOpen(false)} />
                <div className="relative w-[min(560px,92vw)] bg-zinc-900/95 border border-zinc-800 rounded-2xl p-5 flex flex-col gap-4 shadow-2xl">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs text-zinc-500 uppercase tracking-widest">Import Files</div>
                      <div className="text-sm font-semibold text-zinc-100">Add files to project</div>
                    </div>
                    <button
                      onClick={() => setImportPopupOpen(false)}
                      className="px-3 py-2 text-xs font-semibold border border-zinc-800 rounded-lg text-zinc-400 hover:text-zinc-100 hover:border-zinc-700"
                    >
                      Close
                    </button>
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-xs text-zinc-500 uppercase tracking-widest">Project</label>
                    <div className="relative">
                      <input
                        value={importProjectName}
                        onChange={e => {
                          const nextValue = e.target.value;
                          setImportProjectName(nextValue);
                          setImportProjectPickerOpen(true);
                        }}
                        onFocus={() => setImportProjectPickerOpen(true)}
                        onBlur={() => setTimeout(() => setImportProjectPickerOpen(false), 120)}
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none"
                        placeholder="Project name (new or existing)"
                        autoComplete="off"
                      />
                      {importProjectPickerOpen && vaultFolders.length > 0 && (
                        <div className="absolute z-50 mt-1 w-full max-h-56 overflow-auto rounded-lg border border-zinc-800 bg-zinc-950 shadow-xl">
                          {vaultFolders
                            .filter(folder => folder.name.toLowerCase().includes(importProjectName.trim().toLowerCase()))
                            .map(folder => (
                              <button
                                type="button"
                                key={folder.id}
                                onMouseDown={() => {
                                  setImportProjectName(folder.name);
                                  setImportProjectPickerOpen(false);
                                }}
                                className="w-full px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-900"
                              >
                                {folder.name}
                              </button>
                            ))}
                          {vaultFolders.filter(folder => folder.name.toLowerCase().includes(importProjectName.trim().toLowerCase())).length === 0 && (
                            <div className="px-3 py-2 text-xs text-zinc-500">No matches</div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-xs text-zinc-500 uppercase tracking-widest">Files</label>
                    <label className="flex items-center justify-between gap-3 px-3 py-2 border border-dashed border-zinc-700 rounded-lg text-sm text-zinc-400 hover:border-zinc-500 cursor-pointer">
                      <span>{importFiles.length ? `${importFiles.length} file(s) selected` : 'Choose files'}</span>
                      <input
                        type="file"
                        multiple
                        onChange={e => setImportFiles(Array.from(e.target.files ?? []))}
                        className="hidden"
                      />
                    </label>
                    {importFiles.length > 0 && (
                      <div className="text-[11px] text-zinc-500">
                        {importFiles.slice(0, 3).map(file => file.name).join(', ')}
                        {importFiles.length > 3 ? ` +${importFiles.length - 3} more` : ''}
                      </div>
                    )}
                  </div>

                  {importError && <div className="text-xs text-red-400">{importError}</div>}

                  <button
                    onClick={performImport}
                    disabled={importSubmitting}
                    className="w-full px-4 py-2 bg-lime-500 text-zinc-950 rounded-lg text-xs font-semibold hover:bg-lime-400 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {importSubmitting ? 'Importing...' : 'Import'}
                  </button>
                </div>
              </div>
            )}
          </AnimatePresence>

          {confirmState.open && (
            <div className="fixed inset-0 z-[65] flex items-center justify-center bg-zinc-950/70 backdrop-blur-sm">
              <div className="absolute inset-0" onClick={() => setConfirmState(prev => ({ ...prev, open: false }))} />
              <div className="relative w-[min(520px,92vw)] bg-zinc-900/95 border border-zinc-800 rounded-2xl p-6 flex flex-col gap-4 shadow-2xl">
                <div>
                  <div className="text-lg font-semibold text-zinc-100 mt-2">{confirmState.title}</div>
                  {confirmState.description && (
                    <div className="text-sm text-zinc-500 mt-2">{confirmState.description}</div>
                  )}
                </div>
                <div className="flex items-center justify-end gap-3">
                  <button
                    onClick={() => setConfirmState(prev => ({ ...prev, open: false }))}
                    className="px-4 py-2 text-xs font-semibold border border-zinc-800 rounded-lg text-zinc-400 hover:text-zinc-100 hover:border-zinc-700"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={async () => {
                      const action = confirmActionRef.current;
                      confirmActionRef.current = null;
                      setConfirmState(prev => ({ ...prev, open: false }));
                      try {
                        await Promise.resolve(action?.());
                      } catch (error) {
                        const message = error instanceof Error ? error.message : 'Action failed';
                        showToast(message, 'error');
                      }
                    }}
                    className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors ${
                      confirmState.variant === 'danger'
                        ? 'bg-red-500 text-zinc-950 hover:bg-red-400'
                        : 'bg-lime-500 text-zinc-950 hover:bg-lime-400'
                    }`}
                  >
                    {confirmState.confirmLabel ?? 'Confirm'}
                  </button>
                </div>
              </div>
            </div>
          )}

            {showRunPipeline && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/70 backdrop-blur-sm">
                <div className="absolute inset-0" onClick={() => {
                  setShowRunPipeline(false);
                  setShowRenderStudio(false);
                }} />
              <div className="relative w-[min(700px,92vw)] max-h-[85vh] bg-zinc-900/95 border border-zinc-800 rounded-2xl p-4 flex flex-col gap-4 shadow-2xl overflow-y-auto">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs text-zinc-500 uppercase tracking-widest">Run Pipeline</div>
                    <div className="text-sm font-semibold text-zinc-100">
                      {runPipelineHasDownload ? (downloadProjectName || 'New Project') : (runPipelineProject?.name ?? 'Project')}
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setShowRunPipeline(false);
                      setShowRenderStudio(false);
                    }}
                    className="px-2.5 py-1.5 text-xs font-semibold border border-zinc-800 rounded-lg text-zinc-400 hover:text-zinc-100 hover:border-zinc-700"
                  >
                    Close
                  </button>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-zinc-500 uppercase tracking-widest">
                    {runPipelineHasDownload ? 'Project' : 'Project'}
                  </label>
                  {runPipelineHasDownload ? (
                    <div className="flex flex-col gap-2">
                      <div className="relative">
                        <input
                          value={downloadProjectName}
                          onChange={e => {
                            const nextValue = e.target.value;
                            setDownloadProjectName(nextValue);
                            setDownloadProjectPickerOpen(true);
                            const match = vaultFolders.find(folder => folder.name.toLowerCase() === nextValue.trim().toLowerCase());
                            if (match) {
                              setRunPipelineProjectId(match.id);
                            }
                          }}
                          onFocus={() => setDownloadProjectPickerOpen(true)}
                          onBlur={() => setTimeout(() => setDownloadProjectPickerOpen(false), 120)}
                          className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-sm text-zinc-200 focus:outline-none"
                          placeholder="Project name (new or existing)"
                          autoComplete="off"
                        />
                        {downloadProjectPickerOpen && vaultFolders.length > 0 && (
                          <div className="absolute z-50 mt-1 w-full max-h-56 overflow-auto rounded-lg border border-zinc-800 bg-zinc-950 shadow-xl">
                            {vaultFolders
                              .filter(folder => folder.name.toLowerCase().includes(downloadProjectName.trim().toLowerCase()))
                              .map(folder => (
                                <button
                                  type="button"
                                  key={folder.id}
                                  onMouseDown={() => {
                                    setDownloadProjectName(folder.name);
                                    setRunPipelineProjectId(folder.id);
                                    setDownloadProjectPickerOpen(false);
                                  }}
                                  className="w-full px-2.5 py-1.5 text-left text-sm text-zinc-200 hover:bg-zinc-900"
                                >
                                  {folder.name}
                                </button>
                              ))}
                            {vaultFolders.filter(folder => folder.name.toLowerCase().includes(downloadProjectName.trim().toLowerCase())).length === 0 && (
                              <div className="px-2.5 py-1.5 text-xs text-zinc-500">No matches</div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <select
                      value={runPipelineProject?.id ?? ''}
                      onChange={e => setRunPipelineProjectId(e.target.value || null)}
                      disabled={runPipelineProjectLocked}
                      className="bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-sm text-zinc-200 focus:outline-none disabled:opacity-60"
                    >
                      <option value="" disabled>Select a project</option>
                      {vaultFolders.map(folder => (
                        <option key={folder.id} value={folder.id}>{folder.name}</option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-zinc-500 uppercase tracking-widest">Pipeline</label>
                  <select
                    value={runPipelineId ?? ''}
                    onChange={e => setRunPipelineId(e.target.value || null)}
                    disabled={pipelineLibrary.length === 0}
                    className="bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-sm text-zinc-200 focus:outline-none"
                  >
                    {pipelineLibrary.length === 0 && (
                      <option value="">No pipelines saved</option>
                    )}
                    {pipelineLibrary.map(pipe => (
                      <option key={pipe.id} value={pipe.id}>{pipe.name}</option>
                    ))}
                  </select>
                </div>

                <div className="border border-zinc-800 rounded-xl p-3 bg-zinc-900/70">
                    <div className="text-[11px] text-zinc-500 uppercase tracking-widest mb-2">
                      {runPipelineHasDownload
                        ? 'Inputs (URL)'
                        : runPipelineHasRender
                          ? 'Inputs (Files)'
                          : runPipelineHasTts
                            ? 'Inputs (Subtitle)'
                            : 'Inputs (Video/Audio)'}
                    </div>
                    {runPipelineLoading ? (
                      <div className="text-xs text-zinc-500">Loading...</div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {runPipelineHasDownload ? (
                          <div className="flex flex-col gap-2">
                            <div className="grid grid-cols-2 gap-2">
                              <input
                                value={downloadUrl}
                                onChange={e => setDownloadUrl(e.target.value)}
                                className="col-span-2 bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-sm text-zinc-200 focus:outline-none"
                                placeholder="https://..."
                              />
                            </div>
                            {downloadAnalyzeError && (
                              <div className="text-[11px] text-red-400">{downloadAnalyzeError}</div>
                            )}
                            {downloadAnalyzeResult && (
                              <div className="mt-1 border border-zinc-800 rounded-lg p-2.5 bg-zinc-900/70">
                                <div className="text-[11px] text-zinc-500 uppercase tracking-widest">Analyze Result</div>
                                <div className="text-xs text-zinc-200 mt-2">
                                  {downloadAnalyzeData?.title ? (
                                    <div className="font-semibold text-zinc-100">{downloadAnalyzeData.title}</div>
                                  ) : (
                                    <div className="text-zinc-500">No title</div>
                                  )}
                                  {downloadAnalyzeData?.webpage_url && (
                                    <div className="text-[11px] text-zinc-500 mt-1">{downloadAnalyzeData.webpage_url}</div>
                                  )}
                                </div>
                                <div className="grid gap-1.5 mt-2 text-[11px] text-zinc-400">
                                  <div>Video formats: {downloadAnalyzeVideoFormats.length}</div>
                                  <div>Audio formats: {downloadAnalyzeAudioFormats.length}</div>
                                  <div>Subtitle languages: {downloadAnalyzeSubtitleCount}</div>
                                </div>
                                {bestSingleFormat && (
                                  <div className="mt-2 text-[11px] text-zinc-300">
                                    <div className="font-semibold text-zinc-200 mb-1">Best Format</div>
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="font-mono text-zinc-400">{bestSingleFormat.format_id}</span>
                                      <span>{bestSingleFormat.ext ?? 'unknown'}</span>
                                      <span>
                                        {bestSingleFormat.resolution ?? (bestSingleFormat.height ? `${bestSingleFormat.height}p` : bestSingleFormat.vcodec === 'none' ? 'audio' : 'video')}
                                      </span>
                                      <span>
                                        {bestSingleFormat.vcodec !== 'none' ? (bestSingleFormat.vcodec ?? 'vcodec') : (bestSingleFormat.acodec ?? 'acodec')}
                                      </span>
                                    </div>
                                  </div>
                                )}
                                {downloadAnalyzeListSubs.length > 0 && (
                                  <div className="mt-2 text-[11px] text-zinc-300">
                                    <div className="font-semibold text-zinc-200 mb-1">Subtitles</div>
                                    <div className="max-h-32 overflow-y-auto space-y-1">
                                      {downloadAnalyzeListSubs.map((entry: any) => (
                                        <div key={entry.lang} className="flex items-center justify-between gap-2">
                                          <span className="font-mono text-zinc-400">{entry.lang}</span>
                                          <span className="text-zinc-500">
                                            {Array.isArray(entry.formats) ? entry.formats.join(', ') : '--'}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {downloadAnalyzeWarnings.length > 0 ? null : null}
                              </div>
                            )}
                          </div>
                        ) : runPipelineHasRender ? (
                          <div className="flex flex-col gap-2">
                            <select
                              multiple
                              value={renderInputFileIds}
                              onChange={e => {
                                const selected = Array.from(e.target.selectedOptions).map(option => option.value);
                                setRenderInputFileIds(selected);
                                const selectedFiles = runPipelineProject?.files.filter(file => selected.includes(file.id)) ?? [];
                                const firstVideo = selectedFiles.find(file => file.type === 'video');
                                const firstAudio = selectedFiles.find(file => file.type === 'audio');
                                const firstSubtitle = selectedFiles.find(file => file.type === 'subtitle');
                                setRenderVideoId(firstVideo?.id ?? null);
                                setRenderAudioId(firstAudio?.id ?? null);
                                setRenderSubtitleId(firstSubtitle?.id ?? null);
                              }}
                              className="min-h-[140px] bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-sm text-zinc-200 focus:outline-none"
                            >
                              {runPipelineProject?.files
                                .filter(file => file.type === 'video' || file.type === 'audio' || file.type === 'subtitle' || file.type === 'image')
                                .map(file => (
                                  <option
                                    key={file.id}
                                    value={file.id}
                                    title={file.name}
                                  >
                                    [{file.type}] {truncateLabel(file.name, 52)}
                                  </option>
                                ))}
                            </select>
                            <div className="text-[10px] text-zinc-500">
                              Select multiple files (Ctrl/Cmd + click).
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="flex flex-col gap-1.5">
                              <select
                                value={runPipelineInputId ?? ''}
                                onChange={e => setRunPipelineInputId(e.target.value || null)}
                                className="bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-sm text-zinc-200 focus:outline-none"
                              >
                                {runPipelineProject?.files
                                  .filter(file => (runPipelineHasTts ? file.type === 'subtitle' : file.type === 'video' || file.type === 'audio'))
                                  .map(file => (
                                    <option
                                      key={file.id}
                                      value={file.id}
                                      title={`${file.origin === 'tts' ? '(TTS)' : file.origin === 'vr' ? '(VR)' : '(Source)'} ${file.name}`}
                                    >
                                      {file.origin === 'tts' ? '(TTS)' : file.origin === 'vr' ? '(VR)' : '(Source)'} {truncateLabel(file.name, 52)}
                                    </option>
                                  ))}
                              </select>
                            </div>
                            {!runPipelineGraph?.nodes && pipelineLibrary.length === 0 && (
                              <div className="text-[11px] text-zinc-500">No saved pipeline yet.</div>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>

                {runPipelineHasDownload && (
                  <div className="border border-zinc-800 rounded-xl p-3 bg-zinc-900/70">
                    <div className="text-[11px] text-zinc-500 uppercase tracking-widest mb-2">Block Config: Download</div>
                    {hasParamPresets('download') ? (
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                          <label className="text-[11px] text-zinc-500 uppercase tracking-widest">Param Source</label>
                          {runPipelineParamPreset.download !== 'custom' && null}
                        </div>
                        <select
                          value={runPipelineParamPreset.download ?? 'custom'}
                          onChange={e => handleParamPresetChange('download', e.target.value)}
                          className="bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-sm text-zinc-200 focus:outline-none"
                        >
                          <option value="custom">Manual</option>
                          {getParamPresetsForType('download').map(preset => (
                            <option key={preset.id} value={`preset:${preset.id}`}>{preset.label || 'Untitled preset'}</option>
                          ))}
                        </select>
                        {runPipelineParamPreset.download !== 'custom' && (
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={() => switchPresetToManual('download')}
                            onKeyDown={e => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                switchPresetToManual('download');
                              }
                            }}
                            title="Switch to manual and load these params"
                            className="border border-zinc-800 rounded-lg p-2.5 bg-zinc-950/40 cursor-pointer hover:border-lime-500/40 transition-colors"
                          >
                            <div className="mt-2 grid gap-1 text-[11px] text-zinc-400">
                              {Object.entries(getSelectedParamPresetParams('download')).map(([key, value]) => (
                                <div key={key} className="flex items-center justify-between gap-2">
                                  <span className="font-mono text-zinc-500">{key}</span>
                                  <span className="truncate text-zinc-300">{formatDefaultValue(value)}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-[11px] text-zinc-500">No param presets for Download.</div>
                    )}
                    {runPipelineParamPreset.download === 'custom' && (
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <select
                          value={downloadMode}
                          onChange={e => setDownloadMode(e.target.value as 'all' | 'subs' | 'media')}
                          className="bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-sm text-zinc-200 focus:outline-none"
                        >
                          <option value="all">Download: All (subs + audio + video)</option>
                          <option value="subs">Download: Subtitles only</option>
                          <option value="media">Download: Audio + Video only</option>
                        </select>
                        <label className="flex items-center justify-between gap-3 px-2.5 py-1.5 border border-dashed border-zinc-700 rounded-lg text-sm text-zinc-400 hover:border-zinc-500 cursor-pointer">
                          <span>{downloadCookiesFile?.name ?? 'cookies.txt (optional)'}</span>
                          <input
                            type="file"
                            accept=".txt"
                            onChange={e => setDownloadCookiesFile(e.target.files?.[0] ?? null)}
                            className="hidden"
                          />
                        </label>
                        <label className="flex items-center gap-2 px-2.5 py-1.5 border border-zinc-800 rounded-lg text-xs text-zinc-300">
                          <input
                            type="checkbox"
                            checked={downloadNoPlaylist}
                            onChange={e => setDownloadNoPlaylist(e.target.checked)}
                            className="accent-lime-400"
                          />
                          No playlist
                        </label>
                        {downloadMode !== 'media' ? (
                          <>
                            <input
                              value={downloadSubtitleLang}
                              onChange={e => setDownloadSubtitleLang(e.target.value)}
                              list="ytdlp-sub-langs"
                              className="bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-sm text-zinc-200 focus:outline-none"
                              placeholder="Subtitle language (e.g. ai-zh)"
                              title="Leave blank to skip subtitles. Use comma-separated codes (e.g. en,vi,ai-zh)."
                            />
                            {downloadAnalyzeListSubs.length > 0 && (
                              <datalist id="ytdlp-sub-langs">
                                {downloadAnalyzeListSubs.map((entry: any) => (
                                  <option key={entry.lang} value={entry.lang} />
                                ))}
                              </datalist>
                            )}
                          </>
                        ) : (
                          <div className="border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-500">
                            Subtitles disabled for media-only.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {runPipelineHasUvr && (
                  <div className="border border-zinc-800 rounded-xl p-3 bg-zinc-900/70">
                    <div className="text-[11px] text-zinc-500 uppercase tracking-widest mb-2">Block Config: VR (UVR)</div>
                    {hasParamPresets('uvr') && (
                      <div className="mb-3 flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                          <label className="text-[11px] text-zinc-500 uppercase tracking-widest">Param Source</label>
                          {runPipelineParamPreset.uvr !== 'custom' && null}
                        </div>
                        <select
                          value={runPipelineParamPreset.uvr ?? 'custom'}
                          onChange={e => handleParamPresetChange('uvr', e.target.value)}
                          className="bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-sm text-zinc-200 focus:outline-none"
                        >
                          <option value="custom">Manual</option>
                          {getParamPresetsForType('uvr').map(preset => (
                            <option key={preset.id} value={`preset:${preset.id}`}>{preset.label || 'Untitled preset'}</option>
                          ))}
                        </select>
                        {runPipelineParamPreset.uvr !== 'custom' && (
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={() => switchPresetToManual('uvr')}
                            onKeyDown={e => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                switchPresetToManual('uvr');
                              }
                            }}
                            title="Switch to manual and load these params"
                            className="border border-zinc-800 rounded-lg p-2.5 bg-zinc-950/40 cursor-pointer hover:border-lime-500/40 transition-colors"
                          >
                            <div className="mt-2 grid gap-1 text-[11px] text-zinc-400">
                              {Object.entries(getSelectedParamPresetParams('uvr')).map(([key, value]) => (
                                <div key={key} className="flex items-center justify-between gap-2">
                                  <span className="font-mono text-zinc-500">{key}</span>
                                  <span className="truncate text-zinc-300">{formatDefaultValue(value)}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    {runPipelineParamPreset.uvr === 'custom' && (
                      <div className="grid gap-3 md:grid-cols-2">
                      <div className="flex flex-col gap-2">
                        <label className="text-[11px] text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                          Backend
                          {isParamOverridden('uvr', 'backend', runPipelineBackend) && (
                            <span className="text-[9px] text-amber-300 bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.5 rounded-md">
                              Overridden
                            </span>
                          )}
                        </label>
                        <input
                          list="uvr-backends"
                          value={runPipelineBackend}
                          onChange={e => setRunPipelineBackend(e.target.value)}
                          className={`bg-zinc-900 border rounded-lg px-2.5 py-1.5 text-sm text-zinc-200 focus:outline-none ${
                            isParamOverridden('uvr', 'backend', runPipelineBackend) ? 'border-amber-500/60' : 'border-zinc-800'
                          }`}
                          placeholder="vr"
                        />
                        {runPipelineParamPreset.uvr !== 'custom' && getSelectedParamPresetParams('uvr').backend !== undefined && (
                          <div className="text-[10px] text-zinc-500">
                            Loaded: {formatDefaultValue(getSelectedParamPresetParams('uvr').backend)}
                          </div>
                        )}
                        <datalist id="uvr-backends">
                          <option value="vr" />
                          <option value="mdx" />
                          <option value="demucs" />
                        </datalist>
                      </div>
                      <div className="flex flex-col gap-2">
                        <label className="text-[11px] text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                          Model
                          {isParamOverridden('uvr', 'model', vrModel) && (
                            <span className="text-[9px] text-amber-300 bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.5 rounded-md">
                              Overridden
                            </span>
                          )}
                        </label>
                        {vrModels.length ? (
                          <select
                            value={vrModel}
                            onChange={e => setVrModel(e.target.value)}
                            className={`bg-zinc-900 border rounded-lg px-2.5 py-1.5 text-sm text-zinc-200 focus:outline-none ${
                              isParamOverridden('uvr', 'model', vrModel) ? 'border-amber-500/60' : 'border-zinc-800'
                            }`}
                          >
                            {vrModels.map(model => (
                              <option key={model} value={model}>{model}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            value={vrModel}
                            onChange={e => setVrModel(e.target.value)}
                            className={`bg-zinc-900 border rounded-lg px-2.5 py-1.5 text-sm text-zinc-200 focus:outline-none ${
                              isParamOverridden('uvr', 'model', vrModel) ? 'border-amber-500/60' : 'border-zinc-800'
                            }`}
                            placeholder="MGM_MAIN_v4.pth"
                          />
                        )}
                        {runPipelineParamPreset.uvr !== 'custom' && getSelectedParamPresetParams('uvr').model !== undefined && (
                          <div className="text-[10px] text-zinc-500">
                            Loaded: {formatDefaultValue(getSelectedParamPresetParams('uvr').model)}
                          </div>
                        )}
                      </div>
                    </div>
                    )}
                  </div>
                )}

                {runPipelineHasTts && (
                  <div className="border border-zinc-800 rounded-xl p-3 bg-zinc-900/70">
                    <div className="text-[11px] text-zinc-500 uppercase tracking-widest mb-2">Block Config: TTS</div>
                    {hasParamPresets('tts') && (
                      <div className="mb-3 flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                          <label className="text-[11px] text-zinc-500 uppercase tracking-widest">Param Source</label>
                          {runPipelineParamPreset.tts !== 'custom' && null}
                        </div>
                        <select
                          value={runPipelineParamPreset.tts ?? 'custom'}
                          onChange={e => handleParamPresetChange('tts', e.target.value)}
                          className="bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-sm text-zinc-200 focus:outline-none"
                        >
                          <option value="custom">Manual</option>
                          {getParamPresetsForType('tts').map(preset => (
                            <option key={preset.id} value={`preset:${preset.id}`}>{preset.label || 'Untitled preset'}</option>
                          ))}
                        </select>
                        {runPipelineParamPreset.tts !== 'custom' && (
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={() => switchPresetToManual('tts')}
                            onKeyDown={e => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                switchPresetToManual('tts');
                              }
                            }}
                            title="Switch to manual and load these params"
                            className="border border-zinc-800 rounded-lg p-2.5 bg-zinc-950/40 cursor-pointer hover:border-lime-500/40 transition-colors"
                          >
                            <div className="mt-2 grid gap-1 text-[11px] text-zinc-400">
                              {Object.entries(getSelectedParamPresetParams('tts')).map(([key, value]) => (
                                <div key={key} className="flex items-center justify-between gap-2">
                                  <span className="font-mono text-zinc-500">{key}</span>
                                  <span className="truncate text-zinc-300">{formatDefaultValue(value)}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    {runPipelineParamPreset.tts === 'custom' && (
                      <div className="grid gap-3 md:grid-cols-2">
                      <div className="flex flex-col gap-2">
                        <label className="text-[11px] text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                          Voice
                          {isParamOverridden('tts', 'voice', runPipelineTtsVoice) && (
                            <span className="text-[9px] text-amber-300 bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.5 rounded-md">
                              Overridden
                            </span>
                          )}
                        </label>
                        <select
                          value={runPipelineTtsVoice}
                          onChange={e => setRunPipelineTtsVoice(e.target.value)}
                          className={`bg-zinc-900 border rounded-lg px-2.5 py-1.5 text-sm text-zinc-200 focus:outline-none ${
                            isParamOverridden('tts', 'voice', runPipelineTtsVoice) ? 'border-amber-500/60' : 'border-zinc-800'
                          }`}
                        >
                          {PREFERRED_TTS_VOICES.map(name => (
                            <option key={name} value={name}>
                              {name}
                            </option>
                          ))}
                        </select>
                        {runPipelineParamPreset.tts !== 'custom' && getSelectedParamPresetParams('tts').voice !== undefined && (
                          <div className="text-[10px] text-zinc-500">
                            Loaded: {formatDefaultValue(getSelectedParamPresetParams('tts').voice)}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col gap-2">
                        <label className="text-[11px] text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                          Long Cue
                          {isParamOverridden('tts', 'overlapMode', runPipelineTtsOverlapMode) && (
                            <span className="text-[9px] text-amber-300 bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.5 rounded-md">
                              Overridden
                            </span>
                          )}
                        </label>
                        <select
                          value={runPipelineTtsOverlapMode}
                          onChange={e => setRunPipelineTtsOverlapMode(e.target.value as 'truncate' | 'overlap')}
                          className={`bg-zinc-900 border rounded-lg px-2.5 py-1.5 text-sm text-zinc-200 focus:outline-none ${
                            isParamOverridden('tts', 'overlapMode', runPipelineTtsOverlapMode) ? 'border-amber-500/60' : 'border-zinc-800'
                          }`}
                        >
                          <option value="overlap">Overlap voices</option>
                          <option value="truncate">Cut previous voice (truncate)</option>
                        </select>
                        {runPipelineParamPreset.tts !== 'custom' && getSelectedParamPresetParams('tts').overlapMode !== undefined && (
                          <div className="text-[10px] text-zinc-500">
                            Loaded: {formatDefaultValue(getSelectedParamPresetParams('tts').overlapMode)}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col gap-2">
                        <label className="text-[11px] text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                          Rate
                          {isParamOverridden('tts', 'rate', runPipelineTtsRate) && (
                            <span className="text-[9px] text-amber-300 bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.5 rounded-md">
                              Overridden
                            </span>
                          )}
                        </label>
                        <input
                          type="number"
                          step="0.1"
                          value={runPipelineTtsRate}
                          onChange={e => setRunPipelineTtsRate(e.target.value)}
                          placeholder="1.0"
                          className={`bg-zinc-900 border rounded-lg px-2.5 py-1.5 text-sm text-zinc-200 focus:outline-none ${
                            isParamOverridden('tts', 'rate', runPipelineTtsRate) ? 'border-amber-500/60' : 'border-zinc-800'
                          }`}
                        />
                        {runPipelineParamPreset.tts !== 'custom' && getSelectedParamPresetParams('tts').rate !== undefined && (
                          <div className="text-[10px] text-zinc-500">
                            Loaded: {formatDefaultValue(getSelectedParamPresetParams('tts').rate)}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col gap-2">
                        <label className="text-[11px] text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                          Pitch
                          {isParamOverridden('tts', 'pitch', runPipelineTtsPitch) && (
                            <span className="text-[9px] text-amber-300 bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.5 rounded-md">
                              Overridden
                            </span>
                          )}
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            step="0.1"
                            value={runPipelineTtsPitch}
                            onChange={e => setRunPipelineTtsPitch(e.target.value)}
                            placeholder="0"
                            className={`flex-1 bg-zinc-900 border rounded-lg px-2.5 py-1.5 text-sm text-zinc-200 focus:outline-none ${
                              isParamOverridden('tts', 'pitch', runPipelineTtsPitch) ? 'border-amber-500/60' : 'border-zinc-800'
                            }`}
                          />
                          <span className="text-xs text-zinc-500">st</span>
                        </div>
                        {runPipelineParamPreset.tts !== 'custom' && getSelectedParamPresetParams('tts').pitch !== undefined && (
                          <div className="text-[10px] text-zinc-500">
                            Loaded: {formatDefaultValue(getSelectedParamPresetParams('tts').pitch)}
                          </div>
                        )}
                      </div>
                      <label className="flex items-center gap-2 text-xs text-zinc-300">
                        <input
                          type="checkbox"
                          checked={runPipelineTtsRemoveLineBreaks}
                          onChange={e => setRunPipelineTtsRemoveLineBreaks(e.target.checked)}
                          className="accent-lime-400"
                        />
                        <span className="flex items-center gap-2">
                          Remove line breaks
                          {isParamOverridden('tts', 'removeLineBreaks', runPipelineTtsRemoveLineBreaks) && (
                            <span className="text-[9px] text-amber-300 bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.5 rounded-md">
                              Overridden
                            </span>
                          )}
                        </span>
                      </label>
                      {runPipelineParamPreset.tts !== 'custom' && getSelectedParamPresetParams('tts').removeLineBreaks !== undefined && (
                        <div className="text-[10px] text-zinc-500">
                          Loaded: {formatDefaultValue(getSelectedParamPresetParams('tts').removeLineBreaks)}
                        </div>
                      )}
                    </div>
                    )}
                  </div>
                )}

                {runPipelineHasDownload && (
                  <button
                    onClick={analyzeYtDlp}
                    disabled={downloadAnalyzeLoading || !downloadUrl.trim()}
                    className="w-full px-3 py-2 text-xs font-semibold border border-zinc-800 rounded-lg text-zinc-200 hover:border-lime-500/50 hover:text-lime-300 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {downloadAnalyzeLoading ? 'Analyzing...' : 'Analyze URL'}
                  </button>
                )}
                {runPipelineHasRender && (
                  <button
                    onClick={() => setShowRenderStudio(true)}
                    disabled={!runPipelineProject}
                    className="w-full px-3 py-2 text-xs font-semibold border border-zinc-800 rounded-lg text-zinc-200 hover:border-lime-500/50 hover:text-lime-300"
                  >
                    Preview
                  </button>
                )}
                <button
                  onClick={runPipelineJob}
                  disabled={runPipelineSubmitting}
                  className="w-full px-3 py-2 bg-lime-500 text-zinc-950 rounded-lg text-xs font-semibold hover:bg-lime-400 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {runPipelineSubmitting ? 'Queuing...' : 'Run'}
                </button>
              </div>
            </div>
          )}

          {showRenderStudio && runPipelineHasRender && (
            <Suspense
              fallback={(
                <div className="fixed inset-0 z-[60] bg-zinc-950 flex items-center justify-center">
                  <div className="text-xs text-zinc-400">Loading Render Studio...</div>
                </div>
              )}
            >
              <RenderStudioPage {...renderStudioProps} />
            </Suspense>
          )}

          {jobLogOpen && jobLogTarget && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-zinc-950/70 backdrop-blur-sm">
              <div className="absolute inset-0" onClick={() => setJobLogOpen(false)} />
              <div className="relative w-[min(820px,92vw)] max-h-[80vh] bg-zinc-900/95 border border-zinc-800 rounded-2xl p-6 flex flex-col gap-4 shadow-2xl">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs text-zinc-500 uppercase tracking-widest">System Log</div>
                    <div className="text-sm font-semibold text-zinc-100">{jobLogTarget.name}</div>
                    <div className="text-xs text-zinc-500 mt-1">{jobLogTarget.fileName}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={async () => {
                        const content = jobLogTarget.log || jobLogTarget.error || '';
                        const fallbackCopy = () => {
                          try {
                            const textarea = document.createElement('textarea');
                            textarea.value = content;
                            textarea.setAttribute('readonly', 'true');
                            textarea.style.position = 'fixed';
                            textarea.style.opacity = '0';
                            document.body.appendChild(textarea);
                            textarea.select();
                            const ok = document.execCommand('copy');
                            document.body.removeChild(textarea);
                            return ok;
                          } catch {
                            return false;
                          }
                        };
                        try {
                          if (navigator.clipboard?.writeText) {
                            await navigator.clipboard.writeText(content);
                            showToast('Log copied', 'success');
                            return;
                          }
                          const ok = fallbackCopy();
                          showToast(ok ? 'Log copied' : 'Unable to copy log', ok ? 'success' : 'error');
                        } catch {
                          const ok = fallbackCopy();
                          showToast(ok ? 'Log copied' : 'Unable to copy log', ok ? 'success' : 'error');
                        }
                      }}
                      className="px-3 py-2 text-xs font-semibold border border-zinc-800 rounded-lg text-zinc-400 hover:text-zinc-100 hover:border-zinc-700"
                    >
                      Copy
                    </button>
                    <button
                      onClick={() => setJobLogOpen(false)}
                      className="px-3 py-2 text-xs font-semibold border border-zinc-800 rounded-lg text-zinc-400 hover:text-zinc-100 hover:border-zinc-700"
                    >
                      Close
                    </button>
                  </div>
                </div>
                <div className="bg-zinc-950/60 border border-zinc-800 rounded-xl p-4 text-xs text-zinc-200 whitespace-pre-wrap overflow-y-auto">
                  {jobLogTarget.log || jobLogTarget.error || 'No log output yet.'}
                </div>
              </div>
            </div>
          )}

          {jobContextMenu.open && jobContextTarget && (
            <div className="fixed inset-0 z-[55]" onClick={() => setJobContextMenu(prev => ({ ...prev, open: false }))}>
              <div
                className="absolute rounded-lg border border-zinc-800 bg-zinc-950 shadow-2xl p-1 min-w-[160px]"
                style={{ top: jobContextMenu.y, left: jobContextMenu.x }}
                onClick={(event) => event.stopPropagation()}
              >
                {jobContextTarget.projectName?.trim() && (
                  <button
                    className="w-full px-3 py-2 text-left text-xs text-zinc-200 hover:bg-zinc-900 rounded-md"
                    onClick={() => {
                      const projectName = jobContextTarget.projectName?.trim();
                      const match = projectName
                        ? vaultFolders.find(folder => folder.name.toLowerCase() === projectName.toLowerCase())
                        : undefined;
                      if (!projectName || !match) {
                        showToast('Project not found in Media Vault', 'warning');
                        setJobContextMenu(prev => ({ ...prev, open: false }));
                        return;
                      }
                      setVaultFolderId(match.id);
                      setVaultFileId(match.files[0]?.id ?? null);
                      setShowFolderPanel(true);
                      setJobContextMenu(prev => ({ ...prev, open: false }));
                    }}
                  >
                    Open project
                  </button>
                )}
                <button
                  className="w-full px-3 py-2 text-left text-xs text-zinc-200 hover:bg-zinc-900 rounded-md"
                  onClick={() => {
                    setJobContextMenu(prev => ({ ...prev, open: false }));
                    openRunPipelineFromJob(jobContextTarget);
                  }}
                >
                  Run again
                </button>
                <button
                  className="w-full px-3 py-2 text-left text-xs text-zinc-200 hover:bg-zinc-900 rounded-md"
                  onClick={() => {
                    setJobLogJobId(jobContextTarget.id);
                    setJobLogOpen(true);
                    setJobContextMenu(prev => ({ ...prev, open: false }));
                  }}
                >
                  View log
                </button>
                {(jobContextTarget.status === 'queued' || jobContextTarget.status === 'processing') ? (
                  <button
                    className="w-full px-3 py-2 text-left text-xs text-amber-300 hover:bg-amber-500/10 rounded-md"
                    onClick={() => {
                      setJobContextMenu(prev => ({ ...prev, open: false }));
                      cancelJob(jobContextTarget.id);
                    }}
                  >
                    Cancel job
                  </button>
                ) : (
                  <button
                    className="w-full px-3 py-2 text-left text-xs text-red-400 hover:bg-red-500/10 rounded-md"
                    onClick={() => {
                      setJobContextMenu(prev => ({ ...prev, open: false }));
                      deleteJob(jobContextTarget.id);
                    }}
                  >
                    Delete job
                  </button>
                )}
              </div>
            </div>
          )}

          {pipelineContextMenu.open && pipelineContextTarget && (
            <div className="fixed inset-0 z-[55]" onClick={() => setPipelineContextMenu(prev => ({ ...prev, open: false }))}>
              <div
                className="absolute rounded-lg border border-zinc-800 bg-zinc-950 shadow-2xl p-1 min-w-[160px]"
                style={{ top: pipelineContextMenu.y, left: pipelineContextMenu.x }}
                onClick={(event) => event.stopPropagation()}
              >
                <button
                  className="w-full px-3 py-2 text-left text-xs text-zinc-200 hover:bg-zinc-900 rounded-md"
                  onClick={() => {
                    setPipelineContextMenu(prev => ({ ...prev, open: false }));
                    if (pipelineContextTarget.kind === 'task') {
                      openPipelinePreview(pipelineContextTarget);
                    } else {
                      openPipelineEditor(pipelineContextTarget);
                    }
                  }}
                >
                  Open
                </button>
                {pipelineContextTarget.kind === 'saved' && (
                  <button
                    className="w-full px-3 py-2 text-left text-xs text-red-400 hover:bg-red-500/10 rounded-md"
                    onClick={() => {
                      setPipelineContextMenu(prev => ({ ...prev, open: false }));
                      deletePipeline(pipelineContextTarget.id);
                    }}
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          )}

          {paramPresetContextMenu.open && paramPresetContextTarget && (
            <div className="fixed inset-0 z-[55]" onClick={() => setParamPresetContextMenu(prev => ({ ...prev, open: false }))}>
              <div
                className="absolute rounded-lg border border-zinc-800 bg-zinc-950 shadow-2xl p-1 min-w-[160px]"
                style={{ top: paramPresetContextMenu.y, left: paramPresetContextMenu.x }}
                onClick={(event) => event.stopPropagation()}
              >
                <button
                  className="w-full px-3 py-2 text-left text-xs text-zinc-200 hover:bg-zinc-900 rounded-md"
                  onClick={() => {
                    setParamPresetContextMenu(prev => ({ ...prev, open: false }));
                    openParamPresetEditorForEdit(paramPresetContextTarget.id);
                  }}
                >
                  Edit
                </button>
                <button
                  className="w-full px-3 py-2 text-left text-xs text-red-400 hover:bg-red-500/10 rounded-md"
                  onClick={() => {
                    setParamPresetContextMenu(prev => ({ ...prev, open: false }));
                    openConfirm({
                      title: `Delete ${paramPresetContextTarget.label}?`,
                      description: 'This will remove saved preset params for this preset.',
                      confirmLabel: 'Delete',
                      variant: 'danger'
                    }, () => {
                      deleteParamPreset(paramPresetContextTarget.id, paramPresetContextTarget.type);
                    });
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          )}

          {fileContextMenu.open && fileContextMenu.file && (
            <div className="fixed inset-0 z-[55]" onClick={closeFileContextMenu}>
              <div
                className="absolute rounded-lg border border-zinc-800 bg-zinc-950 shadow-2xl p-1 min-w-[160px]"
                style={{ top: fileContextMenu.y, left: fileContextMenu.x }}
                onClick={(event) => event.stopPropagation()}
              >
                <button
                  className="w-full px-3 py-2 text-left text-xs text-zinc-200 hover:bg-zinc-900 rounded-md"
                  onClick={() => {
                    if (fileContextMenu.file) {
                      downloadVaultFile(fileContextMenu.file);
                    }
                    closeFileContextMenu();
                  }}
                >
                  <span className="flex items-center gap-2">
                    <Download size={12} />
                    Download
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
