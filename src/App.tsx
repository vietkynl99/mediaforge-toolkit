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
  Save,
  LogOut,
  X
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
  /** 0 = hard edge; 1–10 softer transition toward full blur at center. */
  feather: number;
};

const num = (v: unknown, fb: number) => coerceNumber(v as string | number | null | undefined, fb) ?? fb;

/** Same ref keys as `buildRenderConfigV2` inputsMap (video, audio, subtitle, image, image2, …). */
const computePlaceholderKeyByFileId = (
  files: Array<{ id: string; type: string }>,
  renderInputFileIds: string[]
): Record<string, string> => {
  const selected = files.filter(file => renderInputFileIds.includes(file.id));
  const counts: Record<'video' | 'audio' | 'subtitle' | 'image', number> = {
    video: 0,
    audio: 0,
    subtitle: 0,
    image: 0
  };
  const fileIdToKey: Record<string, string> = {};
  selected.forEach(file => {
    if (file.type !== 'video' && file.type !== 'audio' && file.type !== 'subtitle' && file.type !== 'image') return;
    const t = file.type as 'video' | 'audio' | 'subtitle' | 'image';
    counts[t] += 1;
    const key = counts[t] === 1 ? file.type : `${file.type}${counts[t]}`;
    fileIdToKey[file.id] = key;
  });
  return fileIdToKey;
};

type RenderSubtitleAssState = {
  fontName: string;
  fontSize: string;
  primaryColor: string;
  outlineColor: string;
  opacity: string;
  textOpacity: string;
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
  positionMode: string;
  positionX: string;
  positionY: string;
  textAutoMoveEnabled?: string;
  textAutoMoveInterval?: string;
  textAutoMovePositions?: string;
  singleText?: string;
  singleTextStart?: string;
  singleTextEnd?: string;
  singleTextMatchDuration?: string;
};

type RenderConfigV2 = {
  version: '2';
  timeline: {
    resolution: string;
    framerate: number;
    duration?: number;
    backgroundColor?: string;
    /** Display names keyed by placeholder ref (inputsMap keys) plus `text` for the text overlay track. */
    trackLabels?: Record<string, string>;
    imageMatchDuration?: boolean;
  };
  renderOptions?: {
    codec?: 'h264' | 'h265';
    preset?: string;
    crf?: number;
    gop?: number;
    tune?: string;
  };
  inputsMap: Record<string, string>;
  items: Array<{
    id: string;
    type: 'video' | 'audio' | 'image' | 'subtitle' | 'text';
    source: { ref?: string; path?: string };
    timeline?: { start?: number; duration?: number; trimStart?: number; trimEnd?: number };
    layer?: number;
    mask?: { type: 'rect' | 'circle'; x: number; y: number; w: number; h: number };
    text?: { value: string; start?: number; end?: number; matchDuration?: string };
    transform?: {
      x?: number;
      y?: number;
      scale?: number;
      rotation?: number;
      opacity?: number;
      fit?: 'contain' | 'cover' | 'stretch';
      crop?: { x: number; y: number; w: number; h: number };
    };
    audioMix?: {
      gainDb?: number;
      mute?: boolean;
      fadeIn?: number;
      fadeOut?: number;
      delay?: number;
      group?: string;
    };
    subtitleStyle?: Record<string, unknown>;
    effects?: Array<{ type: string; params?: Record<string, unknown> }>;
  }>;
  effects?: Array<{ type: string; params?: Record<string, unknown> }>;
};

type RenderTemplate = {
  id: string;
  name: string;
  updatedAt: string;
  config: RenderConfigV2;
};

type AuthUser = {
  id: number | null;
  username: string;
  createdAt: string;
};

type TaskTemplate = {
  id: string;
  name: string;
  taskType: string;
  updatedAt: string;
  params: Record<string, any>;
};

type NewJobPopupDraft = {
  version: 1;
  projectId?: string | null;
  projectName?: string | null;
  pipelineId?: string | null;
  runPipelineRenderTemplateId?: string | null;
  runPipelineTaskTemplate?: Record<string, string>;
  runPipelineInputId?: string | null;
  renderInputFileIds?: string[];
  renderTemplateApplyMap?: Record<string, string>;
  renderTemplateApplyMapById?: Record<string, Record<string, string>>;
};

/** ASS / libass V4+ style fields used for temp .ass burn (see server/subtitleAss.ts). */
const DEFAULT_RENDER_SUBTITLE_ASS: RenderSubtitleAssState = {
  fontName: 'Arial',
  fontSize: '48',
  primaryColor: '#ffffff',
  outlineColor: '#000000',
  opacity: '100',
  textOpacity: '100',
  bold: '0',
  italic: '0',
  spacing: '0',
  outline: '2',
  shadow: '2',
  alignment: '2',
  marginL: '30',
  marginR: '30',
  marginV: '36',
  wrapStyle: '0',
  positionMode: 'anchor',
  positionX: '50',
  positionY: '50',
  textAutoMoveEnabled: '0',
  textAutoMoveInterval: '0',
  textAutoMovePositions: '',
  singleText: '',
  singleTextStart: '0',
  singleTextEnd: '',
  singleTextMatchDuration: '0'
};

const BASE_SUBTITLE_STYLE: RenderSubtitleAssState = {
  fontName: DEFAULT_RENDER_SUBTITLE_ASS.fontName,
  fontSize: DEFAULT_RENDER_SUBTITLE_ASS.fontSize,
  primaryColor: DEFAULT_RENDER_SUBTITLE_ASS.primaryColor,
  outlineColor: DEFAULT_RENDER_SUBTITLE_ASS.outlineColor,
  opacity: DEFAULT_RENDER_SUBTITLE_ASS.opacity,
  textOpacity: DEFAULT_RENDER_SUBTITLE_ASS.textOpacity,
  bold: DEFAULT_RENDER_SUBTITLE_ASS.bold,
  italic: DEFAULT_RENDER_SUBTITLE_ASS.italic,
  spacing: DEFAULT_RENDER_SUBTITLE_ASS.spacing,
  outline: DEFAULT_RENDER_SUBTITLE_ASS.outline,
  shadow: DEFAULT_RENDER_SUBTITLE_ASS.shadow,
  alignment: DEFAULT_RENDER_SUBTITLE_ASS.alignment,
  marginL: DEFAULT_RENDER_SUBTITLE_ASS.marginL,
  marginR: DEFAULT_RENDER_SUBTITLE_ASS.marginR,
  marginV: DEFAULT_RENDER_SUBTITLE_ASS.marginV,
  wrapStyle: DEFAULT_RENDER_SUBTITLE_ASS.wrapStyle,
  positionMode: DEFAULT_RENDER_SUBTITLE_ASS.positionMode,
  positionX: DEFAULT_RENDER_SUBTITLE_ASS.positionX,
  positionY: DEFAULT_RENDER_SUBTITLE_ASS.positionY,
  textAutoMoveEnabled: DEFAULT_RENDER_SUBTITLE_ASS.textAutoMoveEnabled,
  textAutoMoveInterval: DEFAULT_RENDER_SUBTITLE_ASS.textAutoMoveInterval,
  textAutoMovePositions: DEFAULT_RENDER_SUBTITLE_ASS.textAutoMovePositions
};

const RENDER_TEXT_PARAM_FIELDS = new Set([
  'singleText',
  'singleTextStart',
  'singleTextEnd',
  'singleTextMatchDuration',
  'textOpacity',
  'textAutoMoveEnabled',
  'textAutoMoveInterval',
  'textAutoMovePositions'
]);

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

const SHOW_PARAM_PRESETS = false;
const NEW_JOB_POPUP_DRAFT_STORAGE_KEY = 'mediaforge.newJobPopupDraft.v1';

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

const normalizeItemEffects = (effects: Array<{ type: string; params?: Record<string, unknown> }> | undefined) => {
  if (!Array.isArray(effects) || effects.length === 0) return undefined;
  const flattened = effects.map(effect => ({
    type: effect.type,
    ...(effect.params ?? {})
  }));
  return normalizeLoadedRenderEffects(flattened);
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
  nowMs: number;
  hasServerNow: boolean;
};

function JobRow({ job, index, onContextMenu, nowMs, hasServerNow }: JobRowProps) {
  const elapsedMs = (() => {
    if (job.startedAt) {
      const start = new Date(job.startedAt).getTime();
      const end = job.finishedAt ? new Date(job.finishedAt).getTime() : nowMs;
      if (!job.finishedAt && !hasServerNow) return null;
      if (Number.isFinite(start) && Number.isFinite(end)) {
        return Math.max(0, end - start);
      }
    }
    return job.durationMs ?? null;
  })();
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
      {elapsedMs !== null ? formatDurationMs(elapsedMs) : '--'}
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
    overlapSeconds?: number;
    overlapMode?: 'overlap' | 'truncate';
    removeLineBreaks?: boolean;
    outputSignature?: string;
    outputDetails?: Record<string, {
      processedAt?: string;
      voice?: string;
      rate?: number;
      pitch?: number;
      volume?: number;
      overlapSeconds?: number;
      overlapMode?: 'overlap' | 'truncate';
      removeLineBreaks?: boolean;
      outputSignature?: string;
    }>;
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

const RENDER_BLUR_FEATHER_MAX = 10;

/** Solid black JPEG when preview cannot be loaded (matches server fallback). */
const RENDER_PREVIEW_BLACK_DATA_URL =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAgAAAQABAAD//gAQTGF2YzU4LjU0LjEwMAD/2wBDAAg+Pkk+SVVVVVVVVWRdZGhoaGRkZGRoaGhwcHCDg4NwcHBoaHBwfHyDg4+Tj4eHg4eTk5ubm7q6srLZ2eD/////xABLAAEBAAAAAAAAAAAAAAAAAAAACAEBAAAAAAAAAAAAAAAAAAAAABABAAAAAAAAAAAAAAAAAAAAABEBAAAAAAAAAAAAAAAAAAAAAP/AABEIAPABQAMBIgACEQADEQD/2gAMAwEAAhEDEQA/AJ/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB//9k=';

const RenderStudioPage = lazy(() => import('./RenderStudioPage'));

export default function App() {
  const renderStudioPath = '/render-studio';
  const buildRenderStudioUrl = (
    projectId?: string | null,
    templateId?: string | null,
    pipelineId?: string | null,
    projectName?: string | null
  ) => {
    const params = new URLSearchParams();
    if (projectName) params.set('project', projectName);
    if (projectId) params.set('projectId', projectId);
    if (templateId && templateId !== 'custom') params.set('template', templateId);
    if (pipelineId) params.set('pipeline', pipelineId);
    const query = params.toString();
    return `${renderStudioPath}${query ? `?${query}` : ''}`;
  };
  const tabPathMap: Record<string, string> = {
    dashboard: '/dashboard',
    forge: '/pipeline-forge',
    vault: '/media-vault',
    settings: '/settings',
    logs: '/logs'
  };
  const getTabFromPath = (path: string) => {
    const entry = Object.entries(tabPathMap).find(([, value]) => value === path);
    return entry?.[0] ?? 'dashboard';
  };
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window === 'undefined') return 'dashboard';
    return getTabFromPath(window.location.pathname);
  });
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authUsername, setAuthUsername] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authConfirmPassword, setAuthConfirmPassword] = useState('');
  const [registerEnabled, setRegisterEnabled] = useState<boolean | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const getAuthViewFromPath = () => {
    if (typeof window === 'undefined') return 'login';
    return window.location.pathname === '/register' ? 'register' : 'login';
  };
  const [authView, setAuthView] = useState<'login' | 'register'>(getAuthViewFromPath);
  const [searchQuery, setSearchQuery] = useState('');
  const [jobs, setJobs] = useState<MediaJob[]>([]);
  const [jobNowMs, setJobNowMs] = useState(() => Date.now());
  const jobNowBaseRef = useRef<{ serverMs: number; clientMs: number } | null>(null);
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
  const [renderStudioMediaBinContextMenu, setRenderStudioMediaBinContextMenu] = useState<{
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
  const [renderStudioTimelineContextMenu, setRenderStudioTimelineContextMenu] = useState<{
    open: boolean;
    x: number;
    y: number;
    track: { type: 'video' | 'audio' | 'subtitle' | 'image' | 'text' | 'effect'; id?: string; index?: number } | null;
  }>({
    open: false,
    x: 0,
    y: 0,
    track: null
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
  const [showRenderStudio, setShowRenderStudio] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.location.pathname === renderStudioPath;
  });
  const renderStudioReturnPathRef = useRef('/dashboard');
  const renderStudioQueryAppliedRef = useRef(false);
  const renderStudioPendingProjectIdRef = useRef<string | null>(null);
  const renderStudioPendingProjectNameRef = useRef<string | null>(null);
  const lastRenderProjectIdRef = useRef<string | null>(null);
  const [renderPresetSaveMenuOpen, setRenderPresetSaveMenuOpen] = useState(false);
  const [renderStudioLeftMenuOpen, setRenderStudioLeftMenuOpen] = useState(false);
  const [renderStudioMediaBinOpen, setRenderStudioMediaBinOpen] = useState(true);
  const [renderStudioProjectOpen, setRenderStudioProjectOpen] = useState(false);
  const [renderStudioInspectorOpen, setRenderStudioInspectorOpen] = useState<
    Record<'timeline' | 'video' | 'audio' | 'subtitle' | 'text' | 'effects' | 'image', boolean>
  >({
    timeline: false,
    video: false,
    audio: false,
    subtitle: false,
    text: false,
    effects: false,
    image: false
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
  const [renderTextTrackEnabled, setRenderTextTrackEnabled] = useState(false);
  const [renderInputFileIds, setRenderInputFileIds] = useState<string[]>([]);
  const [renderImageOrderIds, setRenderImageOrderIds] = useState<string[]>([]);
  const [renderImageDurations, setRenderImageDurations] = useState<Record<string, string>>({});
  const [renderImageMatchDuration, setRenderImageMatchDuration] = useState<Record<string, boolean>>({});
  const [renderImageTransforms, setRenderImageTransforms] = useState<Record<string, {
    x?: string;
    y?: string;
    scale?: string;
    rotation?: string;
    opacity?: string;
    fit?: 'contain' | 'cover' | 'stretch';
    cropX?: string;
    cropY?: string;
    cropW?: string;
    cropH?: string;
    maskType?: 'none' | 'rect' | 'circle';
    maskLeft?: string;
    maskRight?: string;
    maskTop?: string;
    maskBottom?: string;
    blurEffects?: RenderBlurRegionEffect[];
  }>>({});
  const [renderVideoTransforms, setRenderVideoTransforms] = useState<Record<string, {
    blurEffects?: RenderBlurRegionEffect[];
  }>>({});
  const [renderTrackLabels, setRenderTrackLabels] = useState<Record<string, string>>({});
  const [renderConfigV2Override, setRenderConfigV2Override] = useState<RenderConfigV2 | null>(null);
  const [renderTemplates, setRenderTemplates] = useState<RenderTemplate[]>([]);
  const [renderTemplateModalOpen, setRenderTemplateModalOpen] = useState(false);
  const [renderTemplateEditorOpen, setRenderTemplateEditorOpen] = useState(false);
  const [renderTemplateNameDraft, setRenderTemplateNameDraft] = useState('');
  const [renderTemplateJsonDraft, setRenderTemplateJsonDraft] = useState('');
  const [renderTemplateEditingId, setRenderTemplateEditingId] = useState<string | null>(null);
  const [renderTemplateApplyOpen, setRenderTemplateApplyOpen] = useState(false);
  const [renderTemplateApplyTarget, setRenderTemplateApplyTarget] = useState<RenderTemplate | null>(null);
  const [renderTemplateApplyMap, setRenderTemplateApplyMap] = useState<Record<string, string>>({});
  const [renderTemplateApplyMapById, setRenderTemplateApplyMapById] = useState<Record<string, Record<string, string>>>({});
  const [newJobRenderTemplateMenuOpen, setNewJobRenderTemplateMenuOpen] = useState(false);
  const newJobRenderTemplateMenuCloseRef = React.useRef<number | null>(null);
  const lastAutoTemplateApplyKeyRef = useRef<string | null>(null);
  const lastRenderConfigSyncRef = useRef<RenderConfigV2 | null>(null);
  const [runPipelineRenderTemplateId, setRunPipelineRenderTemplateId] = useState('custom');
  const [templateSaveOpen, setTemplateSaveOpen] = useState(false);
  const [templateSaveTaskType, setTemplateSaveTaskType] = useState<'render' | 'download' | 'uvr' | 'tts'>('render');
  const [templateSaveName, setTemplateSaveName] = useState('');
  const [templateSaveParams, setTemplateSaveParams] = useState<Record<string, any> | null>(null);
  const [templateSaveRenderConfig, setTemplateSaveRenderConfig] = useState<RenderConfigV2 | null>(null);
  const [templateSaveError, setTemplateSaveError] = useState<string | null>(null);
  const [taskTemplates, setTaskTemplates] = useState<TaskTemplate[]>([]);
  const [runPipelineTaskTemplate, setRunPipelineTaskTemplate] = useState<Record<string, string>>({});
  const newJobDraftLoadedRef = useRef(false);
  const newJobDraftPendingRef = useRef<NewJobPopupDraft | null>(null);
  const newJobDraftAppliedRef = useRef(false);
  const [downloadTemplateMenuOpen, setDownloadTemplateMenuOpen] = useState(false);
  const [uvrTemplateMenuOpen, setUvrTemplateMenuOpen] = useState(false);
  const [ttsTemplateMenuOpen, setTtsTemplateMenuOpen] = useState(false);
  const downloadTemplateMenuCloseRef = React.useRef<number | null>(null);
  const uvrTemplateMenuCloseRef = React.useRef<number | null>(null);
  const ttsTemplateMenuCloseRef = React.useRef<number | null>(null);
  const [renderTimelineScale, setRenderTimelineScale] = useState(1);
  const [renderPlayheadSeconds, setRenderPlayheadSeconds] = useState(0);
  const [renderPreviewUrl, setRenderPreviewUrl] = useState<string | null>(null);
  const [renderPreviewLoading, setRenderPreviewLoading] = useState(false);
  const [renderPreviewError, setRenderPreviewError] = useState<string | null>(null);
  const [renderPreviewHold, setRenderPreviewHold] = useState(false);
  const lastTemplateApplyAtRef = useRef(0);
  const [saveRenderPresetLoading, setSaveRenderPresetLoading] = useState(false);
  const [renderSubtitleCues, setRenderSubtitleCues] = useState<Array<{ start: number; end: number; text: string }>>([]);
  const [renderStudioFocus, setRenderStudioFocus] = useState<'timeline' | 'item'>('timeline');
  const [renderStudioItemType, setRenderStudioItemType] = useState<'video' | 'audio' | 'subtitle' | 'text' | 'image' | null>(null);
  const [renderStudioPreviewFileId, setRenderStudioPreviewFileId] = useState<string | null>(null);
  const [renderTimelineViewportWidth, setRenderTimelineViewportWidth] = useState(0);
  const renderTimelineScrollRef = useRef<HTMLDivElement | null>(null);
  const prevShowRenderStudioForZoomRef = useRef(false);
  const renderTimelineDragRef = useRef<{ active: boolean; startX: number; scrollLeft: number; moved: boolean }>({
    active: false,
    startX: 0,
    scrollLeft: 0,
    moved: false
  });
  const DEFAULT_RENDER_PARAMS = {
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
      scale: '100',
      rotation: '0',
      opacity: '100',
      colorLut: '',
      cropX: '0',
      cropY: '0',
      cropW: '100',
      cropH: '100',
      maskType: 'none',
      maskLeft: '0',
      maskRight: '0',
      maskTop: '0',
      maskBottom: '0',
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
    text: { ...DEFAULT_RENDER_SUBTITLE_ASS },
    render: {
      codec: 'h264',
      preset: 'fast',
      crf: '21',
      gop: '',
      tune: ''
    }
  };
  const [renderParams, setRenderParams] = useState(DEFAULT_RENDER_PARAMS);
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
  const paramPresetsLoadedRef = useRef(false);

  const TASK_PIPELINE_PREFIX = 'task:';

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
  const renderPipelineId = useMemo(() => {
    const taskId = `${TASK_PIPELINE_PREFIX}render`;
    const taskEntry = pipelineLibrary.find(item => item.id === taskId);
    if (taskEntry) return taskEntry.id;
    const saved = pipelineLibrary.find(item => item.primaryType === 'render');
    return saved?.id ?? null;
  }, [pipelineLibrary]);
  const renderSelectedInputs = runPipelineProject?.files.filter(file => renderInputFileIds.includes(file.id)) ?? [];
  const renderReady = (() => {
    if (renderConfigV2Override && runPipelineProject) {
      const mapped = Object.values(renderConfigV2Override.inputsMap).filter(Boolean);
      if (!mapped.length) return false;
      return mapped.some(path => {
        const file = runPipelineProject.files.find(f => f.relativePath === path);
        return file?.type === 'video' || file?.type === 'image';
      });
    }
    return renderSelectedInputs.some(file => file.type === 'video' || file.type === 'image');
  })();
  const renderImageFiles = renderImageOrderIds
    .map(id => renderSelectedInputs.find(file => file.id === id))
    .filter((file): file is NonNullable<typeof file> => Boolean(file));
  const renderVideoFile = runPipelineProject?.files.find(file => file.id === renderVideoId) ?? null;
  const renderAudioFile = runPipelineProject?.files.find(file => file.id === renderAudioId) ?? null;
  const renderSubtitleFile = runPipelineProject?.files.find(file => file.id === renderSubtitleId) ?? null;
  const placeholderKeyByFileId = React.useMemo(() => {
    if (!runPipelineProject?.files) return {};
    return computePlaceholderKeyByFileId(runPipelineProject.files, renderInputFileIds);
  }, [runPipelineProject?.files, renderInputFileIds]);

  const updateRenderTrackLabel = React.useCallback((key: string, value: string) => {
    setRenderTrackLabels(prev => ({ ...prev, [key]: value }));
  }, []);

  useEffect(() => {
    setRenderTrackLabels({});
  }, [runPipelineProject?.id]);

  const selectProjectDefaults = () => {
    const files = runPipelineProject?.files ?? [];
    const firstVideo = files.find(file => file.type === 'video');
    const firstAudio = files.find(file => file.type === 'audio');
    const firstSubtitle = files.find(file => file.type === 'subtitle');
    setRenderVideoId(firstVideo?.id ?? null);
    setRenderAudioId(firstAudio?.id ?? null);
    setRenderSubtitleId(firstSubtitle?.id ?? null);
    setRenderTextTrackEnabled(false);
    setRenderInputFileIds(
      [firstVideo?.id, firstAudio?.id, firstSubtitle?.id].filter(Boolean) as string[]
    );
    setRenderStudioFocus('timeline');
    setRenderStudioItemType(null);
  };
  const resetRenderToDefault = () => {
    setRunPipelineRenderTemplateId('custom');
    setRenderConfigV2Override(null);
    setRenderTrackLabels({});
    setRenderImageTransforms({});
    setRenderVideoTransforms({});
    setRenderImageDurations({});
    setRenderImageMatchDuration({});
    setRenderImageOrderIds([]);
    setRenderInputFileIds([]);
    setRenderTextTrackEnabled(false);
    setRenderParams(DEFAULT_RENDER_PARAMS);
    selectProjectDefaults();
  };
  const renderVideoDuration = renderVideoFile?.durationSeconds ?? parseDurationToSeconds(renderVideoFile?.duration);
  const renderAudioDuration = renderAudioFile?.durationSeconds ?? parseDurationToSeconds(renderAudioFile?.duration);
  const singleTextValue = String(renderParams.text.singleText ?? '').trim();
  const singleTextMatchDuration = String(renderParams.text.singleTextMatchDuration ?? '0') === '1';
  const singleTextStart = singleTextMatchDuration ? 0 : (coerceNumber(renderParams.text.singleTextStart, 0) ?? 0);
  const singleTextFallbackEndTemp = renderVideoDuration ?? renderAudioDuration ?? 5;
  const singleTextEndTemp = singleTextMatchDuration ? singleTextFallbackEndTemp : (coerceNumber(renderParams.text.singleTextEnd, singleTextFallbackEndTemp) ?? singleTextFallbackEndTemp);
  const singleTextDurationTemp = singleTextValue ? Math.max(0.01, singleTextEndTemp - singleTextStart) : 0;
  const singleTextTrackEndTemp = singleTextValue ? singleTextStart + singleTextDurationTemp : 0;
  const renderSubtitleDuration = renderSubtitleFile?.durationSeconds
    ?? parseDurationToSeconds(renderSubtitleFile?.duration);
  const updateRenderParam = (section: 'timeline' | 'video' | 'audio' | 'subtitle' | 'text' | 'render', key: string, value: any) => {
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

  const updateRenderParamDraft = (section: 'timeline' | 'video' | 'audio' | 'subtitle' | 'text' | 'render', key: string, value: any) => {
    setRenderParamsDraft(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [key]: value
      }
    }));
  };

  const commitRenderParamDraftValue = (section: 'timeline' | 'video' | 'audio' | 'subtitle' | 'text' | 'render', key: string) => {
    const value = (renderParamsDraft as any)?.[section]?.[key];
    updateRenderParam(section, key, value);
  };

  const commitRenderParamDraftOnEnter = (section: 'timeline' | 'video' | 'audio' | 'subtitle' | 'text' | 'render', key: string) =>
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') {
        commitRenderParamDraftValue(section, key);
      }
    };

  const defaultBlurRegionEffect = (): RenderBlurRegionEffect => ({
    type: 'blur_region',
    left: 10,
    right: 10,
    top: 40,
    bottom: 40,
    sigma: 20,
    feather: 0
  });
  const addRenderVideoBlurEffect = (fileId: string | null) => {
    if (!fileId) return;
    setRenderVideoTransforms(prev => {
      const current = prev[fileId] ?? {};
      return {
        ...prev,
        [fileId]: {
          ...current,
          blurEffects: [...(current.blurEffects ?? []), defaultBlurRegionEffect()]
        }
      };
    });
  };
  const updateRenderVideoBlurEffect = (fileId: string | null, index: number, patch: Partial<RenderBlurRegionEffect>) => {
    if (!fileId) return;
    setRenderVideoTransforms(prev => {
      const current = prev[fileId] ?? {};
      const effects = current.blurEffects ?? [];
      return {
        ...prev,
        [fileId]: {
          ...current,
          blurEffects: effects.map((effect, effectIndex) => (
            effectIndex === index ? { ...effect, ...patch } : effect
          ))
        }
      };
    });
  };
  const commitRenderVideoBlurEffectValue = (_fileId: string | null, _index: number, _key: keyof RenderBlurRegionEffect) => {};
  const removeRenderVideoBlurEffect = (fileId: string | null, index: number) => {
    if (!fileId) return;
    setRenderVideoTransforms(prev => {
      const current = prev[fileId] ?? {};
      const effects = current.blurEffects ?? [];
      return {
        ...prev,
        [fileId]: {
          ...current,
          blurEffects: effects.filter((_, effectIndex) => effectIndex !== index)
        }
      };
    });
  };
  const addRenderImageBlurEffect = (fileId: string) => {
    if (!fileId) return;
    setRenderImageTransforms(prev => {
      const current = prev[fileId] ?? {};
      return {
        ...prev,
        [fileId]: {
          ...current,
          blurEffects: [...(current.blurEffects ?? []), defaultBlurRegionEffect()]
        }
      };
    });
  };
  const updateRenderImageBlurEffect = (fileId: string, index: number, patch: Partial<RenderBlurRegionEffect>) => {
    if (!fileId) return;
    setRenderImageTransforms(prev => {
      const current = prev[fileId] ?? {};
      const effects = current.blurEffects ?? [];
      return {
        ...prev,
        [fileId]: {
          ...current,
          blurEffects: effects.map((effect, effectIndex) => (
            effectIndex === index ? { ...effect, ...patch } : effect
          ))
        }
      };
    });
  };
  const commitRenderImageBlurEffectValue = (_fileId: string, _index: number, _key: keyof RenderBlurRegionEffect) => {};
  const removeRenderImageBlurEffect = (fileId: string, index: number) => {
    if (!fileId) return;
    setRenderImageTransforms(prev => {
      const current = prev[fileId] ?? {};
      const effects = current.blurEffects ?? [];
      return {
        ...prev,
        [fileId]: {
          ...current,
          blurEffects: effects.filter((_, effectIndex) => effectIndex !== index)
        }
      };
    });
  };
  const renderTimelineMax = Math.max(
    renderVideoDuration ?? 0,
    renderAudioDuration ?? 0,
    renderSubtitleDuration ?? 0,
    singleTextTrackEndTemp ?? 0
  );
  const renderImageDurationFallback = renderTimelineMax > 0 ? renderTimelineMax : 5;
  const renderImageDurationEntriesTemp = renderImageFiles.map(file => ({
    id: file.id,
    duration: coerceNumber(renderImageDurations[file.id], renderImageDurationFallback) ?? renderImageDurationFallback
  }));
  const renderImageTimelineMaxTemp = renderImageDurationEntriesTemp.reduce((max, entry) => Math.max(max, entry.duration), 0);
  /** Thời lượng thật = track dài nhất (hiển thị, preview, export). */
  const renderTimelineDurationTemp = Math.max(renderTimelineMax, renderImageTimelineMaxTemp);
  /** Chỉ UI: strip timeline rộng thêm một phần sau điểm cuối nội dung (scroll / click map theo giá trị này, thời gian clamp về duration thật). */
  const renderTimelineViewDurationTemp =
    renderTimelineDurationTemp > 0 ? renderTimelineDurationTemp * (1 + RENDER_TIMELINE_VIEW_PAD) : 0;

  // Recalculate image durations with actual timeline duration
  const renderImageDurationEntries = renderImageFiles.map(file => ({
    id: file.id,
    duration: renderImageMatchDuration[file.id] && renderTimelineDurationTemp > 0
      ? renderTimelineDurationTemp
      : (coerceNumber(renderImageDurations[file.id], renderImageDurationFallback) ?? renderImageDurationFallback)
  }));
  const renderImageTimelineMax = renderImageDurationEntries.reduce((max, entry) => Math.max(max, entry.duration), 0);
  /** Thời lượng thật = track dài nhất (hiển thị, preview, export). */
  const renderTimelineDuration = Math.max(renderTimelineMax, renderImageTimelineMax);
  /** Chỉ UI: strip timeline rộng thêm một phần sau điểm cuối nội dung (scroll / click map theo giá trị này, thời gian clamp về duration thật). */
  const renderTimelineViewDuration =
    renderTimelineDuration > 0 ? renderTimelineDuration * (1 + RENDER_TIMELINE_VIEW_PAD) : 0;

  // Recalculate single text with actual timeline duration
  const singleTextFallbackEnd = renderTimelineDuration > 0 ? renderTimelineDuration : singleTextFallbackEndTemp;
  const singleTextEnd = singleTextMatchDuration ? singleTextFallbackEnd : (coerceNumber(renderParams.text.singleTextEnd, singleTextFallbackEnd) ?? singleTextFallbackEnd);
  const singleTextDuration = singleTextValue ? Math.max(0.01, singleTextEnd - singleTextStart) : 0;
  const singleTextTrackEnd = singleTextValue ? singleTextStart + singleTextDuration : 0;
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
  const showRenderTimelineTextTrack = renderTextTrackEnabled || Boolean(singleTextValue);
  const showRenderTimelineImageTrack = renderImageFiles.length > 0;
  const showRenderTimelineVideoTrack = Boolean(renderVideoFile);
  const showRenderTimelineAudioTrack = Boolean(renderAudioFile);
  const renderSelectedItem = useMemo(() => {
    if (renderStudioFocus !== 'item') return null;
    const files = runPipelineProject?.files ?? [];
    if (renderStudioItemType === 'video') return files.find(file => file.id === renderVideoId) ?? null;
    if (renderStudioItemType === 'audio') return files.find(file => file.id === renderAudioId) ?? null;
    if (renderStudioItemType === 'subtitle') return files.find(file => file.id === renderSubtitleId) ?? null;
    if (renderStudioItemType === 'text') return null;
    if (renderStudioItemType === 'image') {
      return files.find(file => file.id === renderInputFileIds.find(id => {
        const f = files.find(item => item.id === id);
        return f?.type === 'image';
      })) ?? null;
    }
    return null;
  }, [renderStudioFocus, renderStudioItemType, runPipelineProject?.files, renderVideoId, renderAudioId, renderSubtitleId, renderInputFileIds]);
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

  const handleLogin = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!authUsername.trim() || !authPassword) {
      setAuthError('Please enter both username and password.');
      return;
    }
    setAuthSubmitting(true);
    setAuthError(null);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: authUsername, password: authPassword })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.ok || !data?.user) {
        throw new Error(data?.error || 'Login failed.');
      }
      setAuthUser(data.user as AuthUser);
      setAuthPassword('');
      if (typeof window !== 'undefined') {
        window.history.pushState({}, '', '/dashboard');
      }
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Login failed.');
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleRegister = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (registerEnabled === false) {
      return;
    }
    if (!authUsername.trim() || !authPassword) {
      setAuthError('Please enter both username and password.');
      return;
    }
    if (authPassword !== authConfirmPassword) {
      setAuthError('Passwords do not match.');
      return;
    }
    setAuthSubmitting(true);
    setAuthError(null);
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: authUsername, password: authPassword })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.ok || !data?.user) {
        throw new Error(data?.error || 'Register failed.');
      }
      setAuthPassword('');
      setAuthConfirmPassword('');
      navigateAuth('login');
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Register failed.');
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleLogout = () => {
    if (typeof window !== 'undefined') {
      const ok = window.confirm('Are you sure you want to log out?');
      if (!ok) return;
    }
    fetch('/api/auth/logout', { method: 'POST' }).catch(() => null);
    setAuthUser(null);
    setAuthUsername('');
    setAuthPassword('');
    setAuthConfirmPassword('');
    setAuthError(null);
    navigateAuth('login');
  };

  useEffect(() => {
    const handlePopState = () => {
      setAuthView(getAuthViewFromPath());
      setAuthError(null);
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('popstate', handlePopState);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('popstate', handlePopState);
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadAuthConfig = async () => {
      try {
        const response = await fetch('/api/auth/config');
        const data = await response.json().catch(() => ({}));
        if (cancelled) return;
        setRegisterEnabled(Boolean(data?.registerEnabled));
      } catch {
        if (!cancelled) {
          setRegisterEnabled(false);
        }
      }
    };
    loadAuthConfig();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadAuthUser = async () => {
      try {
        const response = await fetch('/api/auth/me');
        const data = await response.json().catch(() => ({}));
        if (cancelled) return;
        if (response.ok && data?.ok && data?.user) {
          setAuthUser(data.user as AuthUser);
        } else {
          setAuthUser(null);
        }
        setAuthChecked(true);
      } catch {
        if (!cancelled) {
          setAuthUser(null);
          setAuthChecked(true);
        }
      }
    };
    loadAuthUser();
    return () => {
      cancelled = true;
    };
  }, []);

  const navigateAuth = (view: 'login' | 'register') => {
    if (typeof window === 'undefined') return;
    const nextPath = view === 'register' ? '/register' : '/login';
    if (window.location.pathname !== nextPath) {
      window.history.pushState({}, '', nextPath);
    }
    setAuthView(view);
    setAuthConfirmPassword('');
    setAuthError(null);
  };

  const navigateTab = (tab: string) => {
    const nextPath = tabPathMap[tab] ?? '/dashboard';
    if (typeof window !== 'undefined' && window.location.pathname !== nextPath) {
      window.history.pushState({}, '', nextPath);
    }
    setActiveTab(tab);
  };

  const setRenderStudioOpen = (open: boolean) => {
    if (typeof window !== 'undefined') {
      if (open) {
        const currentPath = window.location.pathname;
        if (currentPath !== renderStudioPath) {
          renderStudioReturnPathRef.current = currentPath;
          window.history.pushState(
            {},
            '',
            buildRenderStudioUrl(
              runPipelineProjectId,
              runPipelineRenderTemplateId,
              runPipelineId,
              runPipelineProject?.name ?? null
            )
          );
        }
      } else {
        const target = renderStudioReturnPathRef.current || '/dashboard';
        if (window.location.pathname !== target) {
          window.history.pushState({}, '', target);
        }
      }
    }
    if (!open) {
      renderStudioQueryAppliedRef.current = false;
      renderStudioPendingProjectIdRef.current = null;
      renderStudioPendingProjectNameRef.current = null;
    }
    setShowRenderStudio(open);
  };

  useEffect(() => {
    if (!authChecked) return;
    if (authUser) return;
    if (typeof window === 'undefined') return;
    const path = window.location.pathname;
    if (path !== '/login' && path !== '/register') {
      navigateAuth('login');
    }
  }, [authChecked, authUser]);

  useEffect(() => {
    if (authView !== 'register') return;
    if (registerEnabled === null) return;
    if (registerEnabled) return;
    navigateAuth('login');
  }, [authView, registerEnabled]);

  useEffect(() => {
    if (!authUser) return;
    if (typeof window === 'undefined') return;
    const path = window.location.pathname;
    if (path === '/login' || path === '/register') {
      window.history.replaceState({}, '', '/dashboard');
      setActiveTab('dashboard');
      return;
    }
    if (path === renderStudioPath) {
      setShowRenderStudio(true);
      renderStudioQueryAppliedRef.current = false;
      return;
    }
    if (!Object.values(tabPathMap).includes(path)) {
      window.history.replaceState({}, '', '/dashboard');
      setActiveTab('dashboard');
      return;
    }
    setActiveTab(getTabFromPath(path));
  }, [authUser]);

  useEffect(() => {
    if (!authUser || !showRenderStudio) return;
    if (typeof window === 'undefined') return;
    if (renderStudioQueryAppliedRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const projectId = params.get('projectId');
    const projectName = params.get('project');
    const templateId = params.get('template');
    const pipelineId = params.get('pipeline');
    if (projectId) renderStudioPendingProjectIdRef.current = projectId;
    if (projectName) renderStudioPendingProjectNameRef.current = projectName;
    if (templateId) {
      setRunPipelineRenderTemplateId(templateId);
    }
    if (pipelineId) {
      setRunPipelineId(pipelineId);
    }
    renderStudioQueryAppliedRef.current = true;
  }, [authUser, showRenderStudio]);

  useEffect(() => {
    if (!authUser || !showRenderStudio) return;
    const pendingId = renderStudioPendingProjectIdRef.current;
    const pendingName = renderStudioPendingProjectNameRef.current;
    if (!pendingId && !pendingName) return;
    const matchById = pendingId
      ? vaultFolders.find(folder => folder.id === pendingId)
      : null;
    if (matchById) {
      setRunPipelineProjectId(matchById.id);
      renderStudioPendingProjectIdRef.current = null;
      renderStudioPendingProjectNameRef.current = null;
      return;
    }
    const matchByLegacyId = pendingName
      ? vaultFolders.find(folder => folder.id === pendingName)
      : null;
    if (matchByLegacyId) {
      setRunPipelineProjectId(matchByLegacyId.id);
      renderStudioPendingProjectIdRef.current = null;
      renderStudioPendingProjectNameRef.current = null;
      return;
    }
    if (pendingName) {
      const lowered = pendingName.trim().toLowerCase();
      const matchByName = vaultFolders.find(folder => folder.name.toLowerCase() === lowered);
      if (matchByName) {
        setRunPipelineProjectId(matchByName.id);
        renderStudioPendingProjectIdRef.current = null;
        renderStudioPendingProjectNameRef.current = null;
      }
    }
  }, [authUser, showRenderStudio, vaultFolders]);

  useEffect(() => {
    if (!authUser || !showRenderStudio) return;
    if (runPipelineHasRender) return;
    if (!renderPipelineId) return;
    if (runPipelineId === renderPipelineId) return;
    setRunPipelineId(renderPipelineId);
  }, [authUser, showRenderStudio, runPipelineHasRender, renderPipelineId, runPipelineId]);

  useEffect(() => {
    if (!authUser || !showRenderStudio) return;
    if (typeof window === 'undefined') return;
    const nextUrl = buildRenderStudioUrl(
      runPipelineProjectId,
      runPipelineRenderTemplateId,
      runPipelineId,
      runPipelineProject?.name ?? null
    );
    const currentUrl = `${window.location.pathname}${window.location.search}`;
    if (currentUrl !== nextUrl) {
      window.history.replaceState({}, '', nextUrl);
    }
  }, [authUser, showRenderStudio, runPipelineProjectId, runPipelineRenderTemplateId]);

  useEffect(() => {
    if (!authUser) return;
    const handlePopState = () => {
      if (typeof window === 'undefined') return;
      const path = window.location.pathname;
      if (path === renderStudioPath) {
        setShowRenderStudio(true);
        renderStudioQueryAppliedRef.current = false;
        return;
      }
      setShowRenderStudio(false);
      const nextTab = getTabFromPath(path);
      setActiveTab(nextTab);
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('popstate', handlePopState);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('popstate', handlePopState);
      }
    };
  }, [authUser]);

  const showToast = (message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') => {
    setToastType(type);
    setToastMessage(message);
    setToastVisible(true);
  };

  const toastStyles: Record<'info' | 'success' | 'warning' | 'error', string> = {
    info: 'border-zinc-700 bg-zinc-900 text-zinc-200',
    success: 'border-lime-700 bg-zinc-900 text-lime-200',
    warning: 'border-amber-700 bg-zinc-900 text-amber-200',
    error: 'border-red-700 bg-zinc-900 text-red-200'
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
      if (!key.includes('.')) continue;
      const [section, field] = key.split('.');
      if (section !== 'timeline' && section !== 'video' && section !== 'audio' && section !== 'subtitle' && section !== 'text') continue;
      const resolvedSection = section === 'subtitle' && RENDER_TEXT_PARAM_FIELDS.has(field) ? 'text' : section;
      const sectionObj = (renderParams as any)[resolvedSection];
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
      const legacyMask: Record<string, string> = {};
      let hasNewMaskInsets = false;
      Object.entries(params).forEach(([key, value]) => {
        if (!key.includes('.')) return;
        const [section, field] = key.split('.');
        if (section !== 'timeline' && section !== 'video' && section !== 'audio' && section !== 'subtitle' && section !== 'text' && section !== 'render') return;
        if (value === undefined || value === null) return;
        if (section === 'audio' && (field === 'normalize' || field === 'pan' || field === 'channelMode')) return;
        if (section === 'audio' && field === 'mute') {
          updateRenderParam('audio', 'mute', Boolean(value));
          return;
        }
        if (section === 'subtitle' && RENDER_TEXT_PARAM_FIELDS.has(field)) {
          updateRenderParam('text', field, String(value));
          return;
        }
        if (section === 'video' && (field === 'maskLeft' || field === 'maskRight' || field === 'maskTop' || field === 'maskBottom')) {
          hasNewMaskInsets = true;
        }
        if (section === 'video' && (field === 'maskX' || field === 'maskY' || field === 'maskW' || field === 'maskH')) {
          legacyMask[field] = String(value);
          return;
        }
        updateRenderParam(section as 'timeline' | 'video' | 'audio' | 'subtitle' | 'text' | 'render', field, String(value));
      });
      if (!hasNewMaskInsets && Object.keys(legacyMask).length > 0) {
        const x = coerceNumber(legacyMask.maskX, 0) ?? 0;
        const y = coerceNumber(legacyMask.maskY, 0) ?? 0;
        const w = coerceNumber(legacyMask.maskW, 100) ?? 100;
        const h = coerceNumber(legacyMask.maskH, 100) ?? 100;
        const left = Math.max(0, Math.min(100, x));
        const top = Math.max(0, Math.min(100, y));
        const right = Math.max(0, Math.min(100, 100 - x - w));
        const bottom = Math.max(0, Math.min(100, 100 - y - h));
        updateRenderParam('video', 'maskLeft', String(left));
        updateRenderParam('video', 'maskRight', String(right));
        updateRenderParam('video', 'maskTop', String(top));
        updateRenderParam('video', 'maskBottom', String(bottom));
      }
    }
  };

  const handleParamPresetChange = (taskType: string, value: string) => {
    setRunPipelineParamPreset(prev => ({ ...prev, [taskType]: value }));
    if (value !== 'custom') {
      applyParamPresetParams(taskType);
    }
  };

  const getTaskTemplatesForType = (taskType: string) => taskTemplates.filter(template => template.taskType === taskType);

  const getSelectedTaskTemplate = (taskType: string) => {
    const selectedId = runPipelineTaskTemplate[taskType];
    if (!selectedId || selectedId === 'custom') return null;
    return taskTemplates.find(template => template.taskType === taskType && template.id === selectedId) ?? null;
  };

  const renderTaskTemplateParamsSummary = (template: TaskTemplate | null) => {
    if (!template) return null;
    const entries = Object.entries(template.params || {});
    if (entries.length === 0) {
      return (
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3 text-sm text-zinc-400">
          No template parameters available.
        </div>
      );
    }
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3 text-sm text-zinc-200">
        <div className="mb-2 text-xs uppercase tracking-widest text-zinc-500">Template Parameters</div>
        <div className="grid gap-2 text-[12px]">
          {entries.map(([key, value]) => (
            <div key={key} className="grid grid-cols-[140px_minmax(0,1fr)] gap-3 items-start border-b border-zinc-800 pb-2 last:border-b-0 last:pb-0">
              <div className="text-zinc-400 font-medium">{key}</div>
              <div className="text-zinc-200 break-words">{typeof value === 'object' ? JSON.stringify(value) : String(value)}</div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const applyTaskTemplateParams = (taskType: string, params: Record<string, any>) => {
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
    }
  };

  const handleTaskTemplateChange = (taskType: string, value: string) => {
    setRunPipelineTaskTemplate(prev => ({ ...prev, [taskType]: value }));
    if (value === 'custom') return;
    const template = taskTemplates.find(t => t.id === value && t.taskType === taskType);
    if (template) applyTaskTemplateParams(taskType, template.params);
  };

  const buildTaskTemplateParams = (taskType: string): Record<string, any> => {
    if (taskType === 'download') {
      return {
        downloadMode,
        subLangs: downloadSubtitleLang,
        noPlaylist: downloadNoPlaylist
      };
    }
    if (taskType === 'uvr') {
      return {
        backend: runPipelineBackend,
        model: vrModel,
        outputFormat: vrOutputType
      };
    }
    if (taskType === 'tts') {
      return {
        voice: runPipelineTtsVoice,
        rate: runPipelineTtsRate,
        pitch: runPipelineTtsPitch,
        overlapMode: runPipelineTtsOverlapMode,
        removeLineBreaks: runPipelineTtsRemoveLineBreaks
      };
    }
    return {};
  };

  const getDefaultTaskTemplateParams = (taskType: 'download' | 'uvr' | 'tts'): Record<string, any> => {
    if (taskType === 'download') {
      return {
        downloadMode: 'all',
        subLangs: 'ai-zh',
        noPlaylist: true
      };
    }
    if (taskType === 'uvr') {
      return {
        backend: 'vr',
        model: 'MGM_MAIN_v4.pth',
        outputFormat: 'Mp3'
      };
    }
    return {
      voice: 'vi-VN-HoaiMyNeural',
      rate: '',
      pitch: '',
      overlapMode: 'overlap',
      removeLineBreaks: true
    };
  };

  const openTemplateSaveModal = (
    taskType: 'render' | 'download' | 'uvr' | 'tts',
    defaultName: string,
    errorMessage?: string | null
  ) => {
    setTemplateSaveTaskType(taskType);
    setTemplateSaveName(defaultName);
    setTemplateSaveError(errorMessage ?? null);
    setTemplateSaveOpen(true);
  };

  const saveTaskTemplate = (taskType: 'download' | 'uvr' | 'tts') => {
    const templatesForType = getTaskTemplatesForType(taskType);
    const baseLabel = availableTasks.find(task => task.type === taskType)?.label ?? taskType;
    const defaultName = `${baseLabel} template ${templatesForType.length + 1}`;
    setTemplateSaveParams(buildTaskTemplateParams(taskType));
    setTemplateSaveRenderConfig(null);
    openTemplateSaveModal(taskType, defaultName);
  };

  const saveTaskTemplateRecord = async (payload: {
    id?: string | null;
    name: string;
    taskType: 'download' | 'uvr' | 'tts';
    params: Record<string, any>;
  }) => {
    const body: Record<string, any> = {
      name: payload.name,
      taskType: payload.taskType,
      params: payload.params
    };
    const numericId = payload.id ? Number(payload.id) : null;
    if (Number.isFinite(numericId)) body.id = numericId;
    const response = await fetch('/api/task-templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || 'Unable to save task template');
    }
    const data = await response.json();
    return data.template as TaskTemplate;
  };

  const deleteTaskTemplate = async (id: string) => {
    const numericId = Number(id);
    if (!Number.isFinite(numericId)) {
      throw new Error('Invalid template id');
    }
    const response = await fetch(`/api/task-templates/${numericId}`, { method: 'DELETE' });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || 'Unable to delete task template');
    }
  };

  const isTaskTemplateDirty = (taskType: 'download' | 'uvr' | 'tts') => {
    const selected = getSelectedTaskTemplate(taskType);
    const currentParams = buildTaskTemplateParams(taskType);
    if (selected) {
      return JSON.stringify(currentParams) !== JSON.stringify(selected.params ?? {});
    }
    const defaultParams = getDefaultTaskTemplateParams(taskType);
    return JSON.stringify(currentParams) !== JSON.stringify(defaultParams);
  };

  const saveTaskTemplateCurrent = async (taskType: 'download' | 'uvr' | 'tts', template: TaskTemplate) => {
    const params = buildTaskTemplateParams(taskType);
    try {
      const saved = await saveTaskTemplateRecord({
        id: template.id,
        name: template.name,
        taskType,
        params
      });
      setTaskTemplates(prev => prev.map(item => (
        item.id === template.id ? saved : item
      )));
      showToast('Saved template.', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save template';
      showToast(message, 'error');
    }
  };

  const restoreTaskTemplateCurrent = (taskType: 'download' | 'uvr' | 'tts', template: TaskTemplate) => {
    applyTaskTemplateParams(taskType, template.params);
    showToast('Restored template values.', 'success');
  };

  const deleteTaskTemplateWithConfirm = (taskType: 'download' | 'uvr' | 'tts', id: string, name?: string) => {
    const label = (availableTasks.find(task => task.type === taskType)?.label ?? taskType).toLowerCase();
    openConfirm(
      {
        title: `Delete ${label} template?`,
        description: name ? `Template "${name}" will be removed permanently.` : 'This template will be removed permanently.',
        confirmLabel: 'Delete',
        variant: 'danger'
      },
      () => {
        deleteTaskTemplate(id)
          .then(() => {
            setTaskTemplates(prev => prev.filter(template => template.id !== id));
            setRunPipelineTaskTemplate(prev => (
              prev[taskType] === id
                ? { ...prev, [taskType]: 'custom' }
                : prev
            ));
            showToast('Deleted template.', 'success');
          })
          .catch((error) => {
            const message = error instanceof Error ? error.message : 'Unable to delete template';
            showToast(message, 'error');
          });
      }
    );
  };

  const resetTaskTemplateToDefault = (taskType: 'download' | 'uvr' | 'tts') => {
    setRunPipelineTaskTemplate(prev => ({ ...prev, [taskType]: 'custom' }));
    if (taskType === 'download') {
      setDownloadMode('all');
      setDownloadSubtitleLang('ai-zh');
      setDownloadNoPlaylist(true);
      return;
    }
    if (taskType === 'uvr') {
      setRunPipelineBackend('vr');
      setVrModel('MGM_MAIN_v4.pth');
      setVrOutputType('Mp3');
      return;
    }
    setRunPipelineTtsVoice('vi-VN-HoaiMyNeural');
    setRunPipelineTtsRate('');
    setRunPipelineTtsPitch('');
    setRunPipelineTtsOverlapMode('overlap');
    setRunPipelineTtsRemoveLineBreaks(true);
  };

  const saveRenderTemplateQuick = () => {
    const config = buildRenderConfigV2();
    const defaultName = `Render template ${renderTemplates.length + 1}`;
    if (!config || !Array.isArray(config.items) || config.items.length === 0) {
      setTemplateSaveRenderConfig(null);
      setTemplateSaveParams(null);
      openTemplateSaveModal('render', defaultName, 'Select at least 1 file to build template.');
      return;
    }
    setTemplateSaveRenderConfig(config);
    setTemplateSaveParams(null);
    openTemplateSaveModal('render', defaultName);
  };

  const saveRenderTemplateCurrent = async (template: RenderTemplate) => {
    const config = buildRenderConfigV2();
    if (!config || !Array.isArray(config.items) || config.items.length === 0) {
      showToast('Select at least 1 file to build template.', 'warning');
      return;
    }
    const templateConfig = buildTemplateFromConfig(config);
    try {
      const saved = await saveRenderTemplate({ id: template.id, name: template.name, config: templateConfig });
      setRenderTemplates(prev => prev.map(t => (t.id === template.id ? saved : t)));
      showToast('Saved render template.', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save template';
      showToast(message, 'error');
    }
  };

  const restoreRenderTemplateCurrent = (template: RenderTemplate) => {
    const typeOfKey = (key: string) => {
      if (key.startsWith('video')) return 'video';
      if (key.startsWith('audio')) return 'audio';
      if (key.startsWith('subtitle')) return 'subtitle';
      if (key.startsWith('image')) return 'image';
      return null;
    };
    const mapping: Record<string, string> = {};
    const inputsMap = renderConfigV2Override?.inputsMap ?? {};
    Object.entries(inputsMap).forEach(([key, value]) => {
      if (!value) return;
      const file = runPipelineProject?.files.find(f => f.relativePath === value);
      if (file) mapping[key] = file.id;
    });
    const missingKeys = Object.keys(template.config.inputsMap).filter(key => !mapping[key]);
    if (missingKeys.length > 0) {
      const selectedFiles = runPipelineProject?.files.filter(file => renderInputFileIds.includes(file.id)) ?? [];
      const buckets = {
        video: selectedFiles.filter(file => file.type === 'video'),
        audio: selectedFiles.filter(file => file.type === 'audio'),
        subtitle: selectedFiles.filter(file => file.type === 'subtitle'),
        image: selectedFiles.filter(file => file.type === 'image')
      };
      const indices = { video: 0, audio: 0, subtitle: 0, image: 0 } as Record<string, number>;
      Object.keys(template.config.inputsMap).forEach((key) => {
        if (mapping[key]) return;
        const type = typeOfKey(key);
        if (!type) return;
        const file = buckets[type][indices[type]];
        if (file) {
          mapping[key] = file.id;
          indices[type] += 1;
        }
      });
    }
    const stillMissing = Object.keys(template.config.inputsMap).filter(key => !mapping[key]);
    if (stillMissing.length > 0) {
      setRenderTemplateApplyTarget(template);
      commitRenderTemplateApplyMap(template.id, mapping);
      setRenderTemplateApplyOpen(true);
      return;
    }
    applyRenderTemplate(template, mapping);
  };

  const saveRenderTemplate = async (payload: { id?: string | null; name: string; config: RenderConfigV2 }) => {
    const body: Record<string, any> = {
      name: payload.name,
      config: payload.config
    };
    const numericId = payload.id ? Number(payload.id) : null;
    if (Number.isFinite(numericId)) body.id = numericId;
    const response = await fetch('/api/render-templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || 'Unable to save template');
    }
    const data = await response.json();
    return data.template as RenderTemplate;
  };

  const deleteRenderTemplate = async (id: string) => {
    const numericId = Number(id);
    if (!Number.isFinite(numericId)) {
      throw new Error('Invalid template id');
    }
    const response = await fetch(`/api/render-templates/${numericId}`, { method: 'DELETE' });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || 'Unable to delete template');
    }
  };

  const deleteRenderTemplateWithConfirm = (id: string, name?: string) => {
    openConfirm(
      {
        title: 'Delete render template?',
        description: name ? `Template "${name}" will be removed permanently.` : 'This template will be removed permanently.',
        confirmLabel: 'Delete',
        variant: 'danger'
      },
      () => {
        deleteRenderTemplate(id)
          .then(() => {
            setRenderTemplates(prev => prev.filter(t => t.id !== id));
            if (runPipelineRenderTemplateId === id) {
              setRunPipelineRenderTemplateId('custom');
              setRenderConfigV2Override(null);
            }
            showToast('Deleted render template.', 'success');
          })
          .catch((error) => {
            const message = error instanceof Error ? error.message : 'Unable to delete template';
            showToast(message, 'error');
          });
      }
    );
  };

  const confirmSaveTemplate = async () => {
    const label = templateSaveName.trim();
    if (templateSaveError) {
      showToast(templateSaveError, 'warning');
      return;
    }
    if (!label) {
      showToast('Nhập tên template.', 'warning');
      return;
    }
    if (templateSaveTaskType === 'render') {
      if (!templateSaveRenderConfig) return;
      const templateConfig = buildTemplateFromConfig(templateSaveRenderConfig);
      try {
        const saved = await saveRenderTemplate({ name: label, config: templateConfig });
        setRenderTemplates(prev => ([saved, ...prev]));
        setRunPipelineRenderTemplateId(saved.id);
        showToast('Saved render template.', 'success');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to save template';
        showToast(message, 'error');
        return;
      }
    } else {
      if (!templateSaveParams) return;
      try {
        const saved = await saveTaskTemplateRecord({
          name: label,
          taskType: templateSaveTaskType,
          params: templateSaveParams
        });
        setTaskTemplates(prev => ([saved, ...prev]));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to save template';
        showToast(message, 'error');
        return;
      }
      showToast('Saved template.', 'success');
    }
    setTemplateSaveOpen(false);
  };

  const buildRenderTemplateApplyMap = (template: RenderTemplate) => {
    const inputs = Object.keys(template.config.inputsMap ?? {});
    const typeOfKey = (key: string) => {
      if (key.startsWith('video')) return 'video';
      if (key.startsWith('audio')) return 'audio';
      if (key.startsWith('subtitle')) return 'subtitle';
      if (key.startsWith('image')) return 'image';
      return null;
    };
    const availableFiles = runPipelineProject?.files ?? [];
    const filesByType = {
      video: availableFiles.filter(file => file.type === 'video'),
      audio: availableFiles.filter(file => file.type === 'audio'),
      subtitle: availableFiles.filter(file => file.type === 'subtitle'),
      image: availableFiles.filter(file => file.type === 'image')
    };
    const indices = { video: 0, audio: 0, subtitle: 0, image: 0 } as Record<string, number>;
    const mapping: Record<string, string> = {};
    inputs.forEach((key) => {
      const type = typeOfKey(key);
      if (!type) return;
      const file = filesByType[type][indices[type]];
      if (file) {
        mapping[key] = file.id;
        indices[type] += 1;
      }
    });
    return mapping;
  };

  const commitRenderTemplateApplyMap = (templateId: string | null, mapping: Record<string, string>) => {
    setRenderTemplateApplyMap(mapping);
    if (!templateId) return;
    setRenderTemplateApplyMapById(prev => ({
      ...prev,
      [templateId]: mapping
    }));
  };

  const handleRenderTemplateChange = (value: string) => {
    setRunPipelineRenderTemplateId(value);
    if (value === 'custom') {
      setRenderConfigV2Override(null);
      return;
    }
    const template = renderTemplates.find(t => t.id === value);
    if (!template) return;
    const mapping = renderTemplateApplyMapById[template.id] ?? buildRenderTemplateApplyMap(template);
    setRenderTemplateApplyTarget(template);
    commitRenderTemplateApplyMap(template.id, mapping);
    applyRenderTemplate(template, mapping);
  };

  useEffect(() => {
    if (!showRenderStudio) return;
    if (runPipelineRenderTemplateId === 'custom') return;
    if (renderConfigV2Override) return;
    if (!runPipelineProject) return;
    const template = renderTemplates.find(t => t.id === runPipelineRenderTemplateId);
    if (!template) return;
    const key = `${runPipelineProject.id}:${template.id}`;
    if (lastAutoTemplateApplyKeyRef.current === key) return;
    const mapping = renderTemplateApplyMapById[template.id] ?? buildRenderTemplateApplyMap(template);
    setRenderTemplateApplyTarget(template);
    commitRenderTemplateApplyMap(template.id, mapping);
    applyRenderTemplate(template, mapping);
    lastAutoTemplateApplyKeyRef.current = key;
  }, [
    showRenderStudio,
    runPipelineRenderTemplateId,
    renderConfigV2Override,
    runPipelineProject,
    renderTemplates,
    renderTemplateApplyMapById
  ]);

  const applySubtitleStylePreset = (preset: SubtitleStylePreset, section: 'subtitle' | 'text' = 'subtitle') => {
    setRenderParams(prev => ({
      ...prev,
      [section]: {
        ...(prev as any)[section],
        ...BASE_SUBTITLE_STYLE,
        ...preset.style,
        opacity: (prev as any)[section].opacity,
        textOpacity: (prev as any)[section].textOpacity,
        fontName: (prev as any)[section].fontName,
        fontSize: (prev as any)[section].fontSize
      }
    }));
  };

  const isSubtitlePresetActive = (preset: SubtitleStylePreset, section: 'subtitle' | 'text' = 'subtitle') => {
    const merged = { ...BASE_SUBTITLE_STYLE, ...preset.style };
    return (Object.keys(merged) as Array<keyof RenderSubtitleAssState>).every(key => {
      if (key === 'fontName' || key === 'fontSize') return true;
      if (key === 'opacity' || key === 'textOpacity') return true;
      const current = (renderParams as any)[section]?.[key];
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

  const renderConfigPreview = useMemo(() => {
    return buildRenderConfigV2();
  }, [
    renderConfigV2Override,
    runPipelineProject?.id,
    renderInputFileIds,
    renderImageOrderIds,
    renderImageDurations,
    renderImageMatchDuration,
    renderImageTransforms,
    renderVideoTransforms,
    renderTrackLabels,
    renderParams.timeline,
    renderParams.video,
    renderParams.audio,
    renderParams.subtitle,
    renderParams.text
  ]);

  useEffect(() => {
    if (!renderConfigV2Override) return;
    if (runPipelineRenderTemplateId === 'custom') return;
    if (Date.now() - lastTemplateApplyAtRef.current < 200) return;
    setRenderConfigV2Override(null);
  }, [
    renderConfigV2Override,
    runPipelineRenderTemplateId,
    renderParams,
    renderVideoTransforms,
    renderTrackLabels,
    renderImageTransforms,
    renderImageDurations,
    renderImageMatchDuration,
    renderImageOrderIds,
    renderInputFileIds
  ]);

  const renderPreviewParamsKey = JSON.stringify({
    renderParams,
    renderConfigPreview
  });

  useEffect(() => {
    if (!showRenderStudio) return;
    if (renderStudioFocus !== 'timeline') {
      setRenderPreviewLoading(false);
      return;
    }
    if (renderPreviewHold) {
      setRenderPreviewLoading(false);
      return;
    }
    if (!renderConfigPreview || !Array.isArray(renderConfigPreview.items) || renderConfigPreview.items.length === 0) {
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
        const previewAt = Math.max(
          0,
          renderTimelineDuration > 0
            ? Math.min(renderPlayheadSeconds, renderTimelineDuration)
            : renderPlayheadSeconds
        );
        const response = await fetch('/api/render-preview-v2', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ config: renderConfigPreview, at: previewAt }),
          signal: controller.signal
        });
        const useBlackPreview = () => {
          setRenderPreviewUrl(prev => {
            if (prev?.startsWith('blob:')) URL.revokeObjectURL(prev);
            return RENDER_PREVIEW_BLACK_DATA_URL;
          });
          setRenderPreviewError(null);
        };

        if (!response.ok) {
          console.error('Render preview failed', response.status, response.statusText);
          setRenderPreviewError(`${response.status} ${response.statusText}`);
          useBlackPreview();
          return;
        }
        const previewErrorHeader = response.headers.get('X-Render-Preview-Error');
        const blob = await response.blob();
        if (!blob.type.startsWith('image/')) {
          console.error('Render preview invalid content', blob.type);
          setRenderPreviewError(`Invalid preview content: ${blob.type}`);
          useBlackPreview();
          return;
        }
        const url = URL.createObjectURL(blob);
        setRenderPreviewUrl(prev => {
          if (prev?.startsWith('blob:')) URL.revokeObjectURL(prev);
          return url;
        });
        setRenderPreviewError(previewErrorHeader || null);
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error('Render preview error', error);
        setRenderPreviewUrl(prev => {
          if (prev?.startsWith('blob:')) URL.revokeObjectURL(prev);
          return RENDER_PREVIEW_BLACK_DATA_URL;
        });
        const message = error instanceof Error ? error.message : 'Render preview failed';
        setRenderPreviewError(message);
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
    renderConfigPreview,
    renderPlayheadSeconds,
    renderTimelineDuration,
    renderPreviewParamsKey,
    renderPreviewHold
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
  }, [
    showRenderStudio,
    renderSubtitleFile?.relativePath
  ]);

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
        { name: 'video.speed', desc: 'Playback speed', type: 'number', default: 1 },
        { name: 'video.volume', desc: 'Video audio volume (%)', type: 'number', default: 100 },
        { name: 'video.scale', desc: 'Scale (%)', type: 'number', default: 100 },
        { name: 'video.opacity', desc: 'Opacity (%)', type: 'number', default: 100 },
        { name: 'video.colorLut', desc: 'Color LUT id', type: 'string', default: '' },
        { name: 'video.cropX', desc: 'Crop X (%)', type: 'number', default: 0 },
        { name: 'video.cropY', desc: 'Crop Y (%)', type: 'number', default: 0 },
        { name: 'video.cropW', desc: 'Crop W (%)', type: 'number', default: 100 },
        { name: 'video.cropH', desc: 'Crop H (%)', type: 'number', default: 100 },
        { name: 'audio.gainDb', desc: 'Gain (dB)', type: 'number', default: 0 },
        { name: 'audio.mute', desc: 'Mute audio', type: 'boolean', default: false },
        { name: 'subtitle.fontName', desc: 'ASS Fontname (libass)', type: 'string', default: 'Arial' },
        { name: 'subtitle.fontSize', desc: 'Font size (px at PlayRes)', type: 'number', default: 72 },
        { name: 'subtitle.primaryColor', desc: 'Primary fill #RRGGBB', type: 'string', default: '#ffffff' },
        { name: 'subtitle.outlineColor', desc: 'Outline #RRGGBB', type: 'string', default: '#000000' },
        { name: 'subtitle.opacity', desc: 'Subtitle opacity (%)', type: 'number', default: 100 },
        { name: 'text.textOpacity', desc: 'Text track opacity (%)', type: 'number', default: 100 },
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
        { name: 'text.textAutoMoveEnabled', desc: 'Text track auto move enabled (1/0)', type: 'string', default: '0' },
        { name: 'text.textAutoMoveInterval', desc: 'Text track auto move interval (s)', type: 'number', default: 0 },
        { name: 'text.textAutoMovePositions', desc: 'Text track auto move positions (x,y % list)', type: 'string', default: '' }
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
      if (RENDER_TEXT_PARAM_FIELDS.has(k)) return;
      out[`subtitle.${k}`] = typeof v === 'boolean' ? v : String(v);
    });
    Object.entries(renderParams.text).forEach(([k, v]) => {
      out[`text.${k}`] = typeof v === 'boolean' ? v : String(v);
    });
    Object.entries(renderParams.render ?? {}).forEach(([k, v]) => {
      out[`render.${k}`] = typeof v === 'boolean' ? v : String(v);
    });
    return out;
  };

  function parseAutoMovePositions(raw: string): Array<{ x: number; y: number }> {
    if (!raw || typeof raw !== 'string') return [];
    return raw
      .split(/[\n;]+/)
      .map(item => item.trim())
      .filter(Boolean)
      .map(item => {
        const parts = item.split(/[, ]+/).filter(Boolean);
        if (parts.length < 2) return null;
        const x = coerceNumber(parts[0], NaN);
        const y = coerceNumber(parts[1], NaN);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
        return {
          x: Math.max(0, Math.min(100, x)),
          y: Math.max(0, Math.min(100, y))
        };
      })
      .filter(Boolean) as Array<{ x: number; y: number }>;
  }

  function buildRenderConfigV2(): RenderConfigV2 {
    if (renderConfigV2Override) return renderConfigV2Override;
    if (!runPipelineProject) return null;
    const selected = runPipelineProject.files.filter(file => renderInputFileIds.includes(file.id));
    if (!selected.length) return null;

    const counts = { video: 0, audio: 0, subtitle: 0, image: 0 } as Record<string, number>;
    const inputsMap: Record<string, string> = {};
    const trackLabelsOut: Record<string, string> = {};
    const items: RenderConfigV2['items'] = [];

    const timelineResolution = renderParams.timeline.resolution || '1920x1080';
    const timelineFramerate = coerceNumber(renderParams.timeline.framerate, 30) ?? 30;
    const normalizeScaleFactor = (value: string | number | null | undefined, fallbackPercent = 100) => {
      const numeric = coerceNumber(value, fallbackPercent) ?? fallbackPercent;
      return numeric > 2 ? numeric / 100 : numeric;
    };
    const subtitleBaseStyle = { ...renderParams.subtitle } as Record<string, any>;
    delete subtitleBaseStyle.textAutoMoveEnabled;
    delete subtitleBaseStyle.textAutoMoveInterval;
    delete subtitleBaseStyle.textAutoMovePositions;
    delete subtitleBaseStyle.singleText;
    delete subtitleBaseStyle.singleTextStart;
    delete subtitleBaseStyle.singleTextEnd;
    delete subtitleBaseStyle.singleTextMatchDuration;
    delete subtitleBaseStyle.textOpacity;
    const {
      textAutoMoveEnabled,
      textAutoMoveInterval,
      textAutoMovePositions,
      singleText,
      singleTextStart,
      singleTextEnd,
      singleTextMatchDuration,
      textOpacity,
      ...textBaseStyle
    } = renderParams.text;
    const parsedAutoMovePositions = parseAutoMovePositions(textAutoMovePositions ?? '');
    const parsedAutoMoveInterval = coerceNumber(textAutoMoveInterval, 0) ?? 0;
    const autoMoveEnabled = String(textAutoMoveEnabled ?? '0') === '1';

    const buildMaskFromParams = (
      maskType?: string,
      params?: {
        left?: string;
        right?: string;
        top?: string;
        bottom?: string;
        x?: string;
        y?: string;
        w?: string;
        h?: string;
      }
    ) => {
      if (!maskType || maskType === 'none') return null;
      const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
      const leftRaw = coerceNumber(params?.left, undefined);
      const rightRaw = coerceNumber(params?.right, undefined);
      const topRaw = coerceNumber(params?.top, undefined);
      const bottomRaw = coerceNumber(params?.bottom, undefined);
      const hasInsets = [leftRaw, rightRaw, topRaw, bottomRaw].some(value => typeof value === 'number');
      if (hasInsets) {
        const left = clamp(leftRaw ?? 0, 0, 100);
        const right = clamp(rightRaw ?? 0, 0, 100);
        const top = clamp(topRaw ?? 0, 0, 100);
        const bottom = clamp(bottomRaw ?? 0, 0, 100);
        const w = clamp(100 - left - right, 0.1, 100);
        const h = clamp(100 - top - bottom, 0.1, 100);
        return {
          type: maskType === 'circle' ? 'circle' : 'rect',
          x: left,
          y: top,
          w,
          h
        } as { type: 'rect' | 'circle'; x: number; y: number; w: number; h: number };
      }
      const x = clamp(coerceNumber(params?.x, 0) ?? 0, 0, 100);
      const y = clamp(coerceNumber(params?.y, 0) ?? 0, 0, 100);
      const w = clamp(coerceNumber(params?.w, 100) ?? 100, 0.1, 100);
      const h = clamp(coerceNumber(params?.h, 100) ?? 100, 0.1, 100);
      return {
        type: maskType === 'circle' ? 'circle' : 'rect',
        x,
        y,
        w,
        h
      } as { type: 'rect' | 'circle'; x: number; y: number; w: number; h: number };
    };
    const buildBlurEffectsFromRaw = (raw: unknown) => {
      const normalized = normalizeLoadedRenderEffects(raw);
      if (!normalized || normalized.length === 0) return undefined;
      return normalized.map(effect => ({
        type: 'blur_region',
        params: {
          left: effect.left,
          right: effect.right,
          top: effect.top,
          bottom: effect.bottom,
          sigma: effect.sigma,
          feather: effect.feather
        }
      }));
    };

    selected.forEach((file, idx) => {
      if (!file.relativePath) return;
      if (file.type !== 'video' && file.type !== 'audio' && file.type !== 'subtitle' && file.type !== 'image') return;
      counts[file.type] += 1;
      const key = counts[file.type] === 1 ? file.type : `${file.type}${counts[file.type]}`;
      inputsMap[key] = file.relativePath;
      const labelFromUser = (renderTrackLabels[key] ?? '').trim();
      trackLabelsOut[key] = labelFromUser || file.name || key;
      const baseItem: RenderConfigV2['items'][number] = {
        id: `${file.type}-${counts[file.type]}`,
        type: file.type,
        source: { ref: key },
        timeline: { start: 0 },
        layer: file.type === 'audio' || file.type === 'subtitle' ? 0 : 10 + idx
      };

      if (file.type === 'video' || file.type === 'image') {
        if (file.type === 'image') {
          const imageOrder = renderImageOrderIds.indexOf(file.id);
          baseItem.layer = imageOrder >= 0 ? 20 + imageOrder : baseItem.layer;
          const duration = coerceNumber(renderImageDurations[file.id], renderImageDurationFallback) ?? renderImageDurationFallback;
          baseItem.timeline = { start: 0, duration };
          const t = renderImageTransforms[file.id];
          if (t) {
            baseItem.transform = {
              x: coerceNumber(t.x, 50),
              y: coerceNumber(t.y, 50),
              scale: normalizeScaleFactor(t.scale, 100),
              rotation: coerceNumber(t.rotation, 0),
              opacity: coerceNumber(t.opacity, 100),
              fit: t.fit ?? 'contain',
              crop: {
                x: coerceNumber(t.cropX, 0),
                y: coerceNumber(t.cropY, 0),
                w: coerceNumber(t.cropW, 100),
                h: coerceNumber(t.cropH, 100)
              }
            };
            const mask = buildMaskFromParams(t.maskType, {
              left: t.maskLeft,
              right: t.maskRight,
              top: t.maskTop,
              bottom: t.maskBottom,
              x: (t as any).maskX,
              y: (t as any).maskY,
              w: (t as any).maskW,
              h: (t as any).maskH
            });
            if (mask) {
              baseItem.mask = mask;
            }
            const imageBlurEffects = buildBlurEffectsFromRaw(t.blurEffects);
            if (imageBlurEffects && imageBlurEffects.length > 0) {
              baseItem.effects = imageBlurEffects;
            }
          }
        }
        if (!baseItem.transform) {
          baseItem.transform = {
            x: coerceNumber(renderParams.video.positionX, 50),
            y: coerceNumber(renderParams.video.positionY, 50),
            scale: normalizeScaleFactor(renderParams.video.scale, 100),
            rotation: coerceNumber(renderParams.video.rotation, 0),
            opacity: coerceNumber(renderParams.video.opacity, 100),
            fit: renderParams.video.fit,
            crop: {
              x: coerceNumber(renderParams.video.cropX, 0),
              y: coerceNumber(renderParams.video.cropY, 0),
              w: coerceNumber(renderParams.video.cropW, 100),
              h: coerceNumber(renderParams.video.cropH, 100)
            }
          };
          const mask = buildMaskFromParams(renderParams.video.maskType, {
            left: renderParams.video.maskLeft,
            right: renderParams.video.maskRight,
            top: renderParams.video.maskTop,
            bottom: renderParams.video.maskBottom,
            x: (renderParams.video as any).maskX,
            y: (renderParams.video as any).maskY,
            w: (renderParams.video as any).maskW,
            h: (renderParams.video as any).maskH
          });
          if (mask) {
            baseItem.mask = mask;
          }
        }
        if (file.type === 'video') {
          const videoBlurEffects = buildBlurEffectsFromRaw(renderVideoTransforms[file.id]?.blurEffects);
          if (videoBlurEffects && videoBlurEffects.length > 0) {
            baseItem.effects = videoBlurEffects;
          }
        }
      }

      if (file.type === 'audio') {
        baseItem.audioMix = {
          gainDb: coerceNumber(renderParams.audio.gainDb, 0),
          mute: Boolean(renderParams.audio.mute)
        };
      }

      if (file.type === 'subtitle') {
        baseItem.subtitleStyle = {
          fontName: subtitleBaseStyle.fontName || 'Arial',
          fontSize: coerceNumber(subtitleBaseStyle.fontSize, 48),
          primaryColor: subtitleBaseStyle.primaryColor,
          outlineColor: subtitleBaseStyle.outlineColor,
          opacity: coerceNumber(subtitleBaseStyle.opacity, 100),
          bold: subtitleBaseStyle.bold === '1',
          italic: subtitleBaseStyle.italic === '1',
          spacing: 0,
          outline: coerceNumber(subtitleBaseStyle.outline, 2),
          shadow: coerceNumber(subtitleBaseStyle.shadow, 2),
          alignment: coerceNumber(subtitleBaseStyle.alignment, 2),
          marginL: coerceNumber(subtitleBaseStyle.marginL, 30),
          marginR: coerceNumber(subtitleBaseStyle.marginR, 30),
          marginV: coerceNumber(subtitleBaseStyle.marginV, 36),
          wrapStyle: 0,
          positionMode: subtitleBaseStyle.positionMode,
          positionX: coerceNumber(subtitleBaseStyle.positionX, 50),
          positionY: coerceNumber(subtitleBaseStyle.positionY, 50)
        };
      }

      items.push(baseItem);
    });

    const singleTextValue = String(singleText ?? '').trim();
    if (singleTextValue) {
      const start = coerceNumber(singleTextStart, 0) ?? 0;
      const fallbackEnd = renderTimelineDuration > 0 ? renderTimelineDuration : start + 5;
      const end = coerceNumber(singleTextEnd, fallbackEnd) ?? fallbackEnd;
      const safeEnd = Math.max(start + 0.01, end);
      const textSubtitleStyle: Record<string, unknown> = {
        ...textBaseStyle,
        opacity: coerceNumber(textOpacity, 100),
        spacing: 0,
        wrapStyle: 0
      };
      if (autoMoveEnabled && parsedAutoMoveInterval > 0 && parsedAutoMovePositions.length >= 2) {
        textSubtitleStyle.autoMoveInterval = parsedAutoMoveInterval;
        textSubtitleStyle.autoMovePositions = parsedAutoMovePositions;
      }
      items.push({
        id: 'text-1',
        type: 'text',
        source: {},
        timeline: { start, duration: safeEnd - start },
        text: { value: singleTextValue, start, end: safeEnd, matchDuration: singleTextMatchDuration ? '1' : '0' },
        subtitleStyle: textSubtitleStyle
      });
      const textLabel = (renderTrackLabels.text ?? '').trim();
      trackLabelsOut.text = textLabel || 'Text';
    }

    return {
      version: '2',
      timeline: {
        resolution: timelineResolution,
        framerate: timelineFramerate,
        trackLabels: trackLabelsOut,
        imageMatchDuration: renderImageMatchDuration
      },
      renderOptions: {
        codec: renderParams.render?.codec === 'h265' ? 'h265' : 'h264',
        preset: 'fast',
        crf: 21,
        gop: 0,
        tune: ''
      },
      inputsMap,
      items
    };
  }

  const buildTemplateFromConfig = (config: RenderConfigV2): RenderConfigV2 => {
    return {
      ...config,
      inputsMap: Object.keys(config.inputsMap).reduce((acc, key) => {
        acc[key] = '';
        return acc;
      }, {} as Record<string, string>)
    };
  };

  const buildDefaultRenderTemplateConfig = React.useCallback((): RenderConfigV2 => {
    const files = runPipelineProject?.files ?? [];
    const firstVideo = files.find(file => file.type === 'video' && file.relativePath);
    const firstAudio = files.find(file => file.type === 'audio' && file.relativePath);
    const firstSubtitle = files.find(file => file.type === 'subtitle' && file.relativePath);
    const inputsMap: Record<string, string> = {};
    const items: RenderConfigV2['items'] = [];
    const trackLabels: Record<string, string> = {};

    if (firstVideo?.relativePath) {
      inputsMap.video = firstVideo.relativePath;
      trackLabels.video = firstVideo.name || 'video';
      items.push({
        id: 'video-1',
        type: 'video',
        source: { ref: 'video' },
        timeline: { start: 0 },
        layer: 10,
        transform: {
          x: coerceNumber(DEFAULT_RENDER_PARAMS.video.positionX, 50),
          y: coerceNumber(DEFAULT_RENDER_PARAMS.video.positionY, 50),
          scale: (coerceNumber(DEFAULT_RENDER_PARAMS.video.scale, 100) ?? 100) / 100,
          rotation: coerceNumber(DEFAULT_RENDER_PARAMS.video.rotation, 0),
          opacity: coerceNumber(DEFAULT_RENDER_PARAMS.video.opacity, 100),
          fit: DEFAULT_RENDER_PARAMS.video.fit as 'contain' | 'cover' | 'stretch',
          crop: {
            x: coerceNumber(DEFAULT_RENDER_PARAMS.video.cropX, 0),
            y: coerceNumber(DEFAULT_RENDER_PARAMS.video.cropY, 0),
            w: coerceNumber(DEFAULT_RENDER_PARAMS.video.cropW, 100),
            h: coerceNumber(DEFAULT_RENDER_PARAMS.video.cropH, 100)
          }
        }
      });
    }

    if (firstAudio?.relativePath) {
      inputsMap.audio = firstAudio.relativePath;
      trackLabels.audio = firstAudio.name || 'audio';
      items.push({
        id: 'audio-1',
        type: 'audio',
        source: { ref: 'audio' },
        timeline: { start: 0 },
        layer: 0,
        audioMix: {
          gainDb: coerceNumber(DEFAULT_RENDER_PARAMS.audio.gainDb, 0),
          mute: Boolean(DEFAULT_RENDER_PARAMS.audio.mute)
        }
      });
    }

    if (firstSubtitle?.relativePath) {
      inputsMap.subtitle = firstSubtitle.relativePath;
      trackLabels.subtitle = firstSubtitle.name || 'subtitle';
      items.push({
        id: 'subtitle-1',
        type: 'subtitle',
        source: { ref: 'subtitle' },
        timeline: { start: 0 },
        layer: 0,
        subtitleStyle: {
          fontName: DEFAULT_RENDER_PARAMS.subtitle.fontName || 'Arial',
          fontSize: coerceNumber(DEFAULT_RENDER_PARAMS.subtitle.fontSize, 48),
          primaryColor: DEFAULT_RENDER_PARAMS.subtitle.primaryColor,
          outlineColor: DEFAULT_RENDER_PARAMS.subtitle.outlineColor,
          opacity: coerceNumber(DEFAULT_RENDER_PARAMS.subtitle.opacity, 100),
          bold: DEFAULT_RENDER_PARAMS.subtitle.bold === '1',
          italic: DEFAULT_RENDER_PARAMS.subtitle.italic === '1',
          spacing: 0,
          outline: coerceNumber(DEFAULT_RENDER_PARAMS.subtitle.outline, 2),
          shadow: coerceNumber(DEFAULT_RENDER_PARAMS.subtitle.shadow, 2),
          alignment: coerceNumber(DEFAULT_RENDER_PARAMS.subtitle.alignment, 2),
          marginL: coerceNumber(DEFAULT_RENDER_PARAMS.subtitle.marginL, 30),
          marginR: coerceNumber(DEFAULT_RENDER_PARAMS.subtitle.marginR, 30),
          marginV: coerceNumber(DEFAULT_RENDER_PARAMS.subtitle.marginV, 36),
          wrapStyle: 0,
          positionMode: DEFAULT_RENDER_PARAMS.subtitle.positionMode,
          positionX: coerceNumber(DEFAULT_RENDER_PARAMS.subtitle.positionX, 50),
          positionY: coerceNumber(DEFAULT_RENDER_PARAMS.subtitle.positionY, 50)
        }
      });
    }

    return {
      version: '2',
      timeline: {
        resolution: String(DEFAULT_RENDER_PARAMS.timeline.resolution),
        framerate: coerceNumber(DEFAULT_RENDER_PARAMS.timeline.framerate, 30) ?? 30,
        trackLabels,
        imageMatchDuration: {}
      },
      renderOptions: {
        codec: 'h264',
        preset: 'fast',
        crf: 21,
        gop: 0,
        tune: ''
      },
      inputsMap,
      items
    };
  }, [runPipelineProject?.files, DEFAULT_RENDER_PARAMS]);

  const openRenderTemplateEditor = (config: RenderConfigV2, name = '') => {
    setRenderTemplateNameDraft(name);
    setRenderTemplateJsonDraft(JSON.stringify(buildTemplateFromConfig(config), null, 2));
    setRenderTemplateEditorOpen(true);
  };

  const saveRenderTemplateDraft = async () => {
    let parsed: RenderConfigV2 | null = null;
    try {
      parsed = JSON.parse(renderTemplateJsonDraft) as RenderConfigV2;
    } catch {
      showToast('Template JSON không hợp lệ.', 'error');
      return;
    }
    if (!parsed || parsed.version !== '2' || !parsed.timeline || !Array.isArray(parsed.items) || !parsed.inputsMap) {
      showToast('Template thiếu cấu trúc Render V2.', 'error');
      return;
    }
    const name = renderTemplateNameDraft.trim() || `Render template ${renderTemplates.length + 1}`;
    try {
      const saved = await saveRenderTemplate({
        id: renderTemplateEditingId,
        name,
        config: parsed!
      });
      if (renderTemplateEditingId) {
        setRenderTemplates(prev => prev.map(t => (
          t.id === renderTemplateEditingId ? saved : t
        )));
      } else {
        setRenderTemplates(prev => ([saved, ...prev]));
      }
      setRenderTemplateEditingId(null);
      setRenderTemplateEditorOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save template';
      showToast(message, 'error');
    }
  };

  const applyRenderTemplate = (template: RenderTemplate, mapping: Record<string, string>) => {
    lastTemplateApplyAtRef.current = Date.now();
    const inputsMap: Record<string, string> = {};
    Object.entries(template.config.inputsMap).forEach(([key]) => {
      const fileId = mapping[key];
      const file = runPipelineProject?.files.find(f => f.id === fileId);
      if (file?.relativePath) inputsMap[key] = file.relativePath;
    });
    const nextConfig: RenderConfigV2 = {
      ...template.config,
      inputsMap
    };
    setRenderConfigV2Override(nextConfig);
    setRenderTrackLabels(template.config.timeline?.trackLabels ?? {});
    const imageMatchDurationRaw = template.config.timeline?.imageMatchDuration;
    let imageMatchDuration: Record<string, boolean> = {};
    if (typeof imageMatchDurationRaw === 'boolean') {
      // Backward compatibility: old templates had global boolean, convert to per-image
      const shouldMatch = imageMatchDurationRaw;
      imageMatchDuration = Object.fromEntries(
        Object.keys(template.config.inputsMap ?? {})
          .filter(key => key.startsWith('image'))
          .map(key => [key, shouldMatch])
      );
    } else if (imageMatchDurationRaw && typeof imageMatchDurationRaw === 'object') {
      imageMatchDuration = imageMatchDurationRaw as Record<string, boolean>;
    }
    setRenderImageMatchDuration(imageMatchDuration);
    const selectedIds = Object.values(mapping).filter(Boolean);
    setRenderInputFileIds(selectedIds);
    const imageIdsInOrder = Object.keys(template.config.inputsMap ?? {})
      .filter(key => key.startsWith('image'))
      .map(key => mapping[key])
      .filter((id): id is string => Boolean(id));
    if (imageIdsInOrder.length > 0) {
      setRenderImageOrderIds(imageIdsInOrder);
    }
    const selectedFiles = runPipelineProject?.files.filter(file => selectedIds.includes(file.id)) ?? [];
    const firstVideo = selectedFiles.find(file => file.type === 'video');
    const firstImage = selectedFiles.find(file => file.type === 'image');
    const firstAudio = selectedFiles.find(file => file.type === 'audio');
    const firstSubtitle = selectedFiles.find(file => file.type === 'subtitle');
    setRenderVideoId(firstVideo?.id ?? firstImage?.id ?? null);
    setRenderAudioId(firstAudio?.id ?? null);
    setRenderSubtitleId(firstSubtitle?.id ?? null);

    const firstVideoItem = template.config.items.find(item => item.type === 'video') ?? null;
    if (firstVideoItem) {
      const transform = firstVideoItem.transform ?? {};
      const crop = (transform.crop ?? {}) as { x?: number; y?: number; w?: number; h?: number };
      const mask = firstVideoItem.mask;
      const scalePercent = (() => {
        const raw = typeof transform.scale === 'number' ? transform.scale : 1;
        return Math.round(raw * 100);
      })();
      const maskLeft = mask ? mask.x : undefined;
      const maskTop = mask ? mask.y : undefined;
      const maskRight = mask ? Math.max(0, 100 - (mask.x + mask.w)) : undefined;
      const maskBottom = mask ? Math.max(0, 100 - (mask.y + mask.h)) : undefined;
      setRenderParams(prev => ({
        ...prev,
        timeline: {
          ...prev.timeline,
          framerate: String(template.config.timeline?.framerate ?? prev.timeline.framerate),
          resolution: String(template.config.timeline?.resolution ?? prev.timeline.resolution)
        },
        render: {
          ...prev.render,
          codec: (template.config.renderOptions?.codec ?? prev.render.codec) as string,
          preset: (template.config.renderOptions?.preset ?? prev.render.preset) as string,
          crf: String(template.config.renderOptions?.crf ?? prev.render.crf ?? '21'),
          gop: String(template.config.renderOptions?.gop ?? prev.render.gop ?? ''),
          tune: String(template.config.renderOptions?.tune ?? prev.render.tune ?? '')
        },
        video: {
          ...prev.video,
          fit: transform.fit ?? prev.video.fit,
          positionX: String(transform.x ?? prev.video.positionX),
          positionY: String(transform.y ?? prev.video.positionY),
          scale: String(scalePercent),
          rotation: String(transform.rotation ?? prev.video.rotation),
          opacity: String(transform.opacity ?? prev.video.opacity),
          cropX: String(crop.x ?? prev.video.cropX),
          cropY: String(crop.y ?? prev.video.cropY),
          cropW: String(crop.w ?? prev.video.cropW),
          cropH: String(crop.h ?? prev.video.cropH),
          maskType: mask ? mask.type : prev.video.maskType,
          maskLeft: maskLeft !== undefined ? String(maskLeft) : prev.video.maskLeft,
          maskRight: maskRight !== undefined ? String(maskRight) : prev.video.maskRight,
          maskTop: maskTop !== undefined ? String(maskTop) : prev.video.maskTop,
          maskBottom: maskBottom !== undefined ? String(maskBottom) : prev.video.maskBottom
        }
      }));
    }

    const videoItems = template.config.items.filter(item => item.type === 'video');
    if (videoItems.length > 0) {
      setRenderVideoTransforms(prev => {
        const next = { ...prev };
        videoItems.forEach(item => {
          const refKey = item.source?.ref;
          const targetId = refKey ? mapping[refKey] : null;
          if (!targetId) return;
          const blurEffects = normalizeItemEffects(item.effects) ?? [];
          next[targetId] = {
            ...(next[targetId] ?? {}),
            blurEffects
          };
        });
        return next;
      });
    }

    const imageItems = template.config.items.filter(item => item.type === 'image');
    if (imageItems.length > 0) {
      const imageIdsByRef = Object.keys(template.config.inputsMap ?? {})
        .filter(key => key.startsWith('image'))
        .map(key => mapping[key])
        .filter((id): id is string => Boolean(id));
      setRenderImageTransforms(prev => {
        const next = { ...prev };
        let fallbackIndex = 0;
        imageItems.forEach((item) => {
          const refKey = item.source?.ref;
          const targetId = refKey ? mapping[refKey] : imageIdsByRef[fallbackIndex++];
          if (!targetId) return;
          const transform = item.transform ?? {};
          const crop = (transform.crop ?? {}) as { x?: number; y?: number; w?: number; h?: number };
          const mask = item.mask;
          const scalePercent = (() => {
            const raw = typeof transform.scale === 'number' ? transform.scale : 1;
            return Math.round(raw * 100);
          })();
          const maskLeft = mask ? mask.x : undefined;
          const maskTop = mask ? mask.y : undefined;
          const maskRight = mask ? Math.max(0, 100 - (mask.x + mask.w)) : undefined;
          const maskBottom = mask ? Math.max(0, 100 - (mask.y + mask.h)) : undefined;
          const blurEffects = normalizeItemEffects(item.effects) ?? next[targetId]?.blurEffects;
          next[targetId] = {
            ...(next[targetId] ?? {}),
            x: String(transform.x ?? next[targetId]?.x ?? '50'),
            y: String(transform.y ?? next[targetId]?.y ?? '50'),
            scale: String(scalePercent),
            rotation: String(transform.rotation ?? next[targetId]?.rotation ?? '0'),
            opacity: String(transform.opacity ?? next[targetId]?.opacity ?? '100'),
            fit: transform.fit ?? next[targetId]?.fit ?? 'contain',
            cropX: String(crop.x ?? next[targetId]?.cropX ?? '0'),
            cropY: String(crop.y ?? next[targetId]?.cropY ?? '0'),
            cropW: String(crop.w ?? next[targetId]?.cropW ?? '100'),
            cropH: String(crop.h ?? next[targetId]?.cropH ?? '100'),
            maskType: mask ? mask.type : (next[targetId]?.maskType ?? 'none'),
            maskLeft: maskLeft !== undefined ? String(maskLeft) : (next[targetId]?.maskLeft ?? '0'),
            maskRight: maskRight !== undefined ? String(maskRight) : (next[targetId]?.maskRight ?? '0'),
            maskTop: maskTop !== undefined ? String(maskTop) : (next[targetId]?.maskTop ?? '0'),
            maskBottom: maskBottom !== undefined ? String(maskBottom) : (next[targetId]?.maskBottom ?? '0'),
            blurEffects
          };
        });
        return next;
      });
    }

    const textItem = template.config.items.find(item => item.type === 'text');
    if (textItem?.text) {
      const textData = textItem.text;
      const matchDuration = textData.matchDuration === '1';
      setRenderParams(prev => ({
        ...prev,
        text: {
          ...prev.text,
          singleText: textData.value ?? prev.text.singleText,
          singleTextStart: matchDuration ? '0' : String(textData.start ?? 0),
          singleTextEnd: matchDuration ? '' : String(textData.end ?? 0),
          singleTextMatchDuration: textData.matchDuration ?? '0'
        }
      }));
      setRenderTextTrackEnabled(true);
    }
  };

  const isRenderTemplateDirty = React.useMemo(() => {
    if (runPipelineRenderTemplateId === 'custom') return false;
    const template = renderTemplates.find(t => t.id === runPipelineRenderTemplateId);
    if (!template || !renderConfigPreview) return false;
    const normalized = buildTemplateFromConfig(renderConfigPreview);
    return JSON.stringify(normalized) !== JSON.stringify(template.config);
  }, [runPipelineRenderTemplateId, renderTemplates, renderConfigPreview]);
  const renderTemplateSelected = renderTemplates.find(t => t.id === runPipelineRenderTemplateId) ?? null;
  const renderTemplateDiffCurrentConfig = React.useMemo(() => {
    if (!renderConfigPreview) return null;
    return buildTemplateFromConfig(renderConfigPreview);
  }, [renderConfigPreview]);
  const renderTemplateDiffBaselineConfig = React.useMemo(() => {
    if (runPipelineRenderTemplateId === 'custom') {
      return buildTemplateFromConfig(buildDefaultRenderTemplateConfig());
    }
    if (!renderTemplateSelected) return null;
    return buildTemplateFromConfig(renderTemplateSelected.config);
  }, [runPipelineRenderTemplateId, renderTemplateSelected, buildDefaultRenderTemplateConfig]);
  const renderTemplateDiffBaselineLabel = runPipelineRenderTemplateId === 'custom'
    ? 'Default'
    : (renderTemplateSelected?.name ?? 'Template');

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

  const migrateRenderPresetToTemplate = () => {
    const config = buildRenderConfigV2();
    if (!config || !Array.isArray(config.items) || config.items.length === 0) {
      showToast('Select at least 1 file to build template.', 'warning');
      return;
    }
    setRenderTemplateEditingId(null);
    openRenderTemplateEditor(config, '');
  };

  const resetParamPresetsDb = () => {
    openConfirm(
      {
        title: 'Reset Param Presets?',
        description: 'This will delete all saved param presets and create a fresh empty presets database.',
        confirmLabel: 'Reset',
        variant: 'danger'
      },
      async () => {
        try {
          const response = await fetch('/api/param-presets/reset', { method: 'POST' });
          if (!response.ok) throw new Error('reset failed');
          await loadParamPresets();
          showToast('Param presets database reset.', 'success');
        } catch {
          showToast('Không thể reset param presets.', 'error');
        }
      }
    );
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

  const confirmModal = confirmState.open && (
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
  );

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
      return next;
    });
  }, [showRunPipeline, runPipelineHasDownload, runPipelineHasUvr, runPipelineHasTts, runPipelineHasRender, runPipelineId, paramPresets]);

  useEffect(() => {
    if (!runPipelineHasRender && showRenderStudio) {
      if (typeof window !== 'undefined' && window.location.pathname === renderStudioPath) {
        return;
      }
      setRenderStudioOpen(false);
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
      if (!authUser) return;
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
  }, [authUser]);

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
    if (!authUser) return;
    loadPipelines();
  }, [authUser]);

  useEffect(() => {
    if (!authUser) return;
    loadParamPresets();
  }, [authUser]);

  const loadJobs = async () => {
    try {
      const response = await fetch('/api/jobs');
      if (!response.ok) return;
      const data = await response.json() as { jobs: MediaJob[]; now?: string };
      setJobs(data.jobs ?? []);
      if (data.now) {
        const serverMs = new Date(data.now).getTime();
        if (Number.isFinite(serverMs)) {
          jobNowBaseRef.current = { serverMs, clientMs: Date.now() };
          setJobNowMs(serverMs);
        }
      }
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

  const openRenderStudioMediaBinContextMenu = (event: React.MouseEvent, file: VaultFile) => {
    event.preventDefault();
    event.stopPropagation();
    setRenderStudioMediaBinContextMenu({
      open: true,
      x: event.clientX,
      y: event.clientY,
      file
    });
  };

  const closeRenderStudioMediaBinContextMenu = () => {
    setRenderStudioMediaBinContextMenu(prev => ({ ...prev, open: false, file: null }));
  };

  const openRenderStudioTimelineContextMenu = (
    event: React.MouseEvent,
    track: { type: 'video' | 'audio' | 'subtitle' | 'image' | 'text' | 'effect'; id?: string; index?: number }
  ) => {
    event.preventDefault();
    event.stopPropagation();
    setRenderStudioTimelineContextMenu({
      open: true,
      x: event.clientX,
      y: event.clientY,
      track
    });
  };

  const closeRenderStudioTimelineContextMenu = () => {
    setRenderStudioTimelineContextMenu(prev => ({ ...prev, open: false, track: null }));
  };

  const addRenderStudioFileToTimeline = (file: VaultFile) => {
    if (!file || !file.id) return;
    if (file.type !== 'video' && file.type !== 'audio' && file.type !== 'subtitle' && file.type !== 'image') return;
    setRenderInputFileIds(prev => (prev.includes(file.id) ? prev : [...prev, file.id]));
    if (file.type === 'video') {
      setRenderVideoId(file.id);
      setRenderStudioFocus('timeline');
      setRenderStudioItemType(null);
    }
    if (file.type === 'audio') {
      setRenderAudioId(file.id);
      setRenderStudioFocus('timeline');
      setRenderStudioItemType(null);
    }
    if (file.type === 'subtitle') {
      setRenderSubtitleId(file.id);
      setRenderStudioFocus('timeline');
      setRenderStudioItemType(null);
    }
  };

  const removeRenderStudioTrackFromTimeline = (track: { type: 'video' | 'audio' | 'subtitle' | 'image' | 'text' | 'effect'; id?: string; index?: number }) => {
    if (!track) return;
    if (!runPipelineProject) return;
    if (track.type === 'text') {
      setRenderTextTrackEnabled(false);
      setRenderParams(prev => ({
        ...prev,
        text: {
          ...prev.text,
          singleText: '',
          singleTextStart: '0',
          singleTextEnd: '',
          singleTextMatchDuration: '0'
        }
      }));
      setRenderStudioFocus('timeline');
      setRenderStudioItemType(null);
      return;
    }
    const targetId =
      track.type === 'image'
        ? track.id
        : track.type === 'video'
          ? renderVideoId
          : track.type === 'audio'
            ? renderAudioId
            : renderSubtitleId;
    if (!targetId) return;
    const nextIds = renderInputFileIds.filter(id => id !== targetId);
    setRenderInputFileIds(nextIds);

    if (track.type === 'video') {
      const nextVideo = runPipelineProject.files.find(file => (
        file.type === 'video' && nextIds.includes(file.id)
      ));
      setRenderVideoId(nextVideo?.id ?? null);
    }
    if (track.type === 'audio') {
      const nextAudio = runPipelineProject.files.find(file => (
        file.type === 'audio' && nextIds.includes(file.id)
      ));
      setRenderAudioId(nextAudio?.id ?? null);
    }
    if (track.type === 'subtitle') {
      const nextSubtitle = runPipelineProject.files.find(file => (
        file.type === 'subtitle' && nextIds.includes(file.id)
      ));
      setRenderSubtitleId(nextSubtitle?.id ?? null);
    }
    setRenderStudioFocus('timeline');
    setRenderStudioItemType(null);
  };

  const resolveRenderStudioTimelineTrackFile = (
    track: { type: 'video' | 'audio' | 'subtitle' | 'image' | 'text' | 'effect'; id?: string; index?: number } | null
  ): VaultFile | null => {
    if (!track || !runPipelineProject) return null;
    let targetId: string | null = null;
    if (track.type === 'video') targetId = renderVideoId;
    else if (track.type === 'audio') targetId = renderAudioId;
    else if (track.type === 'subtitle') targetId = renderSubtitleId;
    else if (track.type === 'image') targetId = track.id ?? null;
    if (!targetId) return null;
    return runPipelineProject.files.find(file => file.id === targetId) ?? null;
  };

  const previewRenderStudioMediaBinFile = (file: VaultFile) => {
    if (!file || !file.id) return;
    if (file.type === 'video') {
      setRenderVideoId(file.id);
      setRenderStudioItemType('video');
      setRenderStudioPreviewFileId(file.id);
    } else if (file.type === 'audio') {
      setRenderAudioId(file.id);
      setRenderStudioItemType('audio');
      setRenderStudioPreviewFileId(file.id);
    } else if (file.type === 'subtitle') {
      setRenderSubtitleId(file.id);
      setRenderStudioItemType('subtitle');
      setRenderStudioPreviewFileId(file.id);
    } else if (file.type === 'image') {
      setRenderStudioItemType('image');
      setRenderStudioPreviewFileId(file.id);
    } else {
      return;
    }
    setRenderStudioFocus('item');
  };

  const previewRenderStudioTimelineTrack = (
    track: { type: 'video' | 'audio' | 'subtitle' | 'image' | 'text' | 'effect'; id?: string; index?: number } | null
  ) => {
    const file = resolveRenderStudioTimelineTrackFile(track);
    if (!file) return;
    previewRenderStudioMediaBinFile(file);
  };

  const performDeleteVaultFile = async (file: VaultFile) => {
    if (!file?.relativePath) return;
    try {
      const response = await fetch('/api/vault/file', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ relativePath: file.relativePath })
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `Delete failed (${response.status})`);
      }
      showToast(`Deleted ${file.name}`, 'success');
      setRenderInputFileIds(prev => prev.filter(id => id !== file.id));
      setRenderImageOrderIds(prev => prev.filter(id => id !== file.id));
      if (renderVideoId === file.id) setRenderVideoId(null);
      if (renderAudioId === file.id) setRenderAudioId(null);
      if (renderSubtitleId === file.id) setRenderSubtitleId(null);
      if (renderStudioPreviewFileId === file.id) {
        setRenderStudioPreviewFileId(null);
        setRenderStudioFocus('timeline');
        setRenderStudioItemType(null);
      }
      await loadVault();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to delete file';
      showToast(message, 'error');
    }
  };

  const renderStudioContextMenus = (
    <>
      {renderStudioMediaBinContextMenu.open && renderStudioMediaBinContextMenu.file && (
        <div className="fixed inset-0 z-[70]" onClick={closeRenderStudioMediaBinContextMenu}>
          <div
            className="absolute rounded-lg border border-zinc-800 bg-zinc-950 shadow-2xl p-1 w-max max-w-[220px]"
            style={{ top: renderStudioMediaBinContextMenu.y, left: renderStudioMediaBinContextMenu.x }}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="w-full px-3 py-2 text-left text-xs text-zinc-200 hover:bg-zinc-900 rounded-md"
              onClick={() => {
                previewRenderStudioMediaBinFile(renderStudioMediaBinContextMenu.file as VaultFile);
                closeRenderStudioMediaBinContextMenu();
              }}
            >
              <span className="flex items-center gap-2">
                <MousePointer2 size={12} />
                Preview file
              </span>
            </button>
            {!renderInputFileIds.includes(renderStudioMediaBinContextMenu.file.id) && (
              <button
                className="w-full px-3 py-2 text-left text-xs text-zinc-200 hover:bg-zinc-900 rounded-md"
                onClick={() => {
                  addRenderStudioFileToTimeline(renderStudioMediaBinContextMenu.file as VaultFile);
                  closeRenderStudioMediaBinContextMenu();
                }}
              >
                <span className="flex items-center gap-2">
                  <Plus size={12} />
                  Add to timeline
                </span>
              </button>
            )}
            {renderInputFileIds.includes(renderStudioMediaBinContextMenu.file.id) && (
              <div className="px-3 py-2 text-left text-xs text-zinc-500 flex items-center gap-2">
                <CheckCircle2 size={12} />
                Already in timeline
              </div>
            )}
            <button
              className="w-full px-3 py-2 text-left text-xs text-zinc-200 hover:bg-zinc-900 rounded-md"
              onClick={() => {
                const target = renderStudioMediaBinContextMenu.file as VaultFile;
                closeRenderStudioMediaBinContextMenu();
                downloadVaultFile(target);
              }}
            >
              <span className="flex items-center gap-2">
                <Download size={12} />
                Download
              </span>
            </button>
            <button
              className="w-full px-3 py-2 text-left text-xs text-red-300 hover:bg-red-500/10 rounded-md"
              onClick={() => {
                const target = renderStudioMediaBinContextMenu.file as VaultFile;
                closeRenderStudioMediaBinContextMenu();
                openConfirm(
                  {
                    title: `Delete "${target.name}"?`,
                    description: 'This will remove the file from the project and Media Vault.',
                    confirmLabel: 'Delete',
                    variant: 'danger'
                  },
                  () => performDeleteVaultFile(target)
                );
              }}
            >
              <span className="flex items-center gap-2">
                <Trash2 size={12} />
                Delete from project
              </span>
            </button>
          </div>
        </div>
      )}

      {renderStudioTimelineContextMenu.open && renderStudioTimelineContextMenu.track && (
        <div className="fixed inset-0 z-[70]" onClick={closeRenderStudioTimelineContextMenu}>
          <div
            className="absolute rounded-lg border border-zinc-800 bg-zinc-950 shadow-2xl p-1 min-w-[190px]"
            style={{ top: renderStudioTimelineContextMenu.y, left: renderStudioTimelineContextMenu.x }}
            onClick={(event) => event.stopPropagation()}
          >
            {resolveRenderStudioTimelineTrackFile(renderStudioTimelineContextMenu.track) && (
              <button
                className="w-full px-3 py-2 text-left text-xs text-zinc-200 hover:bg-zinc-900 rounded-md"
                onClick={() => {
                  previewRenderStudioTimelineTrack(renderStudioTimelineContextMenu.track);
                  closeRenderStudioTimelineContextMenu();
                }}
              >
                <span className="flex items-center gap-2">
                  <MousePointer2 size={12} />
                  Preview
                </span>
              </button>
            )}
            <button
              className="w-full px-3 py-2 text-left text-xs text-red-300 hover:bg-red-500/10 rounded-md"
              onClick={() => {
                removeRenderStudioTrackFromTimeline(renderStudioTimelineContextMenu.track as {
                  type: 'video' | 'audio' | 'subtitle' | 'image' | 'text' | 'effect';
                  id?: string;
                  index?: number;
                });
                closeRenderStudioTimelineContextMenu();
              }}
            >
              <span className="flex items-center gap-2">
                <Trash2 size={12} />
                Remove from timeline
              </span>
            </button>
          </div>
        </div>
      )}
    </>
  );

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
    const inputPaths = Array.isArray(jobParams.inputPaths)
      ? jobParams.inputPaths.filter((value: unknown) => typeof value === 'string')
      : [];
    const inputRelativePath = inputPaths[0]
      ?? (typeof jobParams.inputRelativePath === 'string'
        ? jobParams.inputRelativePath
        : (typeof jobAny.__inputRelativePath === 'string' ? jobAny.__inputRelativePath : ''));
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

    const renderMeta = jobParams.render ?? {};
    if (projectMatch) {
      const renderInputPaths = Array.isArray(renderMeta.inputPaths)
        ? renderMeta.inputPaths.filter((value: unknown) => typeof value === 'string')
        : [];
      if (renderInputPaths.length > 0) {
        const nextIds = renderInputPaths
          .map(path => projectMatch?.files.find(file => file.relativePath === path)?.id)
          .filter((value): value is string => Boolean(value));
        setRenderInputFileIds(nextIds);
      } else {
        setRenderInputFileIds([]);
      }

      const renderVideoPath = typeof renderMeta.videoPath === 'string' ? renderMeta.videoPath : undefined;
      const renderAudioPath = typeof renderMeta.audioPath === 'string' ? renderMeta.audioPath : undefined;
      const renderSubtitlePath = typeof renderMeta.subtitlePath === 'string' ? renderMeta.subtitlePath : undefined;
      if (renderVideoPath) {
        const match = projectMatch.files.find(file => file.relativePath === renderVideoPath);
        if (match) setRenderVideoId(match.id);
      }
      if (renderAudioPath) {
        const match = projectMatch.files.find(file => file.relativePath === renderAudioPath);
        if (match) setRenderAudioId(match.id);
      }
      if (renderSubtitlePath) {
        const match = projectMatch.files.find(file => file.relativePath === renderSubtitlePath);
        if (match) setRenderSubtitleId(match.id);
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
    if (typeof window === 'undefined') return;
    if (newJobDraftLoadedRef.current) return;
    newJobDraftLoadedRef.current = true;
    try {
      const raw = window.localStorage.getItem(NEW_JOB_POPUP_DRAFT_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as NewJobPopupDraft;
      if (!parsed || parsed.version !== 1) return;
      newJobDraftPendingRef.current = parsed;
      newJobDraftAppliedRef.current = false;
    } catch {
      newJobDraftPendingRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!showRunPipeline) {
      newJobDraftAppliedRef.current = false;
      return;
    }
    if (newJobDraftAppliedRef.current) return;
    const draft = newJobDraftPendingRef.current;
    if (!draft) {
      newJobDraftAppliedRef.current = true;
      return;
    }

    if (draft.pipelineId && pipelineLibrary.some(item => item.id === draft.pipelineId) && runPipelineId !== draft.pipelineId) {
      setRunPipelineId(draft.pipelineId);
    }

    const resolvedProject = (
      (draft.projectId && vaultFolders.find(folder => folder.id === draft.projectId))
      || (draft.projectName
        ? vaultFolders.find(folder => folder.name.toLowerCase() === String(draft.projectName).trim().toLowerCase())
        : undefined)
      || null
    );
    if (resolvedProject && runPipelineProjectId !== resolvedProject.id) {
      setRunPipelineProjectId(resolvedProject.id);
    }
    if (draft.projectName && runPipelineHasDownload && downloadProjectName !== draft.projectName) {
      setDownloadProjectName(draft.projectName);
    }

    if (draft.runPipelineRenderTemplateId) {
      const templateId = draft.runPipelineRenderTemplateId;
      if (templateId === 'custom' || renderTemplates.some(template => template.id === templateId)) {
        if (runPipelineRenderTemplateId !== templateId) {
          setRunPipelineRenderTemplateId(templateId);
        }
      }
    }

    if (draft.runPipelineTaskTemplate && Object.keys(draft.runPipelineTaskTemplate).length > 0) {
      setRunPipelineTaskTemplate(prev => ({ ...prev, ...draft.runPipelineTaskTemplate }));
    }

    if (draft.renderTemplateApplyMapById && Object.keys(draft.renderTemplateApplyMapById).length > 0) {
      setRenderTemplateApplyMapById(prev => ({ ...prev, ...draft.renderTemplateApplyMapById }));
    }

    const targetProject = resolvedProject ?? runPipelineProject ?? null;
    const validFileIds = new Set((targetProject?.files ?? []).map(file => file.id));
    const projectReadyForDraft = Boolean(targetProject) || (!vaultLoading && hasLoadedOnce);

    if (targetProject) {
      if (draft.runPipelineInputId && validFileIds.has(draft.runPipelineInputId) && runPipelineInputId !== draft.runPipelineInputId) {
        setRunPipelineInputId(draft.runPipelineInputId);
      }

      if (Array.isArray(draft.renderInputFileIds)) {
        const filtered = draft.renderInputFileIds.filter(id => validFileIds.has(id));
        if (filtered.length > 0) {
          setRenderInputFileIds(filtered);
        }
      }

      if (draft.renderTemplateApplyMap && Object.keys(draft.renderTemplateApplyMap).length > 0) {
        const filteredMap = Object.fromEntries(
          Object.entries(draft.renderTemplateApplyMap).filter(([, fileId]) => validFileIds.has(fileId))
        );
        if (Object.keys(filteredMap).length > 0) {
          setRenderTemplateApplyMap(filteredMap);
        }
      }
    }

    if (projectReadyForDraft) {
      newJobDraftPendingRef.current = null;
      newJobDraftAppliedRef.current = true;
    }
  }, [
    showRunPipeline,
    pipelineLibrary,
    runPipelineId,
    vaultFolders,
    runPipelineProjectId,
    runPipelineProject,
    runPipelineHasDownload,
    downloadProjectName,
    runPipelineRenderTemplateId,
    renderTemplates,
    runPipelineInputId,
    vaultLoading,
    hasLoadedOnce
  ]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!showRunPipeline) return;
    const draft: NewJobPopupDraft = {
      version: 1,
      projectId: runPipelineProjectId ?? null,
      projectName: runPipelineHasDownload
        ? (downloadProjectName || runPipelineProject?.name || null)
        : (runPipelineProject?.name ?? null),
      pipelineId: runPipelineId ?? null,
      runPipelineRenderTemplateId,
      runPipelineTaskTemplate,
      runPipelineInputId: runPipelineInputId ?? null,
      renderInputFileIds,
      renderTemplateApplyMap,
      renderTemplateApplyMapById
    };
    try {
      window.localStorage.setItem(NEW_JOB_POPUP_DRAFT_STORAGE_KEY, JSON.stringify(draft));
    } catch {
      // ignore storage errors
    }
  }, [
    showRunPipeline,
    runPipelineProjectId,
    runPipelineProject?.name,
    runPipelineHasDownload,
    downloadProjectName,
    runPipelineId,
    runPipelineRenderTemplateId,
    runPipelineTaskTemplate,
    runPipelineInputId,
    renderInputFileIds,
    renderTemplateApplyMap,
    renderTemplateApplyMapById
  ]);

  useEffect(() => {
    if (!authUser) return;
    loadJobs();
    const interval = window.setInterval(loadJobs, 3000);
    return () => window.clearInterval(interval);
  }, [authUser]);

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
    if (!authUser) return;
    if (runPipelineId) {
      loadPipelineDetail(runPipelineId);
    }
  }, [runPipelineId, authUser]);


  useEffect(() => {
    if (!selectedFolder) return;
    const currentInput = selectedFolder.files.find(file => file.id === runPipelineInputId);
    const currentInputValid = Boolean(
      currentInput
      && (runPipelineHasTts ? currentInput.type === 'subtitle' : (currentInput.type === 'video' || currentInput.type === 'audio'))
    );
    if (currentInputValid) return;
    const firstInput = runPipelineHasTts
      ? selectedFolder.files.find(file => file.type === 'subtitle')
      : selectedFolder.files.find(file => file.type === 'video' || file.type === 'audio');
    setRunPipelineInputId(firstInput?.id ?? null);
  }, [selectedFolder?.id, runPipelineHasTts, runPipelineInputId]);

  useEffect(() => {
    let active = true;
    const loadRenderTemplates = async () => {
      if (!authUser) return;
      try {
        const response = await fetch('/api/render-templates');
        if (!response.ok) throw new Error('Unable to load templates');
        const data = await response.json();
        if (!active) return;
        if (Array.isArray(data?.templates)) {
          setRenderTemplates(data.templates as RenderTemplate[]);
        }
      } catch {
        if (!active) return;
        showToast('Không thể tải render templates.', 'error');
      }
    };
    const loadTaskTemplates = async () => {
      if (!authUser) return;
      try {
        const response = await fetch('/api/task-templates');
        if (!response.ok) throw new Error('Unable to load task templates');
        const data = await response.json();
        if (!active) return;
        if (Array.isArray(data?.templates)) {
          setTaskTemplates(data.templates as TaskTemplate[]);
        }
      } catch {
        if (!active) return;
        showToast('Không thể tải task templates.', 'error');
      }
    };
    loadRenderTemplates();
    loadTaskTemplates();
    return () => {
      active = false;
    };
  }, [authUser]);

  useEffect(() => {
    if (!runPipelineProject) return;
    const currentInput = runPipelineProject.files.find(file => file.id === runPipelineInputId);
    const currentInputValid = Boolean(
      currentInput
      && (runPipelineHasTts ? currentInput.type === 'subtitle' : (currentInput.type === 'video' || currentInput.type === 'audio'))
    );
    if (currentInputValid) return;
    const firstInput = runPipelineHasTts
      ? runPipelineProject.files.find(file => file.type === 'subtitle')
      : runPipelineProject.files.find(file => file.type === 'video' || file.type === 'audio');
    setRunPipelineInputId(firstInput?.id ?? null);
  }, [runPipelineProject?.id, runPipelineHasTts, runPipelineInputId]);

  useEffect(() => {
    if (!runPipelineProject || !runPipelineHasRender) return;
    if (runPipelineRenderTemplateId !== 'custom') return;
    const projectId = runPipelineProject.id;
    const projectChanged = lastRenderProjectIdRef.current !== projectId;
    lastRenderProjectIdRef.current = projectId;
    if (!projectChanged) {
      const hasExistingSelection = (
        renderInputFileIds.length > 0
        || Boolean(renderVideoId)
        || Boolean(renderAudioId)
        || Boolean(renderSubtitleId)
        || renderImageOrderIds.length > 0
      );
      if (hasExistingSelection) return;
    }
    const firstVideo = runPipelineProject.files.find(file => file.type === 'video');
    const firstAudio = runPipelineProject.files.find(file => file.type === 'audio');
    const firstSubtitle = runPipelineProject.files.find(file => file.type === 'subtitle');
    const imageIds = runPipelineProject.files.filter(file => file.type === 'image').map(file => file.id);
    setRenderVideoId(firstVideo?.id ?? null);
    setRenderAudioId(firstAudio?.id ?? null);
    setRenderSubtitleId(firstSubtitle?.id ?? null);
    setRenderInputFileIds(
      [firstVideo?.id, firstAudio?.id, firstSubtitle?.id].filter(Boolean) as string[]
    );
    setRenderImageOrderIds(imageIds);
  }, [runPipelineProject?.id, runPipelineHasRender, runPipelineRenderTemplateId]);

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

  useEffect(() => {
    if (!runPipelineProject) return;
    const selectedImages = renderInputFileIds
      .map(id => runPipelineProject.files.find(file => file.id === id))
      .filter((file): file is NonNullable<typeof file> => Boolean(file))
      .filter(file => file.type === 'image')
      .map(file => file.id);
    setRenderImageOrderIds(prev => {
      const keep = prev.filter(id => selectedImages.includes(id));
      const add = selectedImages.filter(id => !keep.includes(id));
      return [...keep, ...add];
    });
    setRenderImageTransforms(prev => {
      const next: Record<string, any> = {};
      selectedImages.forEach(id => {
        const existing = prev[id] ?? {};
        let maskLeft = existing.maskLeft;
        let maskRight = existing.maskRight;
        let maskTop = existing.maskTop;
        let maskBottom = existing.maskBottom;
        if (
          maskLeft === undefined
          && maskRight === undefined
          && maskTop === undefined
          && maskBottom === undefined
          && (existing as any).maskX !== undefined
        ) {
          const x = coerceNumber((existing as any).maskX, 0) ?? 0;
          const y = coerceNumber((existing as any).maskY, 0) ?? 0;
          const w = coerceNumber((existing as any).maskW, 100) ?? 100;
          const h = coerceNumber((existing as any).maskH, 100) ?? 100;
          maskLeft = String(Math.max(0, Math.min(100, x)));
          maskTop = String(Math.max(0, Math.min(100, y)));
          maskRight = String(Math.max(0, Math.min(100, 100 - x - w)));
          maskBottom = String(Math.max(0, Math.min(100, 100 - y - h)));
        }
        const scaleValue = coerceNumber(existing.scale, null);
        const scalePercent = scaleValue !== null && scaleValue !== undefined && scaleValue <= 2
          ? String(scaleValue * 100)
          : (existing.scale ?? '100');
        next[id] = {
          x: existing.x ?? '50',
          y: existing.y ?? '50',
          scale: scalePercent,
          rotation: existing.rotation ?? '0',
          opacity: existing.opacity ?? '100',
          fit: existing.fit ?? 'contain',
          cropX: existing.cropX ?? '0',
          cropY: existing.cropY ?? '0',
          cropW: existing.cropW ?? '100',
          cropH: existing.cropH ?? '100',
          maskType: existing.maskType ?? 'none',
          maskLeft: maskLeft ?? '0',
          maskRight: maskRight ?? '0',
          maskTop: maskTop ?? '0',
          maskBottom: maskBottom ?? '0',
          blurEffects: existing.blurEffects
        };
      });
      return next;
    });
  }, [renderInputFileIds, runPipelineProject?.id]);

  useEffect(() => {
    if (!renderConfigV2Override || !runPipelineProject) return;
    if (lastRenderConfigSyncRef.current === renderConfigV2Override) return;
    lastRenderConfigSyncRef.current = renderConfigV2Override;
    const inputsMap = renderConfigV2Override.inputsMap ?? {};
    const fileByPath = new Map<string, VaultFile>(
      runPipelineProject.files
        .filter(file => Boolean(file.relativePath))
        .map(file => [file.relativePath!, file])
    );
    const imageIdsByRef = Object.keys(inputsMap)
      .filter(key => key.startsWith('image'))
      .map(key => inputsMap[key])
      .filter((value): value is string => Boolean(value))
      .map(pathValue => fileByPath.get(pathValue)?.id)
      .filter((id): id is string => Boolean(id));
    if (imageIdsByRef.length > 0) {
      setRenderImageOrderIds(imageIdsByRef);
    }
    const trackLabels = renderConfigV2Override.timeline?.trackLabels;
    if (trackLabels && typeof trackLabels === 'object') {
      setRenderTrackLabels(trackLabels);
    }
    const nextTransforms: Record<string, any> = {};
    const nextImageDurations: Record<string, string> = {};
    const items = renderConfigV2Override.items ?? [];
    const firstVideoItem = items.find(item => item.type === 'video') ?? null;
    const firstAudioItem = items.find(item => item.type === 'audio') ?? null;
    const firstSubtitleItem = items.find(item => item.type === 'subtitle') ?? null;
    const firstTextItem = items.find(item => item.type === 'text') ?? null;
    (renderConfigV2Override.items ?? []).forEach(item => {
      if (item.type !== 'image') return;
      const refKey = item.source?.ref;
      const pathValue = refKey ? inputsMap[refKey] : undefined;
      const fileId = pathValue ? (fileByPath.get(pathValue) as VaultFile | undefined)?.id : null;
      if (!fileId) return;
      const transform = item.transform ?? {};
      const crop = (transform.crop ?? {}) as { x?: number; y?: number; w?: number; h?: number };
      const mask = item.mask;
      const scalePercent = (() => {
        const raw = typeof transform.scale === 'number' ? transform.scale : 1;
        return Math.round(raw * 100);
      })();
      const maskLeft = mask ? mask.x : undefined;
      const maskTop = mask ? mask.y : undefined;
      const maskRight = mask ? Math.max(0, 100 - (mask.x + mask.w)) : undefined;
      const maskBottom = mask ? Math.max(0, 100 - (mask.y + mask.h)) : undefined;
      const blurEffects = normalizeItemEffects(item.effects);
      nextTransforms[fileId] = {
        x: String(transform.x ?? '50'),
        y: String(transform.y ?? '50'),
        scale: String(scalePercent),
        rotation: String(transform.rotation ?? '0'),
        opacity: String(transform.opacity ?? '100'),
        fit: transform.fit ?? 'contain',
        cropX: String(crop.x ?? '0'),
        cropY: String(crop.y ?? '0'),
        cropW: String(crop.w ?? '100'),
        cropH: String(crop.h ?? '100'),
        maskType: mask ? mask.type : 'none',
        maskLeft: maskLeft !== undefined ? String(maskLeft) : '0',
        maskRight: maskRight !== undefined ? String(maskRight) : '0',
        maskTop: maskTop !== undefined ? String(maskTop) : '0',
        maskBottom: maskBottom !== undefined ? String(maskBottom) : '0',
        blurEffects: blurEffects ?? undefined
      };
      const durationValue = item.timeline?.duration;
      if (typeof durationValue === 'number' && Number.isFinite(durationValue)) {
        nextImageDurations[fileId] = String(durationValue);
      }
    });
    if (Object.keys(nextTransforms).length > 0) {
      setRenderImageTransforms(prev => ({ ...prev, ...nextTransforms }));
    }
    if (Object.keys(nextImageDurations).length > 0) {
      setRenderImageDurations(prev => ({ ...prev, ...nextImageDurations }));
    }
    if (firstVideoItem) {
      const transform = firstVideoItem.transform ?? {};
      const crop = (transform.crop ?? {}) as { x?: number; y?: number; w?: number; h?: number };
      const mask = firstVideoItem.mask;
      const scalePercent = (() => {
        const raw = typeof transform.scale === 'number' ? transform.scale : 1;
        return Math.round(raw * 100);
      })();
      const maskLeft = mask ? mask.x : undefined;
      const maskTop = mask ? mask.y : undefined;
      const maskRight = mask ? Math.max(0, 100 - (mask.x + mask.w)) : undefined;
      const maskBottom = mask ? Math.max(0, 100 - (mask.y + mask.h)) : undefined;
      setRenderParams(prev => ({
        ...prev,
        timeline: {
          ...prev.timeline,
          framerate: String(renderConfigV2Override.timeline?.framerate ?? prev.timeline.framerate),
          resolution: String(renderConfigV2Override.timeline?.resolution ?? prev.timeline.resolution)
        },
        render: {
          ...prev.render,
          codec: (renderConfigV2Override.renderOptions?.codec ?? prev.render.codec) as string,
          preset: (renderConfigV2Override.renderOptions?.preset ?? prev.render.preset) as string,
          crf: String(renderConfigV2Override.renderOptions?.crf ?? prev.render.crf ?? '21'),
          gop: String(renderConfigV2Override.renderOptions?.gop ?? prev.render.gop ?? ''),
          tune: String(renderConfigV2Override.renderOptions?.tune ?? prev.render.tune ?? '')
        },
        video: {
          ...prev.video,
          fit: transform.fit ?? prev.video.fit,
          positionX: String(transform.x ?? prev.video.positionX),
          positionY: String(transform.y ?? prev.video.positionY),
          scale: String(scalePercent),
          rotation: String(transform.rotation ?? prev.video.rotation),
          opacity: String(transform.opacity ?? prev.video.opacity),
          cropX: String(crop.x ?? prev.video.cropX),
          cropY: String(crop.y ?? prev.video.cropY),
          cropW: String(crop.w ?? prev.video.cropW),
          cropH: String(crop.h ?? prev.video.cropH),
          maskType: mask ? mask.type : prev.video.maskType,
          maskLeft: maskLeft !== undefined ? String(maskLeft) : prev.video.maskLeft,
          maskRight: maskRight !== undefined ? String(maskRight) : prev.video.maskRight,
          maskTop: maskTop !== undefined ? String(maskTop) : prev.video.maskTop,
          maskBottom: maskBottom !== undefined ? String(maskBottom) : prev.video.maskBottom
        }
      }));
      const videoBlurEffects = normalizeItemEffects(firstVideoItem.effects);
      if (videoBlurEffects && renderVideoId) {
        setRenderVideoTransforms(prev => ({
          ...prev,
          [renderVideoId]: {
            ...(prev[renderVideoId] ?? {}),
            blurEffects: videoBlurEffects
          }
        }));
      }
    } else {
      setRenderParams(prev => ({
        ...prev,
        timeline: {
          ...prev.timeline,
          framerate: String(renderConfigV2Override.timeline?.framerate ?? prev.timeline.framerate),
          resolution: String(renderConfigV2Override.timeline?.resolution ?? prev.timeline.resolution)
        },
        render: {
          ...prev.render,
          codec: (renderConfigV2Override.renderOptions?.codec ?? prev.render.codec) as string,
          preset: (renderConfigV2Override.renderOptions?.preset ?? prev.render.preset) as string,
          crf: String(renderConfigV2Override.renderOptions?.crf ?? prev.render.crf ?? '21'),
          gop: String(renderConfigV2Override.renderOptions?.gop ?? prev.render.gop ?? ''),
          tune: String(renderConfigV2Override.renderOptions?.tune ?? prev.render.tune ?? '')
        }
      }));
    }
    if (firstAudioItem?.audioMix) {
      setRenderParams(prev => ({
        ...prev,
        audio: {
          ...prev.audio,
          gainDb: String(firstAudioItem.audioMix?.gainDb ?? prev.audio.gainDb),
          mute: Boolean(firstAudioItem.audioMix?.mute ?? prev.audio.mute)
        }
      }));
    }
    if (firstSubtitleItem?.subtitleStyle) {
      const style = firstSubtitleItem.subtitleStyle as Record<string, any>;
      setRenderParams(prev => ({
        ...prev,
        subtitle: {
          ...prev.subtitle,
          fontName: style.fontName ?? prev.subtitle.fontName,
          fontSize: style.fontSize !== undefined ? String(style.fontSize) : prev.subtitle.fontSize,
          primaryColor: style.primaryColor ?? prev.subtitle.primaryColor,
          outlineColor: style.outlineColor ?? prev.subtitle.outlineColor,
          opacity: style.opacity !== undefined ? String(style.opacity) : prev.subtitle.opacity,
          bold: style.bold === true || style.bold === '1' ? '1' : (style.bold === false ? '0' : prev.subtitle.bold),
          italic: style.italic === true || style.italic === '1' ? '1' : (style.italic === false ? '0' : prev.subtitle.italic),
          spacing: style.spacing !== undefined ? String(style.spacing) : prev.subtitle.spacing,
          outline: style.outline !== undefined ? String(style.outline) : prev.subtitle.outline,
          shadow: style.shadow !== undefined ? String(style.shadow) : prev.subtitle.shadow,
          alignment: style.alignment !== undefined ? String(style.alignment) : prev.subtitle.alignment,
          marginL: style.marginL !== undefined ? String(style.marginL) : prev.subtitle.marginL,
          marginR: style.marginR !== undefined ? String(style.marginR) : prev.subtitle.marginR,
          marginV: style.marginV !== undefined ? String(style.marginV) : prev.subtitle.marginV,
          wrapStyle: style.wrapStyle !== undefined ? String(style.wrapStyle) : prev.subtitle.wrapStyle
        }
      }));
    }
    if (firstTextItem?.text) {
      const text = firstTextItem.text;
      const start = typeof text.start === 'number' ? text.start : 0;
      const end = typeof text.end === 'number'
        ? text.end
        : (typeof firstTextItem.timeline?.duration === 'number' ? start + firstTextItem.timeline.duration : start + 5);
      setRenderTextTrackEnabled(true);
      setRenderParams(prev => ({
        ...prev,
        text: {
          ...prev.text,
          singleText: text.value ?? prev.text.singleText,
          singleTextStart: String(start),
          singleTextEnd: String(end)
        }
      }));
    }
    if (firstTextItem?.subtitleStyle) {
      const style = firstTextItem.subtitleStyle as Record<string, any>;
      const autoMoveInterval = coerceNumber(style.autoMoveInterval, undefined);
      const autoMovePositionsRaw = Array.isArray(style.autoMovePositions) ? style.autoMovePositions : [];
      const autoMovePositions = autoMovePositionsRaw
        .map(entry => {
          if (!entry) return null;
          if (Array.isArray(entry)) {
            if (entry.length < 2) return null;
            const x = coerceNumber(entry[0], NaN);
            const y = coerceNumber(entry[1], NaN);
            if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
            return `${x},${y}`;
          }
          if (typeof entry === 'object') {
            const obj = entry as Record<string, unknown>;
            const x = coerceNumber(obj.x as string | number | null | undefined, NaN);
            const y = coerceNumber(obj.y as string | number | null | undefined, NaN);
            if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
            return `${x},${y}`;
          }
          return null;
        })
        .filter(Boolean)
        .join('\n');
      setRenderParams(prev => ({
        ...prev,
        text: {
          ...prev.text,
          fontName: style.fontName ?? prev.text.fontName,
          fontSize: style.fontSize !== undefined ? String(style.fontSize) : prev.text.fontSize,
          primaryColor: style.primaryColor ?? prev.text.primaryColor,
          outlineColor: style.outlineColor ?? prev.text.outlineColor,
          opacity: style.opacity !== undefined ? String(style.opacity) : prev.text.opacity,
          bold: style.bold === true || style.bold === '1' ? '1' : (style.bold === false ? '0' : prev.text.bold),
          italic: style.italic === true || style.italic === '1' ? '1' : (style.italic === false ? '0' : prev.text.italic),
          spacing: style.spacing !== undefined ? String(style.spacing) : prev.text.spacing,
          outline: style.outline !== undefined ? String(style.outline) : prev.text.outline,
          shadow: style.shadow !== undefined ? String(style.shadow) : prev.text.shadow,
          alignment: style.alignment !== undefined ? String(style.alignment) : prev.text.alignment,
          marginL: style.marginL !== undefined ? String(style.marginL) : prev.text.marginL,
          marginR: style.marginR !== undefined ? String(style.marginR) : prev.text.marginR,
          marginV: style.marginV !== undefined ? String(style.marginV) : prev.text.marginV,
          wrapStyle: style.wrapStyle !== undefined ? String(style.wrapStyle) : prev.text.wrapStyle,
          positionMode: style.positionMode ?? prev.text.positionMode,
          positionX: style.positionX !== undefined ? String(style.positionX) : prev.text.positionX,
          positionY: style.positionY !== undefined ? String(style.positionY) : prev.text.positionY,
          textOpacity: style.opacity !== undefined ? String(style.opacity) : prev.text.textOpacity,
          textAutoMoveEnabled: (autoMoveInterval && autoMovePositions)
            ? '1'
            : prev.text.textAutoMoveEnabled,
          textAutoMoveInterval: typeof autoMoveInterval === 'number' ? String(autoMoveInterval) : prev.text.textAutoMoveInterval,
          textAutoMovePositions: autoMovePositions || prev.text.textAutoMovePositions
        }
      }));
    }
  }, [renderConfigV2Override, runPipelineProject?.id]);

    const normalizeRenderVideoMaskInsets = (video: Record<string, any>) => {
      const hasInsets = (
        video.maskLeft !== undefined
        || video.maskRight !== undefined
        || video.maskTop !== undefined
        || video.maskBottom !== undefined
    );
    const hasLegacy = (
      video.maskX !== undefined
      || video.maskY !== undefined
      || video.maskW !== undefined
      || video.maskH !== undefined
    );
    if (hasInsets || !hasLegacy) return video;
    const x = coerceNumber(video.maskX, 0) ?? 0;
    const y = coerceNumber(video.maskY, 0) ?? 0;
    const w = coerceNumber(video.maskW, 100) ?? 100;
    const h = coerceNumber(video.maskH, 100) ?? 100;
    const left = Math.max(0, Math.min(100, x));
    const top = Math.max(0, Math.min(100, y));
    const right = Math.max(0, Math.min(100, 100 - x - w));
    const bottom = Math.max(0, Math.min(100, 100 - y - h));
      return {
        ...video,
        maskLeft: String(left),
        maskRight: String(right),
        maskTop: String(top),
        maskBottom: String(bottom)
      };
    };

  const normalizeRenderVideoScalePercent = (video: Record<string, any>) => {
    const value = coerceNumber(video.scale, null);
    if (value === null || value === undefined) return video;
    if (value > 2) return video;
    return { ...video, scale: String(value * 100) };
  };

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
      setHasLoadedOnce(true);
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
      if (!authUser) return;
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
  }, [authUser]);

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

  const runPipelineJob = async (options?: { renderPreviewSeconds?: number | null }) => {
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
    const renderPreviewSeconds = options?.renderPreviewSeconds;
    const renderPreviewStartSeconds = options?.renderPreviewStartSeconds;
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
            inputPaths: runPipelineInput?.relativePath ? [runPipelineInput.relativePath] : undefined,
            model: vrModel,
            backend: runPipelineBackend,
            outputFormat: vrOutputType
          };
      if (runPipelineHasRender) {
        const videoFile = runPipelineProject?.files.find(file => file.id === renderVideoId);
        const audioFile = runPipelineProject?.files.find(file => file.id === renderAudioId);
        const subtitleFile = runPipelineProject?.files.find(file => file.id === renderSubtitleId);
        const { w: playResX, h: playResY } = parseResolution(renderParams.timeline.resolution);
        const renderInputPaths = runPipelineProject?.files
          .filter(file => renderInputFileIds.includes(file.id))
          .map(file => file.relativePath) ?? [];
        pipelinePayload.inputPath = videoFile?.relativePath ?? pipelinePayload.inputPath;
        pipelinePayload.videoPath = videoFile?.relativePath;
        pipelinePayload.audioPath = audioFile?.relativePath;
        pipelinePayload.subtitlePath = subtitleFile?.relativePath;
        if (renderInputPaths.length > 0) {
          pipelinePayload.renderInputPaths = renderInputPaths;
        }
        pipelinePayload.renderParams = {
          timeline: {
            framerate: coerceNumber(renderParams.timeline.framerate, 30),
            resolution: renderParams.timeline.resolution || null,
            scale: renderTimelineScale,
            playhead: renderPlayheadSeconds
          },
          video: {
            speed: coerceNumber(renderParams.video.speed, 1),
            volume: coerceNumber(renderParams.video.volume, 100),
            scale: coerceNumber(renderParams.video.scale, 1),
            opacity: coerceNumber(renderParams.video.opacity, 100),
            colorLut: renderParams.video.colorLut || null,
            crop: {
              x: coerceNumber(renderParams.video.cropX, 0),
              y: coerceNumber(renderParams.video.cropY, 0),
              w: coerceNumber(renderParams.video.cropW, 100),
              h: coerceNumber(renderParams.video.cropH, 100)
            }
          },
          audio: {
            gainDb: coerceNumber(renderParams.audio.gainDb, 0),
            mute: Boolean(renderParams.audio.mute)
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
            spacing: 0,
            outline: coerceNumber(renderParams.subtitle.outline, 2),
            shadow: coerceNumber(renderParams.subtitle.shadow, 2),
            alignment: coerceNumber(renderParams.subtitle.alignment, 2),
            marginL: coerceNumber(renderParams.subtitle.marginL, 30),
            marginR: coerceNumber(renderParams.subtitle.marginR, 30),
            marginV: coerceNumber(renderParams.subtitle.marginV, 36),
            wrapStyle: 0
          }
        };
        const renderConfigV2 = buildRenderConfigV2();
        if (renderConfigV2) {
          if (Number.isFinite(renderPreviewSeconds) && (renderPreviewSeconds ?? 0) > 0) {
            renderConfigV2.timeline = {
              ...renderConfigV2.timeline,
              duration: Number(renderPreviewSeconds)
            };
            if (Number.isFinite(renderPreviewStartSeconds)) {
              renderConfigV2.timeline.start = Number(renderPreviewStartSeconds);
            }
          }
          pipelinePayload.renderConfigV2 = renderConfigV2;
        }
        if (Number.isFinite(renderPreviewSeconds) && (renderPreviewSeconds ?? 0) > 0) {
          pipelinePayload.renderPreviewSeconds = Number(renderPreviewSeconds);
        }
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
      navigateTab('dashboard');
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
    if (!authUser) return;
    loadVault();
  }, [authUser]);

  useEffect(() => {
    const id = window.setInterval(() => {
      const base = jobNowBaseRef.current;
      if (!base) {
        setJobNowMs(Date.now());
        return;
      }
      const delta = Date.now() - base.clientMs;
      setJobNowMs(base.serverMs + Math.max(0, delta));
    }, 1000);
    return () => window.clearInterval(id);
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
    selectProjectDefaults,
    renderReady,
    setShowRenderStudio: setRenderStudioOpen,
    setActiveTab,
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
    renderStudioPreviewFileId,
    setRenderStudioPreviewFileId,
    openRenderStudioMediaBinContextMenu,
    openRenderStudioTimelineContextMenu,
    renderInputFileIds,
    setRenderInputFileIds,
    renderTemplateApplyMap,
    onRenderTemplatePlaceholderFile: (placeholderKey: string, fileId: string) => {
      const template = renderTemplates.find(t => t.id === runPipelineRenderTemplateId);
      if (!template || runPipelineRenderTemplateId === 'custom') return;
      const next = { ...renderTemplateApplyMap, [placeholderKey]: fileId };
      commitRenderTemplateApplyMap(template.id, next);
      applyRenderTemplate(template, next);
    },
    renderVideoId,
    setRenderVideoId,
    renderAudioId,
    setRenderAudioId,
    renderSubtitleId,
    setRenderSubtitleId,
    renderTextTrackEnabled,
    setRenderTextTrackEnabled,
    renderVideoFile,
    renderAudioFile,
    renderSubtitleFile,
    renderImageFiles,
    renderImageDurationEntries,
    renderImageDurations,
    setRenderImageDurations,
    renderImageMatchDuration,
    setRenderImageMatchDuration,
    renderImageOrderIds,
    setRenderImageOrderIds,
    renderImageTransforms,
    setRenderImageTransforms,
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
    showRenderTimelineTextTrack,
    showRenderTimelineImageTrack,
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
    setRenderPreviewHold,
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
    renderVideoTransforms,
    addRenderVideoBlurEffect,
    updateRenderVideoBlurEffect,
    commitRenderVideoBlurEffectValue,
    removeRenderVideoBlurEffect,
    addRenderImageBlurEffect,
    updateRenderImageBlurEffect,
    commitRenderImageBlurEffectValue,
    removeRenderImageBlurEffect,
    renderTrackLabels,
    placeholderKeyByFileId,
    updateRenderTrackLabel,
    coerceNumber,
    RENDER_BLUR_FEATHER_MAX,
    RENDER_PREVIEW_BLACK_DATA_URL,
    renderTemplates,
    runPipelineRenderTemplateId,
    handleRenderTemplateChange,
    saveRenderTemplateQuick,
    saveRenderTemplateCurrent,
    restoreRenderTemplateCurrent,
    deleteRenderTemplateWithConfirm,
    isRenderTemplateDirty,
    renderConfigV2Override,
    setRenderConfigV2Override,
    renderTemplateDiffCurrentConfig,
    renderTemplateDiffBaselineConfig,
    renderTemplateDiffBaselineLabel,
    setImportPopupOpen,
    subtitleFontOptions,
    subtitleFontLoading,
    SUBTITLE_STYLE_PRESETS,
    applySubtitleStylePreset,
    isSubtitlePresetActive,
    buildSubtitlePreviewStyle
  };

  const selectedRenderTemplate = renderTemplates.find(t => t.id === runPipelineRenderTemplateId) ?? null;
  const isCustomRenderTemplate = !selectedRenderTemplate || runPipelineRenderTemplateId === 'custom';
  const selectedDownloadTemplate = getSelectedTaskTemplate('download');
  const selectedUvrTemplate = getSelectedTaskTemplate('uvr');
  const selectedTtsTemplate = getSelectedTaskTemplate('tts');
  const isDownloadTemplateDirty = isTaskTemplateDirty('download');
  const isUvrTemplateDirty = isTaskTemplateDirty('uvr');
  const isTtsTemplateDirty = isTaskTemplateDirty('tts');
  const renderTemplatePlaceholders = React.useMemo(() => {
    if (!selectedRenderTemplate || runPipelineRenderTemplateId === 'custom') return [];
    const keys = Object.keys(selectedRenderTemplate.config.inputsMap ?? {});
    const typeOfKey = (key: string) => {
      if (key.startsWith('video')) return 'video';
      if (key.startsWith('audio')) return 'audio';
      if (key.startsWith('subtitle')) return 'subtitle';
      if (key.startsWith('image')) return 'image';
      return 'other';
    };
    return keys.map(key => ({ key, type: typeOfKey(key) }));
  }, [selectedRenderTemplate, runPipelineRenderTemplateId]);
  const renderTemplatePlaceholdersByType = React.useMemo(() => {
    const grouped = {
      video: [] as Array<{ key: string; type: string }>,
      audio: [] as Array<{ key: string; type: string }>,
      subtitle: [] as Array<{ key: string; type: string }>,
      image: [] as Array<{ key: string; type: string }>,
      other: [] as Array<{ key: string; type: string }>
    };
    renderTemplatePlaceholders.forEach(item => {
      const key = item.type in grouped ? (item.type as keyof typeof grouped) : 'other';
      grouped[key].push(item);
    });
    return grouped;
  }, [renderTemplatePlaceholders]);
  const renderTemplateFilesByType = React.useMemo(() => {
    const availableFiles = runPipelineProject?.files ?? [];
    return {
      video: availableFiles.filter(file => file.type === 'video'),
      audio: availableFiles.filter(file => file.type === 'audio'),
      subtitle: availableFiles.filter(file => file.type === 'subtitle'),
      image: availableFiles.filter(file => file.type === 'image')
    };
  }, [runPipelineProject?.files]);
  const renderTemplateSummary = React.useMemo(() => {
    if (!selectedRenderTemplate || runPipelineRenderTemplateId === 'custom') return null;
    const config = selectedRenderTemplate.config;
    const placeholders = Object.keys(config.inputsMap ?? {});
    const placeholderCounts = {
      video: 0,
      audio: 0,
      subtitle: 0,
      image: 0,
      other: 0
    };
    placeholders.forEach(key => {
      if (key.startsWith('video')) placeholderCounts.video += 1;
      else if (key.startsWith('audio')) placeholderCounts.audio += 1;
      else if (key.startsWith('subtitle')) placeholderCounts.subtitle += 1;
      else if (key.startsWith('image')) placeholderCounts.image += 1;
      else placeholderCounts.other += 1;
    });
    const effects = Array.isArray(config.effects) ? config.effects : [];
    const effectCounts = effects.reduce((acc, item) => {
      const type = String(item?.type ?? 'effect');
      acc[type] = (acc[type] ?? 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    return {
      resolution: config.timeline?.resolution ?? '--',
      framerate: config.timeline?.framerate ?? '--',
      renderOptions: config.renderOptions ?? {},
      placeholderCounts,
      effectCounts
    };
  }, [selectedRenderTemplate, runPipelineRenderTemplateId]);
  const isNewJobProjectLoading = React.useMemo(() => {
    if (!showRunPipeline) return false;
    if (vaultLoading || runPipelineLoading) return true;
    if (!hasLoadedOnce && vaultFolders.length === 0) return true;
    return false;
  }, [
    showRunPipeline,
    vaultLoading,
    runPipelineLoading,
    hasLoadedOnce,
    vaultFolders.length
  ]);

  if (!authChecked) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center">
        <div className="text-sm text-zinc-400">Checking session...</div>
      </div>
    );
  }

  if (authUser && showRenderStudio) {
    if (vaultLoading || runPipelineLoading || pipelineLibrary.length === 0 || (!hasLoadedOnce && vaultFolders.length === 0)) {
      return (
        <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center">
          <div className="text-sm text-zinc-400">Loading project...</div>
        </div>
      );
    }

    if (vaultFolders.length === 0) {
      return (
        <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="text-sm text-zinc-400">No projects available.</div>
            <button
              type="button"
              onClick={() => setRenderStudioOpen(false)}
              className="px-3 py-2 text-xs font-semibold border border-zinc-800 rounded-lg text-zinc-300 hover:text-zinc-100 hover:border-zinc-700"
            >
              Back
            </button>
          </div>
        </div>
      );
    }

    if (!runPipelineProject) {
      return (
        <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="text-sm text-zinc-400">Select a project to continue.</div>
            <button
              type="button"
              onClick={() => setRenderStudioOpen(false)}
              className="px-3 py-2 text-xs font-semibold border border-zinc-800 rounded-lg text-zinc-300 hover:text-zinc-100 hover:border-zinc-700"
            >
              Back
            </button>
          </div>
        </div>
      );
    }

    if (!runPipelineHasRender) {
      return (
        <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="text-sm text-zinc-400">Render Studio is not available.</div>
            <button
              type="button"
              onClick={() => setRenderStudioOpen(false)}
              className="px-3 py-2 text-xs font-semibold border border-zinc-800 rounded-lg text-zinc-300 hover:text-zinc-100 hover:border-zinc-700"
            >
              Back
            </button>
          </div>
        </div>
      );
    }

    return (
      <>
        <Suspense
          fallback={(
            <div className="fixed inset-0 z-[60] bg-zinc-950 flex items-center justify-center">
              <div className="text-xs text-zinc-400">Loading Render Studio...</div>
            </div>
          )}
        >
          <RenderStudioPage {...renderStudioProps} />
        </Suspense>
        {renderStudioContextMenus}
        {confirmModal}
        {templateSaveOpen && (
          <div className="fixed inset-0 z-[90] flex items-center justify-center bg-zinc-950/70 backdrop-blur-sm">
            <div className="absolute inset-0" onClick={() => setTemplateSaveOpen(false)} />
            <div className="relative w-[min(520px,92vw)] bg-zinc-900/95 border border-zinc-800 rounded-2xl p-5 flex flex-col gap-4 shadow-2xl">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-zinc-100">Save Template</div>
                <button
                  onClick={() => setTemplateSaveOpen(false)}
                  className="px-3 py-1.5 text-xs font-semibold border border-zinc-800 rounded-lg text-zinc-400 hover:text-zinc-100 hover:border-zinc-700"
                >
                  Close
                </button>
              </div>
              <div className="text-xs text-zinc-500">
                {templateSaveTaskType === 'render' ? 'Save Render template (inputs will be placeholders).' : 'Save task template.'}
              </div>
              {templateSaveError && (
                <div className="text-xs text-amber-300 border border-amber-500/30 bg-amber-500/10 rounded-lg px-2.5 py-2">
                  {templateSaveError}
                </div>
              )}
              <div className="flex flex-col gap-2">
                <label className="text-xs text-zinc-500 uppercase tracking-widest">Template Name</label>
                <input
                  value={templateSaveName}
                  onChange={e => setTemplateSaveName(e.target.value)}
                  className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none"
                  placeholder="My template"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  onClick={() => setTemplateSaveOpen(false)}
                  className="px-3 py-1.5 text-xs font-semibold border border-zinc-800 rounded-lg text-zinc-400 hover:text-zinc-100 hover:border-zinc-700"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmSaveTemplate}
                  disabled={Boolean(templateSaveError)}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-lime-500 text-zinc-950 hover:bg-lime-400 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  return authUser ? (
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
            onClick={() => navigateTab('dashboard')} 
            collapsed={sidebarCollapsed}
          />
          <SidebarItem 
            icon={Hammer} 
            label="Pipeline Forge" 
            active={activeTab === 'forge'} 
            onClick={() => navigateTab('forge')} 
            collapsed={sidebarCollapsed}
          />
          <SidebarItem 
            icon={Database} 
            label="Media Vault" 
            active={activeTab === 'vault'} 
            onClick={() => navigateTab('vault')} 
            collapsed={sidebarCollapsed}
          />
          <div className="my-4 border-t border-zinc-800/50" />
          <SidebarItem 
            icon={Settings} 
            label="Settings" 
            active={activeTab === 'settings'} 
            onClick={() => navigateTab('settings')} 
            collapsed={sidebarCollapsed}
          />
          <SidebarItem 
            icon={Terminal} 
            label="System Logs" 
            active={activeTab === 'logs'} 
            onClick={() => navigateTab('logs')} 
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
            <button 
              onClick={() => {
                setRunPipelineProjectLocked(false);
                setRunPipelineProjectId(null);
                resetDownloadForm();
                setShowRunPipeline(true);
              }}
              title="+ New Job"
              className="flex items-center gap-2 px-4 py-2 bg-lime-500 text-zinc-950 rounded-lg font-bold text-sm hover:bg-lime-400 transition-colors shadow-lg shadow-lime-500/10"
            >
              + New Job
            </button>
            <button
              type="button"
              onClick={handleLogout}
              title="Logout"
              className="p-2 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-lg transition-colors"
              aria-label="Logout"
            >
              <LogOut size={18} />
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
                    <span className="text-right -ml-2">Elapsed Time</span>
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
                              nowMs={jobNowMs}
                              hasServerNow={Boolean(jobNowBaseRef.current)}
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

                  {SHOW_PARAM_PRESETS && (
                    <div className="bg-zinc-900/30 border border-zinc-800 rounded-xl p-5">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-500">Param Presets</h3>
                        <div className="flex items-center gap-2">
                          <div className="text-[10px] text-zinc-500">{paramPresetCards.length} presets</div>
                          <button
                            onClick={resetParamPresetsDb}
                            className="px-3 py-1 text-[10px] font-semibold border border-red-500/40 text-red-300 rounded-md hover:border-red-500/70"
                          >
                            Reset DB
                          </button>
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
                  )}
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

                {SHOW_PARAM_PRESETS && showParamPresetEditor && (
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

                {renderTemplateModalOpen && (
                  <div className="fixed inset-0 z-[70] flex items-center justify-center bg-zinc-950/70 backdrop-blur-sm">
                    <div className="absolute inset-0" onClick={() => setRenderTemplateModalOpen(false)} />
                    <div className="relative w-[min(760px,92vw)] max-h-[85vh] bg-zinc-900/95 border border-zinc-800 rounded-2xl p-5 flex flex-col gap-4 shadow-2xl overflow-hidden">
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-semibold text-zinc-100">Render Templates</div>
                        <button
                          onClick={() => setRenderTemplateModalOpen(false)}
                          className="px-3 py-1.5 text-xs font-semibold border border-zinc-800 rounded-lg text-zinc-400 hover:text-zinc-100 hover:border-zinc-700"
                        >
                          Close
                        </button>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="text-xs text-zinc-500">Templates saved in database for Render V2.</div>
                        <button
                          onClick={() => {
                            const config = buildRenderConfigV2();
                            if (!config || !Array.isArray(config.items) || config.items.length === 0) {
                              showToast('Select at least 1 file to build template.', 'warning');
                              return;
                            }
                            setRenderTemplateEditingId(null);
                            openRenderTemplateEditor(config, '');
                          }}
                          className="px-3 py-1.5 text-xs font-semibold bg-lime-500 text-zinc-950 rounded-lg hover:bg-lime-400"
                        >
                          New Template
                        </button>
                      </div>
                      <div className="flex flex-col gap-2 overflow-y-auto pr-1">
                        {renderTemplates.length === 0 ? (
                          <div className="text-sm text-zinc-500">No templates yet.</div>
                        ) : renderTemplates.map(template => (
                          <div key={template.id} className="border border-zinc-800 rounded-xl p-3 bg-zinc-900/60 flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-zinc-100 truncate">{template.name}</div>
                              <div className="text-[10px] text-zinc-500 mt-1">Updated {formatRelativeTime(template.updatedAt)}</div>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => {
                                  setRenderTemplateApplyTarget(template);
                                  const mapping = renderTemplateApplyMapById[template.id] ?? {};
                                  commitRenderTemplateApplyMap(template.id, mapping);
                                  setRenderTemplateApplyOpen(true);
                                }}
                                className="px-2.5 py-1.5 text-xs font-semibold border border-zinc-800 rounded-lg text-zinc-300 hover:text-zinc-100 hover:border-zinc-700"
                              >
                                Apply
                              </button>
                              <button
                                onClick={() => {
                                  setRenderTemplateEditingId(template.id);
                                  setRenderTemplateNameDraft(template.name);
                                  setRenderTemplateJsonDraft(JSON.stringify(template.config, null, 2));
                                  setRenderTemplateEditorOpen(true);
                                }}
                                className="px-2.5 py-1.5 text-xs font-semibold border border-zinc-800 rounded-lg text-zinc-300 hover:text-zinc-100 hover:border-zinc-700"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => {
                                  deleteRenderTemplateWithConfirm(template.id, template.name);
                                }}
                                className="px-2.5 py-1.5 text-xs font-semibold border border-red-500/40 text-red-300 rounded-lg hover:border-red-500/70"
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {renderTemplateEditorOpen && (
                  <div className="fixed inset-0 z-[75] flex items-center justify-center bg-zinc-950/70 backdrop-blur-sm">
                    <div className="absolute inset-0" onClick={() => setRenderTemplateEditorOpen(false)} />
                    <div className="relative w-[min(900px,92vw)] max-h-[85vh] bg-zinc-900/95 border border-zinc-800 rounded-2xl p-5 flex flex-col gap-4 shadow-2xl overflow-hidden">
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-semibold text-zinc-100">Template Editor</div>
                        <button
                          onClick={() => setRenderTemplateEditorOpen(false)}
                          className="px-3 py-1.5 text-xs font-semibold border border-zinc-800 rounded-lg text-zinc-400 hover:text-zinc-100 hover:border-zinc-700"
                        >
                          Close
                        </button>
                      </div>
                      <div className="flex flex-col gap-2">
                        <label className="text-xs text-zinc-500 uppercase tracking-widest">Template Name</label>
                        <input
                          value={renderTemplateNameDraft}
                          onChange={e => setRenderTemplateNameDraft(e.target.value)}
                          className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none"
                          placeholder="My render template"
                        />
                      </div>
                      <div className="flex flex-col gap-2 flex-1 min-h-0">
                        <label className="text-xs text-zinc-500 uppercase tracking-widest">RenderConfigV2 JSON</label>
                        <textarea
                          value={renderTemplateJsonDraft}
                          onChange={e => setRenderTemplateJsonDraft(e.target.value)}
                          className="flex-1 min-h-[240px] bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none font-mono"
                        />
                      </div>
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setRenderTemplateEditorOpen(false)}
                          className="px-3 py-1.5 text-xs font-semibold border border-zinc-800 rounded-lg text-zinc-400 hover:text-zinc-100 hover:border-zinc-700"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={saveRenderTemplateDraft}
                          className="px-3 py-1.5 text-xs font-semibold bg-lime-500 text-zinc-950 rounded-lg hover:bg-lime-400"
                        >
                          Save Template
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {renderTemplateApplyOpen && renderTemplateApplyTarget && (
                  <div className="fixed inset-0 z-[75] flex items-center justify-center bg-zinc-950/70 backdrop-blur-sm">
                    <div className="absolute inset-0" onClick={() => setRenderTemplateApplyOpen(false)} />
                    <div className="relative w-[min(700px,92vw)] max-h-[85vh] bg-zinc-900/95 border border-zinc-800 rounded-2xl p-5 flex flex-col gap-4 shadow-2xl overflow-hidden">
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-semibold text-zinc-100">Apply Template</div>
                        <button
                          onClick={() => setRenderTemplateApplyOpen(false)}
                          className="px-3 py-1.5 text-xs font-semibold border border-zinc-800 rounded-lg text-zinc-400 hover:text-zinc-100 hover:border-zinc-700"
                        >
                          Close
                        </button>
                      </div>
                      <div className="text-xs text-zinc-500">Map placeholders to project files.</div>
                      <div className="flex flex-col gap-3 max-h-[45vh] overflow-y-auto pr-1">
                        {Object.keys(renderTemplateApplyTarget.config.inputsMap).map(key => (
                          <div key={key} className="flex items-center gap-3">
                            <div className="w-28 text-xs text-zinc-400 font-mono">{key}</div>
                            <select
                              value={renderTemplateApplyMap[key] ?? ''}
                              onChange={e => {
                                const next = { ...renderTemplateApplyMap, [key]: e.target.value };
                                commitRenderTemplateApplyMap(renderTemplateApplyTarget?.id ?? null, next);
                              }}
                              className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-sm text-zinc-200 focus:outline-none"
                            >
                              <option value="">Select file</option>
                              {runPipelineProject?.files
                                .filter(file => file.type === 'video' || file.type === 'audio' || file.type === 'subtitle' || file.type === 'image')
                                .map(file => (
                                  <option key={file.id} value={file.id}>
                                    [{file.type}] {truncateLabel(file.name, 52)}
                                  </option>
                                ))}
                            </select>
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setRenderTemplateApplyOpen(false)}
                          className="px-3 py-1.5 text-xs font-semibold border border-zinc-800 rounded-lg text-zinc-400 hover:text-zinc-100 hover:border-zinc-700"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => {
                            applyRenderTemplate(renderTemplateApplyTarget, renderTemplateApplyMap);
                            setRenderTemplateApplyOpen(false);
                            setRenderTemplateModalOpen(false);
                          }}
                          className="px-3 py-1.5 text-xs font-semibold bg-lime-500 text-zinc-950 rounded-lg hover:bg-lime-400"
                        >
                          Apply
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
                                    const message = data.error || data.details || 'TTS preview failed';
                                    throw new Error(message);
                                  }
                                  const arrayBuffer = await response.arrayBuffer();
                                  if (previewTtsUrl) URL.revokeObjectURL(previewTtsUrl);
                                  const url = URL.createObjectURL(new Blob([arrayBuffer], { type: 'audio/mpeg' }));
                                  setPreviewTtsUrl(url);
                                } catch (error) {
                                  const message = error instanceof Error ? error.message : 'TTS preview failed';
                                  setPreviewTtsError(message);
                                  showToast(`TTS preview error: ${message}`, 'error');
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

          {confirmModal}

          {templateSaveOpen && (
            <div className="fixed inset-0 z-[90] flex items-center justify-center bg-zinc-950/70 backdrop-blur-sm">
              <div className="absolute inset-0" onClick={() => setTemplateSaveOpen(false)} />
              <div className="relative w-[min(520px,92vw)] bg-zinc-900/95 border border-zinc-800 rounded-2xl p-5 flex flex-col gap-4 shadow-2xl">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-zinc-100">Save Template</div>
                  <button
                    onClick={() => setTemplateSaveOpen(false)}
                    className="px-3 py-1.5 text-xs font-semibold border border-zinc-800 rounded-lg text-zinc-400 hover:text-zinc-100 hover:border-zinc-700"
                  >
                    Close
                  </button>
                </div>
                <div className="text-xs text-zinc-500">
                  {templateSaveTaskType === 'render' ? 'Save Render template (inputs will be placeholders).' : 'Save task template.'}
                </div>
                {templateSaveError && (
                  <div className="text-xs text-amber-300 border border-amber-500/30 bg-amber-500/10 rounded-lg px-2.5 py-2">
                    {templateSaveError}
                  </div>
                )}
                <div className="flex flex-col gap-2">
                  <label className="text-xs text-zinc-500 uppercase tracking-widest">Template Name</label>
                  <input
                    value={templateSaveName}
                    onChange={e => setTemplateSaveName(e.target.value)}
                    className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none"
                    placeholder="My template"
                  />
                </div>
                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    onClick={() => setTemplateSaveOpen(false)}
                    className="px-3 py-1.5 text-xs font-semibold border border-zinc-800 rounded-lg text-zinc-400 hover:text-zinc-100 hover:border-zinc-700"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmSaveTemplate}
                    disabled={Boolean(templateSaveError)}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-lime-500 text-zinc-950 hover:bg-lime-400 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>
          )}

            {showRunPipeline && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/70 backdrop-blur-sm">
                <div className="absolute inset-0" onClick={() => {
                  setShowRunPipeline(false);
                  setRenderStudioOpen(false);
                }} />
              <div className="relative w-[min(700px,92vw)] max-h-[85vh] bg-zinc-900/95 border border-zinc-800 rounded-2xl p-4 flex flex-col gap-4 shadow-2xl overflow-y-auto">
                <div className="flex items-center justify-between">
                  <div className="text-xs text-zinc-500 uppercase tracking-widest">New Job</div>
                  <div className="flex items-center gap-2">
                    {!isNewJobProjectLoading && runPipelineHasRender && (
                      <button
                        onClick={() => setRenderStudioOpen(true)}
                        disabled={!runPipelineProject}
                        className="px-3 py-1.5 text-xs font-semibold border border-zinc-800 rounded-lg text-zinc-200 hover:border-lime-500/50 hover:text-lime-300 disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        Preview
                      </button>
                    )}
                    {!isNewJobProjectLoading && (
                      <button
                        onClick={runPipelineJob}
                        disabled={runPipelineSubmitting}
                        className="px-3 py-1.5 bg-lime-500 text-zinc-950 rounded-lg text-xs font-semibold hover:bg-lime-400 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {runPipelineSubmitting ? 'Queuing...' : 'Run'}
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setShowRunPipeline(false);
                        setRenderStudioOpen(false);
                      }}
                      className="p-2 text-zinc-400 hover:text-zinc-100 border border-zinc-800 rounded-lg hover:border-zinc-700"
                      aria-label="Close"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
                {isNewJobProjectLoading && (
                  <div className="absolute inset-x-0 top-14 bottom-0 z-20 bg-zinc-900/95 rounded-b-2xl flex items-center justify-center">
                    <div className="text-sm text-zinc-400">Loading project...</div>
                  </div>
                )}

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
                            {!runPipelineProject ? (
                              <div className="text-[11px] text-zinc-500">Select a project first.</div>
                            ) : runPipelineRenderTemplateId === 'custom' || !selectedRenderTemplate ? (
                              <>
                                <select
                                  multiple
                                  value={renderInputFileIds}
                                  onChange={e => {
                                    const selectedOptions = Array.from(e.currentTarget.selectedOptions) as HTMLOptionElement[];
                                    const selected = selectedOptions.map(option => option.value);
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
                              </>
                            ) : (
                              <div className="grid grid-cols-2 gap-2">
                                {(['video', 'audio', 'subtitle', 'image', 'other'] as const).map(group => {
                                  const placeholders = renderTemplatePlaceholdersByType[group];
                                  if (!placeholders.length) return null;
                                  const files = renderTemplateFilesByType[group as keyof typeof renderTemplateFilesByType] ?? [];
                                  const needsWarning = group !== 'other' && (files.length === 0 || files.length !== placeholders.length);
                                  let warningText = '';
                                  if (files.length === 0) {
                                    warningText = `No ${group} files available`;
                                  } else if (files.length < placeholders.length) {
                                    warningText = `Missing ${placeholders.length - files.length} ${group} file(s)`;
                                  } else if (files.length > placeholders.length) {
                                    warningText = `Extra ${files.length - placeholders.length} ${group} file(s)`;
                                  }
                                  return (
                                    <div key={group} className="border border-zinc-800 rounded-lg bg-zinc-950/50">
                                      <div className="flex items-center justify-between px-2.5 py-2 border-b border-zinc-800">
                                        <span className="text-[10px] text-zinc-500 uppercase tracking-widest">{group}</span>
                                        {needsWarning && (
                                          <span className="text-[10px] text-amber-300">{warningText}</span>
                                        )}
                                      </div>
                                      <div className="p-2 grid gap-2">
                                        {placeholders.map((placeholder, index) => {
                                          const fallbackKey = placeholders.length === 1 && placeholder.key === placeholder.type
                                            ? ''
                                            : (placeholder.key === placeholder.type ? `${placeholder.type}1` : placeholder.key);
                                          const savedName = (selectedRenderTemplate?.config?.timeline?.trackLabels?.[placeholder.key] ?? '').trim();
                                          const displayName = savedName || fallbackKey;
                                          return (
                                            <div key={placeholder.key} className="flex flex-col gap-1 min-w-0">
                                              {displayName ? (
                                                <label
                                                  className="text-[10px] text-zinc-500 uppercase tracking-widest truncate"
                                                  title={`${placeholder.key}${savedName ? ` · ${savedName}` : ''}`}
                                                >
                                                  {displayName}
                                                </label>
                                              ) : null}
                                              <select
                                                value={renderTemplateApplyMap[placeholder.key] ?? ''}
                                                onChange={e => {
                                                  const next = { ...renderTemplateApplyMap, [placeholder.key]: e.target.value };
                                                  commitRenderTemplateApplyMap(selectedRenderTemplate?.id ?? null, next);
                                                  if (selectedRenderTemplate) {
                                                    applyRenderTemplate(selectedRenderTemplate, next);
                                                  }
                                                }}
                                                title={(() => {
                                                  const selectedId = renderTemplateApplyMap[placeholder.key];
                                                  const selectedFile = files.find(file => file.id === selectedId);
                                                  return selectedFile?.name ?? '';
                                                })()}
                                                className="bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-sm text-zinc-200 focus:outline-none w-full min-w-0 overflow-hidden text-ellipsis whitespace-nowrap"
                                              >
                                                <option value="">Select file</option>
                                                {files.map(file => (
                                                  <option key={file.id} value={file.id} title={file.name}>
                                                    {truncateLabel(file.name, 52)}
                                                  </option>
                                                ))}
                                              </select>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
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

                {runPipelineHasRender && renderTemplates.length > 0 && (
                  <div className="border border-zinc-800 rounded-xl p-3 bg-zinc-900/70">
                    <div className="text-[11px] text-zinc-500 uppercase tracking-widest mb-2">Block Config: Render</div>
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] text-zinc-500 uppercase tracking-widest">Template</label>
                      <div className="flex items-center gap-2 min-w-0">
                        <select
                          value={runPipelineRenderTemplateId}
                          onChange={e => handleRenderTemplateChange(e.target.value)}
                          onContextMenu={event => {
                            if (runPipelineRenderTemplateId === 'custom' || !selectedRenderTemplate) return;
                            event.preventDefault();
                            deleteRenderTemplateWithConfirm(selectedRenderTemplate.id, selectedRenderTemplate.name);
                          }}
                          className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1 text-xs text-zinc-200 focus:outline-none w-44 sm:w-56"
                        >
                          <option value="custom">Custom</option>
                          {renderTemplates.map(template => {
                            const isSelected = runPipelineRenderTemplateId === template.id;
                            const label = isSelected && isRenderTemplateDirty ? `*${template.name}` : template.name;
                            return (
                              <option key={template.id} value={template.id}>{label}</option>
                            );
                          })}
                        </select>
                        <div
                          className="relative shrink-0"
                          onMouseEnter={() => {
                            if (newJobRenderTemplateMenuCloseRef.current) {
                              window.clearTimeout(newJobRenderTemplateMenuCloseRef.current);
                              newJobRenderTemplateMenuCloseRef.current = null;
                            }
                            setNewJobRenderTemplateMenuOpen(true);
                          }}
                          onMouseLeave={() => {
                            if (newJobRenderTemplateMenuCloseRef.current) {
                              window.clearTimeout(newJobRenderTemplateMenuCloseRef.current);
                            }
                            newJobRenderTemplateMenuCloseRef.current = window.setTimeout(() => {
                              setNewJobRenderTemplateMenuOpen(false);
                              newJobRenderTemplateMenuCloseRef.current = null;
                            }, 120);
                          }}
                          onFocusCapture={() => setNewJobRenderTemplateMenuOpen(true)}
                          onBlurCapture={event => {
                            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                              setNewJobRenderTemplateMenuOpen(false);
                            }
                          }}
                        >
                          <button
                            type="button"
                            aria-label="Template options"
                            title="Template options"
                            onClick={() => setNewJobRenderTemplateMenuOpen(prev => !prev)}
                            className="inline-flex items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-2 text-xs font-medium text-zinc-200 hover:border-lime-500/50 hover:text-lime-300 shrink-0"
                          >
                            <Menu size={14} />
                          </button>
                          {newJobRenderTemplateMenuOpen && (
                            <div className="absolute right-0 top-full mt-1 w-28 rounded-lg border border-zinc-800 bg-zinc-950 shadow-lg shadow-black/40 z-20">
                              <button
                                type="button"
                                onClick={() => {
                                  setNewJobRenderTemplateMenuOpen(false);
                                  resetRenderToDefault();
                                }}
                                className={`w-full px-3 py-2 text-left text-xs text-zinc-200 hover:bg-zinc-800/90 hover:text-zinc-50 transition-colors ${
                                  isCustomRenderTemplate ? 'rounded-lg' : 'rounded-t-lg'
                                }`}
                              >
                                Reset to default
                              </button>
                              {!isCustomRenderTemplate && isRenderTemplateDirty && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (!selectedRenderTemplate) return;
                                    setNewJobRenderTemplateMenuOpen(false);
                                    saveRenderTemplateCurrent(selectedRenderTemplate);
                                  }}
                                  className="w-full px-3 py-2 text-left text-xs text-zinc-200 hover:bg-zinc-800/90 hover:text-zinc-50 transition-colors"
                                >
                                  Save
                                </button>
                              )}
                              {!isCustomRenderTemplate && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setNewJobRenderTemplateMenuOpen(false);
                                      saveRenderTemplateQuick();
                                    }}
                                    className="w-full px-3 py-2 text-left text-xs text-zinc-200 hover:bg-zinc-800/90 hover:text-zinc-50 transition-colors"
                                  >
                                    Save As
                                  </button>
                                  {isRenderTemplateDirty && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (!selectedRenderTemplate) return;
                                        setNewJobRenderTemplateMenuOpen(false);
                                        restoreRenderTemplateCurrent(selectedRenderTemplate);
                                      }}
                                      className="w-full px-3 py-2 text-left text-xs text-zinc-200 hover:bg-zinc-800/90 hover:text-zinc-50 transition-colors"
                                    >
                                      Restore
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (!selectedRenderTemplate) return;
                                      setNewJobRenderTemplateMenuOpen(false);
                                      deleteRenderTemplateWithConfirm(selectedRenderTemplate.id, selectedRenderTemplate.name);
                                    }}
                                    className="w-full px-3 py-2 text-left text-xs rounded-b-lg transition-colors text-red-300 hover:bg-red-500/10 hover:text-red-200"
                                  >
                                    Delete
                                  </button>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    {renderTemplateSummary && (
                      <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-950/60 p-2.5 text-[11px] text-zinc-400">
                        <div className="text-[10px] text-zinc-500 uppercase tracking-widest mb-2">Template Summary</div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="flex items-center justify-between">
                            <span>Resolution</span>
                            <span className="text-zinc-200">{renderTemplateSummary.resolution}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>Framerate</span>
                            <span className="text-zinc-200">{renderTemplateSummary.framerate}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>Codec</span>
                            <span className="text-zinc-200">{renderTemplateSummary.renderOptions.codec ?? 'h264'}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>Preset</span>
                            <span className="text-zinc-200">{renderTemplateSummary.renderOptions.preset ?? 'fast'}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>CRF</span>
                            <span className="text-zinc-200">{renderTemplateSummary.renderOptions.crf ?? 21}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>GOP</span>
                            <span className="text-zinc-200">
                              {renderTemplateSummary.renderOptions.gop ? renderTemplateSummary.renderOptions.gop : 'auto'}
                            </span>
                          </div>
                        </div>
                        <div className="mt-2">
                          <div className="flex items-center justify-between">
                            <span>Placeholders</span>
                            <span className="text-zinc-200">
                              {`${renderTemplateSummary.placeholderCounts.video} video, ${renderTemplateSummary.placeholderCounts.audio} audio, ${renderTemplateSummary.placeholderCounts.subtitle} subtitle, ${renderTemplateSummary.placeholderCounts.image} images`}
                            </span>
                          </div>
                        </div>
                        <div className="mt-2">
                          <div className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1">Effects</div>
                          {Object.keys(renderTemplateSummary.effectCounts).length === 0 ? (
                            <div className="text-zinc-500">None</div>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              {Object.entries(renderTemplateSummary.effectCounts).map(([type, count]) => (
                                <div key={type} className="px-2 py-1 rounded-md border border-zinc-800 bg-zinc-900 text-zinc-200">
                                  {type} × {count}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {runPipelineHasDownload && (
                  <div className="border border-zinc-800 rounded-xl p-3 bg-zinc-900/70">
                    <div className="text-[11px] text-zinc-500 uppercase tracking-widest mb-2">Block Config: Download</div>
                    <div className="flex items-center justify-between mb-3">
                      <label className="text-[11px] text-zinc-500 uppercase tracking-widest">Template</label>
                      <div className="flex items-center gap-2 min-w-0">
                        <select
                          value={runPipelineTaskTemplate.download ?? 'custom'}
                          onChange={e => handleTaskTemplateChange('download', e.target.value)}
                          onContextMenu={event => {
                            if (!selectedDownloadTemplate) return;
                            event.preventDefault();
                            deleteTaskTemplateWithConfirm('download', selectedDownloadTemplate.id, selectedDownloadTemplate.name);
                          }}
                          className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1 text-xs text-zinc-200 focus:outline-none w-44 sm:w-56"
                        >
                          <option value="custom">{isDownloadTemplateDirty ? '*Custom' : 'Custom'}</option>
                          {getTaskTemplatesForType('download').map(template => {
                            const isSelected = runPipelineTaskTemplate.download === template.id;
                            const label = isSelected && isDownloadTemplateDirty ? `*${template.name}` : template.name;
                            return (
                              <option key={template.id} value={template.id}>{label}</option>
                            );
                          })}
                        </select>
                        <div
                          className="relative shrink-0"
                          onMouseEnter={() => {
                            if (downloadTemplateMenuCloseRef.current) {
                              window.clearTimeout(downloadTemplateMenuCloseRef.current);
                              downloadTemplateMenuCloseRef.current = null;
                            }
                            setDownloadTemplateMenuOpen(true);
                          }}
                          onMouseLeave={() => {
                            if (downloadTemplateMenuCloseRef.current) {
                              window.clearTimeout(downloadTemplateMenuCloseRef.current);
                            }
                            downloadTemplateMenuCloseRef.current = window.setTimeout(() => {
                              setDownloadTemplateMenuOpen(false);
                              downloadTemplateMenuCloseRef.current = null;
                            }, 120);
                          }}
                          onFocusCapture={() => setDownloadTemplateMenuOpen(true)}
                          onBlurCapture={event => {
                            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                              setDownloadTemplateMenuOpen(false);
                            }
                          }}
                        >
                          <button
                            type="button"
                            aria-label="Template options"
                            title="Template options"
                            onClick={() => setDownloadTemplateMenuOpen(prev => !prev)}
                            className="inline-flex items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-2 text-xs font-medium text-zinc-200 hover:border-lime-500/50 hover:text-lime-300 shrink-0"
                          >
                            <Menu size={14} />
                          </button>
                          {downloadTemplateMenuOpen && (
                            <div className="absolute right-0 top-full mt-1 w-28 rounded-lg border border-zinc-800 bg-zinc-950 shadow-lg shadow-black/40 z-20">
                              <button
                                type="button"
                                onClick={() => {
                                  setDownloadTemplateMenuOpen(false);
                                  resetTaskTemplateToDefault('download');
                                }}
                                className={`w-full px-3 py-2 text-left text-xs text-zinc-200 hover:bg-zinc-800/90 hover:text-zinc-50 transition-colors ${
                                  selectedDownloadTemplate || isDownloadTemplateDirty ? 'rounded-t-lg' : 'rounded-lg'
                                }`}
                              >
                                Reset to default
                              </button>
                              {selectedDownloadTemplate && isDownloadTemplateDirty && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setDownloadTemplateMenuOpen(false);
                                    saveTaskTemplateCurrent('download', selectedDownloadTemplate);
                                  }}
                                  className="w-full px-3 py-2 text-left text-xs text-zinc-200 hover:bg-zinc-800/90 hover:text-zinc-50 transition-colors"
                                >
                                  Save
                                </button>
                              )}
                              {(selectedDownloadTemplate || isDownloadTemplateDirty) && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setDownloadTemplateMenuOpen(false);
                                    saveTaskTemplate('download');
                                  }}
                                  className={`w-full px-3 py-2 text-left text-xs text-zinc-200 hover:bg-zinc-800/90 hover:text-zinc-50 transition-colors ${
                                    selectedDownloadTemplate ? '' : 'rounded-b-lg'
                                  }`}
                                >
                                  Save As
                                </button>
                              )}
                              {selectedDownloadTemplate && isDownloadTemplateDirty && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setDownloadTemplateMenuOpen(false);
                                    restoreTaskTemplateCurrent('download', selectedDownloadTemplate);
                                  }}
                                  className="w-full px-3 py-2 text-left text-xs text-zinc-200 hover:bg-zinc-800/90 hover:text-zinc-50 transition-colors"
                                >
                                  Restore
                                </button>
                              )}
                              {selectedDownloadTemplate && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setDownloadTemplateMenuOpen(false);
                                    deleteTaskTemplateWithConfirm('download', selectedDownloadTemplate.id, selectedDownloadTemplate.name);
                                  }}
                                  className="w-full px-3 py-2 text-left text-xs rounded-b-lg transition-colors text-red-300 hover:bg-red-500/10 hover:text-red-200"
                                >
                                  Delete
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    <>
                      {SHOW_PARAM_PRESETS && (
                        hasParamPresets('download') ? (
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
                        )
                      )}
                      {(!SHOW_PARAM_PRESETS || runPipelineParamPreset.download === 'custom') && (
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
                    </>
                  </div>
                )}

                {runPipelineHasUvr && (
                  <div className="border border-zinc-800 rounded-xl p-3 bg-zinc-900/70">
                    <div className="text-[11px] text-zinc-500 uppercase tracking-widest mb-2">Block Config: VR (UVR)</div>
                    <div className="flex items-center justify-between mb-3">
                      <label className="text-[11px] text-zinc-500 uppercase tracking-widest">Template</label>
                      <div className="flex items-center gap-2 min-w-0">
                        <select
                          value={runPipelineTaskTemplate.uvr ?? 'custom'}
                          onChange={e => handleTaskTemplateChange('uvr', e.target.value)}
                          onContextMenu={event => {
                            if (!selectedUvrTemplate) return;
                            event.preventDefault();
                            deleteTaskTemplateWithConfirm('uvr', selectedUvrTemplate.id, selectedUvrTemplate.name);
                          }}
                          className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1 text-xs text-zinc-200 focus:outline-none w-44 sm:w-56"
                        >
                          <option value="custom">{isUvrTemplateDirty ? '*Custom' : 'Custom'}</option>
                          {getTaskTemplatesForType('uvr').map(template => {
                            const isSelected = runPipelineTaskTemplate.uvr === template.id;
                            const label = isSelected && isUvrTemplateDirty ? `*${template.name}` : template.name;
                            return (
                              <option key={template.id} value={template.id}>{label}</option>
                            );
                          })}
                        </select>
                        <div
                          className="relative shrink-0"
                          onMouseEnter={() => {
                            if (uvrTemplateMenuCloseRef.current) {
                              window.clearTimeout(uvrTemplateMenuCloseRef.current);
                              uvrTemplateMenuCloseRef.current = null;
                            }
                            setUvrTemplateMenuOpen(true);
                          }}
                          onMouseLeave={() => {
                            if (uvrTemplateMenuCloseRef.current) {
                              window.clearTimeout(uvrTemplateMenuCloseRef.current);
                            }
                            uvrTemplateMenuCloseRef.current = window.setTimeout(() => {
                              setUvrTemplateMenuOpen(false);
                              uvrTemplateMenuCloseRef.current = null;
                            }, 120);
                          }}
                          onFocusCapture={() => setUvrTemplateMenuOpen(true)}
                          onBlurCapture={event => {
                            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                              setUvrTemplateMenuOpen(false);
                            }
                          }}
                        >
                          <button
                            type="button"
                            aria-label="Template options"
                            title="Template options"
                            onClick={() => setUvrTemplateMenuOpen(prev => !prev)}
                            className="inline-flex items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-2 text-xs font-medium text-zinc-200 hover:border-lime-500/50 hover:text-lime-300 shrink-0"
                          >
                            <Menu size={14} />
                          </button>
                          {uvrTemplateMenuOpen && (
                            <div className="absolute right-0 top-full mt-1 w-28 rounded-lg border border-zinc-800 bg-zinc-950 shadow-lg shadow-black/40 z-20">
                              <button
                                type="button"
                                onClick={() => {
                                  setUvrTemplateMenuOpen(false);
                                  resetTaskTemplateToDefault('uvr');
                                }}
                                className={`w-full px-3 py-2 text-left text-xs text-zinc-200 hover:bg-zinc-800/90 hover:text-zinc-50 transition-colors ${
                                  selectedUvrTemplate || isUvrTemplateDirty ? 'rounded-t-lg' : 'rounded-lg'
                                }`}
                              >
                                Reset to default
                              </button>
                              {selectedUvrTemplate && isUvrTemplateDirty && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setUvrTemplateMenuOpen(false);
                                    saveTaskTemplateCurrent('uvr', selectedUvrTemplate);
                                  }}
                                  className="w-full px-3 py-2 text-left text-xs text-zinc-200 hover:bg-zinc-800/90 hover:text-zinc-50 transition-colors"
                                >
                                  Save
                                </button>
                              )}
                              {(selectedUvrTemplate || isUvrTemplateDirty) && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setUvrTemplateMenuOpen(false);
                                    saveTaskTemplate('uvr');
                                  }}
                                  className={`w-full px-3 py-2 text-left text-xs text-zinc-200 hover:bg-zinc-800/90 hover:text-zinc-50 transition-colors ${
                                    selectedUvrTemplate ? '' : 'rounded-b-lg'
                                  }`}
                                >
                                  Save As
                                </button>
                              )}
                              {selectedUvrTemplate && isUvrTemplateDirty && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setUvrTemplateMenuOpen(false);
                                    restoreTaskTemplateCurrent('uvr', selectedUvrTemplate);
                                  }}
                                  className="w-full px-3 py-2 text-left text-xs text-zinc-200 hover:bg-zinc-800/90 hover:text-zinc-50 transition-colors"
                                >
                                  Restore
                                </button>
                              )}
                              {selectedUvrTemplate && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setUvrTemplateMenuOpen(false);
                                    deleteTaskTemplateWithConfirm('uvr', selectedUvrTemplate.id, selectedUvrTemplate.name);
                                  }}
                                  className="w-full px-3 py-2 text-left text-xs rounded-b-lg transition-colors text-red-300 hover:bg-red-500/10 hover:text-red-200"
                                >
                                  Delete
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    <>
                        {SHOW_PARAM_PRESETS && hasParamPresets('uvr') && (
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
                        {(!SHOW_PARAM_PRESETS || runPipelineParamPreset.uvr === 'custom') && (
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
                              {SHOW_PARAM_PRESETS && runPipelineParamPreset.uvr !== 'custom' && getSelectedParamPresetParams('uvr').backend !== undefined && (
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
                              {SHOW_PARAM_PRESETS && runPipelineParamPreset.uvr !== 'custom' && getSelectedParamPresetParams('uvr').model !== undefined && (
                                <div className="text-[10px] text-zinc-500">
                                  Loaded: {formatDefaultValue(getSelectedParamPresetParams('uvr').model)}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                    </>
                  </div>
                )}

                {runPipelineHasTts && (
                  <div className="border border-zinc-800 rounded-xl p-3 bg-zinc-900/70">
                    <div className="text-[11px] text-zinc-500 uppercase tracking-widest mb-2">Block Config: TTS</div>
                    <div className="flex items-center justify-between mb-3">
                      <label className="text-[11px] text-zinc-500 uppercase tracking-widest">Template</label>
                      <div className="flex items-center gap-2 min-w-0">
                        <select
                          value={runPipelineTaskTemplate.tts ?? 'custom'}
                          onChange={e => handleTaskTemplateChange('tts', e.target.value)}
                          onContextMenu={event => {
                            if (!selectedTtsTemplate) return;
                            event.preventDefault();
                            deleteTaskTemplateWithConfirm('tts', selectedTtsTemplate.id, selectedTtsTemplate.name);
                          }}
                          className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1 text-xs text-zinc-200 focus:outline-none w-44 sm:w-56"
                        >
                          <option value="custom">{isTtsTemplateDirty ? '*Custom' : 'Custom'}</option>
                          {getTaskTemplatesForType('tts').map(template => {
                            const isSelected = runPipelineTaskTemplate.tts === template.id;
                            const label = isSelected && isTtsTemplateDirty ? `*${template.name}` : template.name;
                            return (
                              <option key={template.id} value={template.id}>{label}</option>
                            );
                          })}
                        </select>
                        <div
                          className="relative shrink-0"
                          onMouseEnter={() => {
                            if (ttsTemplateMenuCloseRef.current) {
                              window.clearTimeout(ttsTemplateMenuCloseRef.current);
                              ttsTemplateMenuCloseRef.current = null;
                            }
                            setTtsTemplateMenuOpen(true);
                          }}
                          onMouseLeave={() => {
                            if (ttsTemplateMenuCloseRef.current) {
                              window.clearTimeout(ttsTemplateMenuCloseRef.current);
                            }
                            ttsTemplateMenuCloseRef.current = window.setTimeout(() => {
                              setTtsTemplateMenuOpen(false);
                              ttsTemplateMenuCloseRef.current = null;
                            }, 120);
                          }}
                          onFocusCapture={() => setTtsTemplateMenuOpen(true)}
                          onBlurCapture={event => {
                            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                              setTtsTemplateMenuOpen(false);
                            }
                          }}
                        >
                          <button
                            type="button"
                            aria-label="Template options"
                            title="Template options"
                            onClick={() => setTtsTemplateMenuOpen(prev => !prev)}
                            className="inline-flex items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-2 text-xs font-medium text-zinc-200 hover:border-lime-500/50 hover:text-lime-300 shrink-0"
                          >
                            <Menu size={14} />
                          </button>
                          {ttsTemplateMenuOpen && (
                            <div className="absolute right-0 top-full mt-1 w-28 rounded-lg border border-zinc-800 bg-zinc-950 shadow-lg shadow-black/40 z-20">
                              <button
                                type="button"
                                onClick={() => {
                                  setTtsTemplateMenuOpen(false);
                                  resetTaskTemplateToDefault('tts');
                                }}
                                className={`w-full px-3 py-2 text-left text-xs text-zinc-200 hover:bg-zinc-800/90 hover:text-zinc-50 transition-colors ${
                                  selectedTtsTemplate || isTtsTemplateDirty ? 'rounded-t-lg' : 'rounded-lg'
                                }`}
                              >
                                Reset to default
                              </button>
                              {selectedTtsTemplate && isTtsTemplateDirty && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setTtsTemplateMenuOpen(false);
                                    saveTaskTemplateCurrent('tts', selectedTtsTemplate);
                                  }}
                                  className="w-full px-3 py-2 text-left text-xs text-zinc-200 hover:bg-zinc-800/90 hover:text-zinc-50 transition-colors"
                                >
                                  Save
                                </button>
                              )}
                              {(selectedTtsTemplate || isTtsTemplateDirty) && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setTtsTemplateMenuOpen(false);
                                    saveTaskTemplate('tts');
                                  }}
                                  className={`w-full px-3 py-2 text-left text-xs text-zinc-200 hover:bg-zinc-800/90 hover:text-zinc-50 transition-colors ${
                                    selectedTtsTemplate ? '' : 'rounded-b-lg'
                                  }`}
                                >
                                  Save As
                                </button>
                              )}
                              {selectedTtsTemplate && isTtsTemplateDirty && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setTtsTemplateMenuOpen(false);
                                    restoreTaskTemplateCurrent('tts', selectedTtsTemplate);
                                  }}
                                  className="w-full px-3 py-2 text-left text-xs text-zinc-200 hover:bg-zinc-800/90 hover:text-zinc-50 transition-colors"
                                >
                                  Restore
                                </button>
                              )}
                              {selectedTtsTemplate && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setTtsTemplateMenuOpen(false);
                                    deleteTaskTemplateWithConfirm('tts', selectedTtsTemplate.id, selectedTtsTemplate.name);
                                  }}
                                  className="w-full px-3 py-2 text-left text-xs rounded-b-lg transition-colors text-red-300 hover:bg-red-500/10 hover:text-red-200"
                                >
                                  Delete
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    <>
                        {SHOW_PARAM_PRESETS && hasParamPresets('tts') && (
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
                        {(!SHOW_PARAM_PRESETS || runPipelineParamPreset.tts === 'custom') && (
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
                              {SHOW_PARAM_PRESETS && runPipelineParamPreset.tts !== 'custom' && getSelectedParamPresetParams('tts').voice !== undefined && (
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
                              {SHOW_PARAM_PRESETS && runPipelineParamPreset.tts !== 'custom' && getSelectedParamPresetParams('tts').overlapMode !== undefined && (
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
                              {SHOW_PARAM_PRESETS && runPipelineParamPreset.tts !== 'custom' && getSelectedParamPresetParams('tts').rate !== undefined && (
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
                              {SHOW_PARAM_PRESETS && runPipelineParamPreset.tts !== 'custom' && getSelectedParamPresetParams('tts').pitch !== undefined && (
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
                            {SHOW_PARAM_PRESETS && runPipelineParamPreset.tts !== 'custom' && getSelectedParamPresetParams('tts').removeLineBreaks !== undefined && (
                              <div className="text-[10px] text-zinc-500">
                                Loaded: {formatDefaultValue(getSelectedParamPresetParams('tts').removeLineBreaks)}
                              </div>
                            )}
                          </div>
                        )}
                    </>
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

          {SHOW_PARAM_PRESETS && paramPresetContextMenu.open && paramPresetContextTarget && (
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
          {showRenderStudio && renderStudioContextMenus}
        </div>
      </main>
    </div>
  ) : (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(700px_circle_at_15%_20%,rgba(132,204,22,0.12),transparent_60%),radial-gradient(600px_circle_at_85%_0%,rgba(16,185,129,0.16),transparent_55%)]" />
      <div className="relative min-h-screen flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md rounded-2xl border border-zinc-800/80 bg-zinc-950/80 backdrop-blur p-8 shadow-[0_0_60px_rgba(16,185,129,0.12)]">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 bg-lime-500 rounded-xl flex items-center justify-center text-zinc-950 font-black italic">MF</div>
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-lime-300/70">MediaForge Toolkit</p>
              <h1 className="text-2xl font-semibold text-zinc-100">
                {authView === 'login' ? 'Sign in' : 'Create account'}
              </h1>
            </div>
          </div>
          <p className="text-sm text-zinc-400 mb-6">
            {authView === 'login'
              ? 'Sign in to access MediaForge'
              : 'Create a new account'}
          </p>
          <form className="space-y-4" onSubmit={authView === 'login' ? handleLogin : handleRegister}>
            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">Username</label>
              <input
                value={authUsername}
                onChange={(event) => setAuthUsername(event.target.value)}
                placeholder="Enter username"
                className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-900/70 px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-lime-400/60"
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">Password</label>
              <input
                value={authPassword}
                onChange={(event) => setAuthPassword(event.target.value)}
                type="password"
                placeholder="Enter password"
                className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-900/70 px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-lime-400/60"
              />
            </div>
            {authView === 'register' && (
              <div>
                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">Confirm password</label>
                <input
                  value={authConfirmPassword}
                  onChange={(event) => setAuthConfirmPassword(event.target.value)}
                  type="password"
                  placeholder="Re-enter password"
                  className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-900/70 px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-lime-400/60"
                />
              </div>
            )}
            {authError && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                {authError}
              </div>
            )}
            <button
              type="submit"
              disabled={authSubmitting}
              className="w-full rounded-xl bg-lime-500 px-4 py-3 text-sm font-semibold text-zinc-900 transition hover:bg-lime-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {authSubmitting
                ? authView === 'login'
                  ? 'Signing in...'
                  : 'Creating account...'
                : authView === 'login'
                  ? 'Sign in'
                  : 'Create account'}
            </button>
          </form>
          <div className="mt-4 flex items-center justify-between text-xs text-zinc-400">
            {authView !== 'login' || registerEnabled !== false ? (
              <span>
                {authView === 'login' ? "Don't have an account?" : 'Already have an account?'}
              </span>
            ) : (
              <span />
            )}
            {authView !== 'login' || registerEnabled !== false ? (
              <button
                type="button"
                onClick={() => {
                  if (authView === 'login' && registerEnabled === false) {
                    return;
                  }
                  navigateAuth(authView === 'login' ? 'register' : 'login');
                }}
                className="text-lime-300 hover:text-lime-200 font-semibold"
              >
                {authView === 'login' ? 'Create account' : 'Sign in'}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
