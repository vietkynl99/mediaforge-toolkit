import React, { useEffect, useRef, useState } from 'react';
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
  MoreVertical,
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
  Folder,
  FolderOpen,
  Languages,
  Scissors,
  Search,
  Filter
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

const JobRow = ({ job, onLog, onCancel, onDelete }: { job: MediaJob; onLog: (jobId: string) => void; onCancel: (jobId: string) => void; onDelete: (jobId: string) => void }) => (
  <motion.div 
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    className="grid grid-cols-[130px_minmax(0,1fr)_130px_120px_110px_100px_72px] items-center gap-4 p-4 border-b border-zinc-800 hover:bg-zinc-800/30 transition-colors group"
  >
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

    <div className="text-xs text-zinc-500">
      {job.durationMs !== undefined ? formatDurationMs(job.durationMs) : '--'}
    </div>

    <div className="flex w-[100px] justify-start shrink-0">
      <StatusBadge status={job.status} />
    </div>

    <div className="flex w-[72px] items-center justify-start gap-1 shrink-0">
      <button
        onClick={() => onLog(job.id)}
        className="p-2 text-zinc-400 hover:text-lime-300 hover:bg-lime-500/10 rounded-md"
        title="System log"
      >
        <Terminal size={16} />
      </button>
      {(job.status === 'queued' || job.status === 'processing') && (
        <button
          onClick={() => onCancel(job.id)}
          className="p-2 text-zinc-400 hover:text-amber-300 hover:bg-amber-500/10 rounded-md"
          title="Cancel job"
        >
          <Pause size={16} />
        </button>
      )}
      {!(job.status === 'queued' || job.status === 'processing') && (
        <button
          title="Delete"
          onClick={() => onDelete(job.id)}
          className="p-2 text-zinc-400 hover:text-red-400 hover:bg-red-400/10 rounded-md"
        >
          <Trash2 size={16} />
        </button>
      )}
    </div>
  </motion.div>
);

// --- Media Vault Mock Data ---

type VaultFileType = 'video' | 'audio' | 'subtitle' | 'output' | 'other';
type VaultStatus = 'raw' | 'partial' | 'complete' | 'error' | 'processing';

interface VaultFile {
  id: string;
  name: string;
  type: VaultFileType;
  size: string;
  relativePath?: string;
  duration?: string;
  language?: string;
  linkedTo?: string;
  status?: VaultStatus;
  progress?: number;
  version?: string;
  uvr?: {
    processedAt: string;
    backend?: string;
    model?: string;
    outputFormat?: string;
    outputs?: string[];
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
  uvr?: {
    processedAt: string;
    backend?: string;
    model?: string;
    outputFormat?: string;
    outputs?: string[];
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

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [searchQuery, setSearchQuery] = useState('');
  const [jobs, setJobs] = useState<MediaJob[]>([]);
  const [jobPage, setJobPage] = useState(1);
  const [jobLogOpen, setJobLogOpen] = useState(false);
  const [jobLogJobId, setJobLogJobId] = useState<string | null>(null);
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
  const [showFolderPanel, setShowFolderPanel] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastVisible, setToastVisible] = useState(false);
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
  const [showPipelinePreview, setShowPipelinePreview] = useState(false);
  const [isEditingPipelineName, setIsEditingPipelineName] = useState(false);
  const [pipelinePreviewTask, setPipelinePreviewTask] = useState<{
    type: string;
    label: string;
    desc: string;
    inputs: string[];
    outputs: string[];
    params?: Array<{ name: string; desc: string; type: 'string' | 'number'; default?: string | number }>;
    preview?: 'tts';
  } | null>(null);
  const [previewTtsText, setPreviewTtsText] = useState('Xin chào, hôm nay trời đẹp và mình nói tiếng Việt.');
  const [previewTtsVoice, setPreviewTtsVoice] = useState('vi-VN-HoaiMyNeural');
  const [previewTtsRate, setPreviewTtsRate] = useState('');
  const [previewTtsPitch, setPreviewTtsPitch] = useState('');
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
  const [previewCustomParams, setPreviewCustomParams] = useState<Record<string, string | number>>({});
  const [runPipelineId, setRunPipelineId] = useState<string | null>(null);
  const [runPipelineGraph, setRunPipelineGraph] = useState<any>(null);
  const [runPipelineLoading, setRunPipelineLoading] = useState(false);
  const [runPipelineInputId, setRunPipelineInputId] = useState<string | null>(null);
  const [runPipelineProjectId, setRunPipelineProjectId] = useState<string | null>(null);
  const [runPipelineProjectLocked, setRunPipelineProjectLocked] = useState(false);
  const [runPipelineSubmitting, setRunPipelineSubmitting] = useState(false);
  const [runPipelineBackend, setRunPipelineBackend] = useState('vr');
  const [downloadUrl, setDownloadUrl] = useState('');
  const [downloadProjectName, setDownloadProjectName] = useState('');
  const [downloadProjectPickerOpen, setDownloadProjectPickerOpen] = useState(false);
  const [downloadCookiesFile, setDownloadCookiesFile] = useState<File | null>(null);
  const [downloadNoPlaylist, setDownloadNoPlaylist] = useState(true);
  const [downloadSubtitleLang, setDownloadSubtitleLang] = useState('ai-zh');
  const [downloadAnalyzeLoading, setDownloadAnalyzeLoading] = useState(false);
  const [downloadAnalyzeError, setDownloadAnalyzeError] = useState<string | null>(null);
  const [downloadAnalyzeResult, setDownloadAnalyzeResult] = useState<any>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const TASK_PIPELINE_PREFIX = 'task:';

  const selectedFolder = vaultFolders.find(folder => folder.id === vaultFolderId) ?? null;
  const selectedFile = selectedFolder?.files.find(file => file.id === vaultFileId) ?? null;
  const runPipelineProject = vaultFolders.find(folder => folder.id === (runPipelineProjectId ?? '')) ?? null;
  const runPipelineInput = runPipelineProject?.files.find(file => file.id === runPipelineInputId) ?? null;
  const runPipelineHasUvr = Boolean(runPipelineGraph?.nodes?.some((node: any) => node?.type === 'uvr'));
  const runPipelineHasDownload = runPipelineId?.startsWith(TASK_PIPELINE_PREFIX)
    ? runPipelineId.slice(TASK_PIPELINE_PREFIX.length) === 'download'
    : Boolean(runPipelineGraph?.nodes?.some((node: any) => node?.type === 'download'));
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
    output: FileVideo,
    other: FileAudio
  };

  const fileTypeLabels: Record<VaultFileType, string> = {
    video: 'Video',
    audio: 'Audio',
    subtitle: 'Subtitle',
    output: 'Output',
    other: 'Other'
  };

  const statusStyles: Record<VaultStatus, string> = {
    raw: 'text-zinc-400 bg-zinc-400/10',
    partial: 'text-blue-400 bg-blue-400/10',
    complete: 'text-lime-400 bg-lime-400/10',
    error: 'text-red-400 bg-red-400/10',
    processing: 'text-blue-400 bg-blue-400/10'
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

  const groupedFiles = ['video', 'audio', 'subtitle', 'output', 'other'].map(type => ({
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

  const previewGroups = (folder: VaultFolder) => ([
    { type: 'video' as VaultFileType, label: 'Video' },
    { type: 'audio' as VaultFileType, label: 'Audio' },
    { type: 'subtitle' as VaultFileType, label: 'Subtitle' },
    { type: 'other' as VaultFileType, label: 'Other' }
  ]).map(group => ({
    ...group,
    items: folder.files.filter(file => file.type === group.type)
  }));

  const buildTooltip = (files: VaultFile[]) =>
    files.length ? files.map(file => file.name).join('\n') : 'No files';

  const PREFERRED_TTS_VOICES = ['vi-VN-HoaiMyNeural', 'vi-VN-NamMinhNeural'];

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

  const availableTasks = [
    {
      type: 'download',
      icon: Download,
      label: 'Download (yt-dlp)',
      desc: 'Download video and subtitles using yt-dlp.',
      inputs: ['URL', 'Project'],
      outputs: ['Video', 'Subtitle (optional)'],
      params: [
        { name: 'url', desc: 'Video URL to download.', type: 'string' },
        { name: 'projectName', desc: 'Project folder name.', type: 'string' },
        { name: 'cookiesFile', desc: 'Optional cookies file upload.', type: 'string' },
        { name: 'noPlaylist', desc: 'Disable playlist downloads.', type: 'string' }
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
        { name: 'backend', desc: 'Processing backend', type: 'string' },
        { name: 'model', desc: 'Model file to use', type: 'string' },
        { name: 'outputFormat', desc: 'Output audio format', type: 'string' }
      ]
    },
    {
      type: 'tts',
      icon: FileAudio,
      label: 'Text-to-Speech',
      desc: 'Generate speech audio from text.',
      inputs: ['Text'],
      outputs: ['Audio'],
      params: [
        { name: 'text', desc: 'Text content to synthesize.', type: 'string', default: 'Xin chào, hôm nay trời đẹp và mình nói tiếng Việt.' },
        { name: 'voice', desc: 'Voice name', type: 'string', default: 'vi-VN-HoaiMyNeural' },
        { name: 'rate', desc: 'Speaking rate factor', type: 'number', default: 1 },
        { name: 'pitch', desc: 'Pitch in semitone', type: 'number', default: 0 }
      ],
      preview: 'tts'
    },
    {
      type: 'stt',
      icon: Type,
      label: 'Speech-to-Text',
      desc: 'Whisper-based transcription into subtitles.',
      inputs: ['Audio'],
      outputs: ['Subtitle'],
      params: [
        { name: 'language', desc: 'Optional language hint.', type: 'string' }
      ]
    },
    {
      type: 'translate',
      icon: Languages,
      label: 'Translation',
      desc: 'Translate subtitles across languages.',
      inputs: ['Subtitle'],
      outputs: ['Subtitle'],
      params: [
        { name: 'targetLang', desc: 'Target language code.', type: 'string' }
      ]
    },
    {
      type: 'edit',
      icon: Scissors,
      label: 'Subtitle Editor',
      desc: 'Refine timing and text.',
      inputs: ['Subtitle'],
      outputs: ['Subtitle'],
      params: [
        { name: 'mode', desc: 'Editing mode preset.', type: 'string' }
      ]
    },
    {
      type: 'burn',
      icon: FileVideo,
      label: 'Subtitle Burn',
      desc: 'Hardcode subtitles into video.',
      inputs: ['Video', 'Subtitle'],
      outputs: ['Video'],
      params: [
        { name: 'style', desc: 'Subtitle style preset.', type: 'string' }
      ]
    }
  ];

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
        if (defaults.text !== undefined) setPreviewTtsText(String(defaults.text));
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
    if (!showPipelinePreview || pipelinePreviewTask?.preview !== 'tts') return;
    const loadVoices = async () => {
      setPreviewTtsVoicesLoading(true);
      try {
        const response = await fetch('/api/tts/voices');
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error || 'Unable to load voices');
        }
        const data = await response.json() as { voices: Array<{ Name: string; ShortName?: string; Locale?: string; Gender?: string }> };
        setPreviewTtsVoices(data.voices ?? []);
      } catch (error) {
        setPreviewTtsError(error instanceof Error ? error.message : 'Unable to load voices');
      } finally {
        setPreviewTtsVoicesLoading(false);
      }
    };
    loadVoices();
  }, [showPipelinePreview, pipelinePreviewTask?.preview]);

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
      setToastMessage(message);
      setToastVisible(true);
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
      return;
    }
  };

  useEffect(() => {
    loadPipelines();
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
      setToastMessage(message);
      setToastVisible(true);
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
      setToastMessage(message);
      setToastVisible(true);
    }
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
    if (runPipelineHasDownload) {
      setDownloadProjectName(prev => prev || runPipelineProject?.name || '');
      return;
    }
    setDownloadProjectName('');
    setDownloadUrl('');
    setDownloadCookiesFile(null);
    setDownloadNoPlaylist(true);
    setDownloadSubtitleLang('ai-zh');
    setDownloadAnalyzeError(null);
    setDownloadAnalyzeResult(null);
  }, [runPipelineHasDownload, runPipelineProject?.name]);

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
      setToastMessage(message);
      setToastVisible(true);
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
    const firstMedia = selectedFolder.files.find(file => file.type === 'video' || file.type === 'audio');
    setRunPipelineInputId(firstMedia?.id ?? null);
  }, [selectedFolder?.id]);

  useEffect(() => {
    if (!runPipelineProject) return;
    const firstMedia = runPipelineProject.files.find(file => file.type === 'video' || file.type === 'audio');
    setRunPipelineInputId(firstMedia?.id ?? null);
  }, [runPipelineProject?.id]);

  const savePipeline = async (nameOverride?: string) => {
    if (!graphNodes.length) {
      setToastMessage('Add at least 1 task');
      setToastVisible(true);
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
      setToastMessage('Pipeline saved');
      setToastVisible(true);
      setPipelineName(finalName);
      setShowPipelineEditor(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save pipeline';
      setToastMessage(message);
      setToastVisible(true);
    } finally {
      setPipelineSaving(false);
    }
  };

  const performDeletePipeline = async (id: string) => {
    if (id.startsWith(TASK_PIPELINE_PREFIX)) {
      setToastMessage('Built-in tasks cannot be deleted.');
      setToastVisible(true);
      return;
    }
    const previous = pipelineLibrary;
    setPipelineLibrary(prev => prev.filter(item => item.id !== id));
    if (!Number.isFinite(Number(id))) {
      setToastMessage('Pipeline removed (local)');
      setToastVisible(true);
      return;
    }
    try {
      const response = await fetch(`/api/pipelines/${id}`, { method: 'DELETE' });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Unable to delete pipeline');
      }
      await loadPipelines();
      setToastMessage('Pipeline deleted');
      setToastVisible(true);
    } catch (error) {
      setPipelineLibrary(previous);
      const message = error instanceof Error ? error.message : 'Unable to delete pipeline';
      setToastMessage(message);
      setToastVisible(true);
    }
  };

  const deletePipeline = (id: string) => {
    if (id.startsWith(TASK_PIPELINE_PREFIX)) {
      setToastMessage('Built-in tasks cannot be deleted.');
      setToastVisible(true);
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
            language: file.type === 'subtitle' ? guessLanguage(file.name) : undefined,
            status: file.type === 'output' ? 'complete' : file.type === 'subtitle' ? 'partial' : 'raw',
            version: file.type === 'subtitle' ? guessVersion(file.name) : undefined,
            createdAt: formatRelativeTime(file.modifiedAt),
            uvr: file.uvr,
          };
        });

        const mainVideo = mappedFiles.find(item => item.type === 'video')?.id;
        const linkedFiles = mappedFiles.map(item => {
          if (item.type !== 'video' && mainVideo) {
            return { ...item, linkedTo: mainVideo };
          }
          return item;
        });

        const status = computeFolderStatus(linkedFiles);
        const tags = status === 'complete'
          ? ['Ready']
          : status === 'partial'
            ? ['In review']
            : status === 'error'
              ? ['Needs attention']
              : ['Raw'];

        const hasSubtitle = linkedFiles.some(item => item.type === 'subtitle');
        const hasOutput = linkedFiles.some(item => item.type === 'output');
        const suggestedAction = !hasSubtitle
          ? 'No subtitles detected → Generate now?'
          : !hasOutput
            ? 'No outputs yet → Render preview?'
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
        setToastMessage(message);
        setToastVisible(true);
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
      setToastMessage(`Deleted ${folder.name}`);
      setToastVisible(true);
      if (vaultFolderId === folder.id) {
        setVaultFolderId(null);
        setVaultFileId(null);
      }
      await loadVault();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to delete project';
      setToastMessage(message);
      setToastVisible(true);
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
      setToastMessage('Select a pipeline first');
      setToastVisible(true);
      return;
    }
    if (runPipelineHasDownload) {
      if (!downloadUrl.trim()) {
        setToastMessage('Enter a download URL first');
        setToastVisible(true);
        return;
      }
      if (!downloadProjectName.trim()) {
        setToastMessage('Enter a project name first');
        setToastVisible(true);
        return;
      }
    } else if (!runPipelineInput?.relativePath) {
      setToastMessage('Select an input file first');
      setToastVisible(true);
      return;
    }
    setRunPipelineSubmitting(true);
    try {
      const pipelinePayload: Record<string, any> = runPipelineHasDownload
        ? {
            url: downloadUrl.trim(),
            projectName: downloadProjectName.trim(),
            noPlaylist: downloadNoPlaylist,
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
      if (!response.ok) {
        throw new Error(data.error || 'Unable to run pipeline');
      }
      if (data?.skipped) {
        setToastMessage(data.message || 'Project already exists. Skipped download.');
        setToastVisible(true);
        setShowRunPipeline(false);
        return;
      }
      await loadJobs();
      setToastMessage('Pipeline queued');
      setToastVisible(true);
      setShowRunPipeline(false);
      setActiveTab('dashboard');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to run pipeline';
      setToastMessage(message);
      setToastVisible(true);
    } finally {
      setRunPipelineSubmitting(false);
    }
  };

  const resetDownloadForm = () => {
    setDownloadProjectName('');
    setDownloadUrl('');
    setDownloadCookiesFile(null);
    setDownloadNoPlaylist(true);
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


  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-300 font-sans selection:bg-lime-500/30 selection:text-lime-200">
      {/* Sidebar Navigation Rail */}
      <aside className={`${sidebarCollapsed ? 'w-20' : 'w-64'} border-r border-zinc-800 flex flex-col p-4 gap-6 transition-all duration-300`}>
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className={`flex items-center ${sidebarCollapsed ? 'justify-center' : 'gap-3 px-2'} mb-2 w-full text-left`}
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
                  <div className="grid grid-cols-[130px_minmax(0,1fr)_130px_120px_110px_100px_72px] gap-4 px-4 py-3 bg-zinc-900/50 border-b border-zinc-800 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                    <span>Created</span>
                    <span>Job Details</span>
                    <span>Pipeline</span>
                    <span>Progress</span>
                    <span>Duration</span>
                    <span>Status</span>
                    <span>Actions</span>
                  </div>
                  
                  <div className="flex flex-col">
                    {jobs.length === 0 ? (
                      <div className="p-6 text-sm text-zinc-500">No jobs yet. Run a pipeline to start processing.</div>
                    ) : (
                      jobs
                        .slice((jobPage - 1) * 10, jobPage * 10)
                        .map(job => (
                        <JobRow
                          key={job.id}
                          job={job}
                          onLog={(jobId) => {
                            setJobLogJobId(jobId);
                            setJobLogOpen(true);
                          }}
                          onCancel={cancelJob}
                          onDelete={deleteJob}
                        />
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

                <div className="bg-zinc-900/30 border border-zinc-800 rounded-xl p-5 mb-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-500">Available pipelines</h3>
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
                            {pipeline.steps} steps • {pipeline.updatedAt === 'Built-in' ? 'Built-in' : `Updated ${pipeline.updatedAt}`}
                          </div>
                          </div>
                        </div>
                        {pipeline.kind === 'saved' && (
                          <button
                            onClick={event => {
                              event.stopPropagation();
                              deletePipeline(pipeline.id);
                            }}
                            className="h-8 w-8 rounded-md border border-transparent text-red-300/0 opacity-0 transition-all group-hover:opacity-100 group-hover:text-red-300 hover:border-red-400/40 hover:text-red-200"
                            title="Delete pipeline"
                            aria-label="Delete pipeline"
                            type="button"
                          >
                            <Trash2 size={14} className="mx-auto" />
                          </button>
                        )}
                      </div>
                    );
                    })}
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
                                      previewTtsVoicesLoading ? (
                                        <div className="text-xs text-zinc-500">Loading voices...</div>
                                      ) : (
                                        <select
                                          value={previewTtsVoice}
                                          onChange={e => {
                                            const value = e.target.value;
                                            setPreviewTtsVoice(value);
                                            setPreviewCustomParams(prev => ({ ...prev, voice: value }));
                                          }}
                                          className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none"
                                        >
                                          {(() => {
                                            const byKey = new Map<string, { Name: string; ShortName?: string; Locale?: string; Gender?: string }>();
                                            previewTtsVoices.forEach(voice => {
                                              const key = voice.ShortName || voice.Name;
                                              if (key) byKey.set(key, voice);
                                            });
                                            PREFERRED_TTS_VOICES.forEach(name => {
                                              if (!byKey.has(name)) {
                                                byKey.set(name, { Name: name, ShortName: name, Locale: 'vi-VN' });
                                              }
                                            });
                                            const sorted = Array.from(byKey.values()).sort((a, b) => {
                                              const aKey = a.ShortName || a.Name;
                                              const bKey = b.ShortName || b.Name;
                                              const aPreferred = PREFERRED_TTS_VOICES.includes(aKey) ? 0 : 1;
                                              const bPreferred = PREFERRED_TTS_VOICES.includes(bKey) ? 0 : 1;
                                              if (aPreferred !== bPreferred) return aPreferred - bPreferred;
                                              return aKey.localeCompare(bKey);
                                            });
                                            if (!sorted.length) {
                                              return <option value={previewTtsVoice}>{previewTtsVoice}</option>;
                                            }
                                            return sorted.map(voice => {
                                              const value = voice.ShortName || voice.Name;
                                              const label = `${value}${voice.Locale ? ` • ${voice.Locale}` : ''}${voice.Gender ? ` • ${voice.Gender}` : ''}`;
                                              return (
                                                <option key={value} value={value}>
                                                  {label}
                                                </option>
                                              );
                                            });
                                          })()}
                                        </select>
                                      )
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
                                setPreviewCustomParams(prev => ({ ...prev, text: value }));
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
                                      text: previewCustomParams.text ?? previewTtsText,
                                      voice: previewCustomParams.voice ?? previewTtsVoice,
                                      rate: toEdgeTtsRate(String(previewCustomParams.rate ?? previewTtsRate)) || undefined,
                                      pitch: toEdgeTtsPitch(String(previewCustomParams.pitch ?? previewTtsPitch)) || undefined
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
              <div className="fixed bottom-6 right-6 z-[70] px-4 py-2 rounded-lg border border-lime-500/30 bg-lime-500/15 text-lime-200 text-sm shadow-lg">
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
                      <button
                        onClick={loadVault}
                        className="ml-auto text-zinc-400 hover:text-zinc-100 transition-colors"
                        title="Rescan folders"
                      >
                        <RefreshCw size={14} className={vaultLoading ? 'animate-spin-soft' : ''} />
                      </button>
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
                                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${statusStyles[folder.status]}`}>
                                      {folder.status}
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
                          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${statusStyles[selectedFile.status ?? 'raw']}`}>
                            {selectedFile.status ?? 'raw'}
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
                                  <div key={item.id} className="flex items-center justify-between text-xs text-zinc-300">
                                    <div className="min-w-0">
                                      <div className="truncate text-zinc-200">{item.name}</div>
                                      <div className="text-[10px] text-zinc-500 mt-1">
                                        {item.size}
                                        {item.duration ? ` • ${item.duration}` : ''}
                                        {item.language ? ` • ${item.language}` : ''}
                                      </div>
                                    </div>
                                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${statusStyles[item.status ?? 'raw']}`}>
                                      {item.status ?? 'raw'}
                                    </span>
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

                {showFolderPanel && selectedFolder && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/70 backdrop-blur-sm">
                    <div className="absolute inset-0" onClick={() => setShowFolderPanel(false)} />
                    <div className="relative w-[min(960px,92vw)] h-[min(720px,86vh)] bg-zinc-900/95 border border-zinc-800 rounded-2xl p-6 flex flex-col gap-5 shadow-2xl">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="text-xs text-zinc-500 uppercase tracking-widest">Root / {selectedFolder.name}</div>
                          <h3 className="text-xl font-bold text-zinc-100 mt-1">{selectedFolder.name}</h3>
                          <div className="flex items-center gap-2 mt-2">
                            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${statusStyles[selectedFolder.status]}`}>
                              {selectedFolder.status}
                            </span>
                            <span className="text-xs text-zinc-500">Last activity {selectedFolder.lastActivity}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button className="px-3 py-2 text-xs font-semibold bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-200 hover:border-lime-500/40 transition-colors">
                            Quick Actions
                          </button>
                          <button className="px-3 py-2 text-xs font-semibold bg-lime-500 text-zinc-950 rounded-lg hover:bg-lime-400 transition-colors">
                            New Job
                          </button>
                          <button
                            onClick={() => setShowFolderPanel(false)}
                            className="px-3 py-2 text-xs font-semibold border border-zinc-800 rounded-lg text-zinc-400 hover:text-zinc-100 hover:border-zinc-700"
                          >
                            Close
                          </button>
                        </div>
                      </div>

                      {selectedFolder.suggestedAction && (
                        <div className="flex items-center justify-between bg-blue-500/10 border border-blue-500/30 text-blue-200 px-4 py-3 rounded-xl text-sm">
                          <span>{selectedFolder.suggestedAction}</span>
                          <button className="px-3 py-1 text-xs font-semibold bg-blue-500/20 text-blue-100 rounded-lg border border-blue-500/40">
                            Do It
                          </button>
                        </div>
                      )}

                      <div className="grid grid-cols-4 gap-3">
                        {(['video', 'audio', 'subtitle', 'output'] as VaultFileType[]).map(type => {
                          const count = selectedFolder.files.filter(file => file.type === type).length;
                          const Icon = fileTypeIcons[type];
                          return (
                            <div key={type} className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-3">
                              <div className="flex items-center gap-2 text-xs text-zinc-500">
                                <Icon size={14} />
                                {fileTypeLabels[type]}
                              </div>
                              <div className="text-lg font-bold text-zinc-100 mt-2">{count}</div>
                            </div>
                          );
                        })}
                      </div>

                      {selectedFile && (
                        <div className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3">
                          <div>
                            <div className="text-xs text-zinc-500 uppercase tracking-widest">Selected File</div>
                            <div className="text-sm font-semibold text-zinc-100">{selectedFile.name}</div>
                            <div className="text-xs text-zinc-500 mt-1">{fileTypeLabels[selectedFile.type]} • {selectedFile.size}</div>
                          </div>
                          <div className="flex items-center gap-2">
                            {selectedFile.type === 'video' && (
                              <>
                                <button className="px-3 py-2 text-xs border border-zinc-800 rounded-lg text-zinc-300 hover:border-lime-500/40">Extract Audio</button>
                                <button className="px-3 py-2 text-xs border border-zinc-800 rounded-lg text-zinc-300 hover:border-lime-500/40">Generate Subs</button>
                                <button className="px-3 py-2 text-xs bg-lime-500 text-zinc-950 rounded-lg hover:bg-lime-400">Burn Subs</button>
                              </>
                            )}
                            {selectedFile.type === 'audio' && (
                              <>
                                <button className="px-3 py-2 text-xs border border-zinc-800 rounded-lg text-zinc-300 hover:border-lime-500/40">Run UVR</button>
                                <button className="px-3 py-2 text-xs bg-lime-500 text-zinc-950 rounded-lg hover:bg-lime-400">Normalize</button>
                              </>
                            )}
                            {selectedFile.type === 'subtitle' && (
                              <>
                                <button className="px-3 py-2 text-xs border border-zinc-800 rounded-lg text-zinc-300 hover:border-lime-500/40">Edit</button>
                                <button className="px-3 py-2 text-xs bg-lime-500 text-zinc-950 rounded-lg hover:bg-lime-400">Translate</button>
                              </>
                            )}
                          </div>
                        </div>
                      )}

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="text-xs text-zinc-500 uppercase tracking-widest">Files</div>
                          <div className="text-xs text-zinc-500">({filteredFiles.length})</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-400">
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
                            className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-2 text-xs text-zinc-300 focus:outline-none"
                          >
                            <option value="all">All Types</option>
                            <option value="video">Video</option>
                            <option value="audio">Audio</option>
                            <option value="subtitle">Subtitle</option>
                            <option value="output">Output</option>
                            <option value="other">Other</option>
                          </select>
                          <select
                            value={vaultSort}
                            onChange={e => setVaultSort(e.target.value as 'recent' | 'name' | 'size')}
                            className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-2 text-xs text-zinc-300 focus:outline-none"
                          >
                            <option value="recent">Recent</option>
                            <option value="name">Name</option>
                            <option value="size">Size</option>
                          </select>
                          <button
                            onClick={() => setVaultView(vaultView === 'grouped' ? 'flat' : 'grouped')}
                            className="px-3 py-2 text-xs border border-zinc-800 rounded-lg text-zinc-300 hover:border-lime-500/40"
                          >
                            {vaultView === 'grouped' ? 'Flat View' : 'Grouped View'}
                          </button>
                        </div>
                      </div>

                      <div className="flex-1 overflow-y-auto pr-1">
                        <div className="flex flex-col gap-4">
                          {vaultView === 'grouped' ? (
                            groupedFiles.map(group => {
                              if (group.items.length === 0) return null;
                              return (
                                <div key={group.type} className="flex flex-col gap-2">
                                  <div className="flex items-center justify-between text-xs font-semibold text-zinc-400 uppercase tracking-widest">
                                    <span>{fileTypeLabels[group.type]}</span>
                                    <span>{group.items.length}</span>
                                  </div>
                                  <div className="flex flex-col gap-2">
                                    {group.items.map(file => {
                                      const isSelected = file.id === selectedFile?.id;
                                      const Icon = fileTypeIcons[file.type];
                                      return (
                                        <button
                                          key={file.id}
                                          onClick={() => setVaultFileId(file.id)}
                                          className={`text-left border rounded-xl p-4 transition-colors ${
                                            isSelected ? 'border-lime-500/50 bg-lime-500/10' : 'border-zinc-800 bg-zinc-900/70 hover:border-zinc-700'
                                          }`}
                                        >
                                          <div className="flex items-start justify-between gap-4">
                                            <div className="flex items-start gap-3">
                                              <div className="p-2 bg-zinc-800 rounded-lg text-zinc-400">
                                                <Icon size={16} />
                                              </div>
                                              <div>
                                                <div className="text-sm font-semibold text-zinc-100">{file.name}</div>
                                                <div className="text-xs text-zinc-500 mt-1">
                                                  {fileTypeLabels[file.type]} • {file.size}{file.duration ? ` • ${file.duration}` : ''}{file.language ? ` • ${file.language}` : ''}
                                                </div>
                                                {file.linkedTo && (
                                                  <div className="text-[11px] text-zinc-500 mt-1">Linked to {selectedFolder.files.find(item => item.id === file.linkedTo)?.name ?? 'source file'}</div>
                                                )}
                                              </div>
                                            </div>
                                            <div className="flex flex-col items-end gap-2">
                                              <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${statusStyles[file.status ?? 'raw']}`}>
                                                {file.status ?? 'raw'}
                                              </span>
                                              {file.uvr && (
                                                <span
                                                  title={`UVR • ${formatLocalDateTime(file.uvr.processedAt)}${file.uvr.model ? ` • ${file.uvr.model}` : ''}${file.uvr.backend ? ` • ${file.uvr.backend}` : ''}`}
                                                  className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-lime-500/15 text-lime-400"
                                                >
                                                  UVR
                                                </span>
                                              )}
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
                                          <div className="mt-3 flex items-center gap-2 text-xs text-zinc-400">
                                            <button className="px-2 py-1 border border-zinc-800 rounded-md hover:border-lime-500/40">Actions</button>
                                            <button className="px-2 py-1 border border-zinc-800 rounded-md hover:border-lime-500/40">Create Job</button>
                                          </div>
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })
                          ) : (
                            <div className="flex flex-col gap-2">
                              {filteredFiles.map(file => {
                                    const isSelected = file.id === selectedFile?.id;
                                    const Icon = fileTypeIcons[file.type];
                                    return (
                                      <button
                                        key={file.id}
                                        onClick={() => setVaultFileId(file.id)}
                                        className={`text-left border rounded-xl p-4 transition-colors ${
                                          isSelected ? 'border-lime-500/50 bg-lime-500/10' : 'border-zinc-800 bg-zinc-900/70 hover:border-zinc-700'
                                        }`}
                                      >
                                        <div className="flex items-start justify-between gap-4">
                                          <div className="flex items-start gap-3">
                                            <div className="p-2 bg-zinc-800 rounded-lg text-zinc-400">
                                              <Icon size={16} />
                                            </div>
                                            <div>
                                              <div className="text-sm font-semibold text-zinc-100">{file.name}</div>
                                              <div className="text-xs text-zinc-500 mt-1">
                                                {fileTypeLabels[file.type]} • {file.size}{file.duration ? ` • ${file.duration}` : ''}{file.language ? ` • ${file.language}` : ''}
                                              </div>
                                              {file.linkedTo && (
                                                <div className="text-[11px] text-zinc-500 mt-1">Linked to {selectedFolder.files.find(item => item.id === file.linkedTo)?.name ?? 'source file'}</div>
                                              )}
                                            </div>
                                          </div>
                                          <div className="flex flex-col items-end gap-2">
                                            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${statusStyles[file.status ?? 'raw']}`}>
                                              {file.status ?? 'raw'}
                                            </span>
                                            {file.uvr && (
                                              <span
                                                title={`UVR • ${formatLocalDateTime(file.uvr.processedAt)}${file.uvr.model ? ` • ${file.uvr.model}` : ''}${file.uvr.backend ? ` • ${file.uvr.backend}` : ''}`}
                                                className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-lime-500/15 text-lime-400"
                                              >
                                                UVR
                                              </span>
                                            )}
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
                                        <div className="mt-3 flex items-center gap-2 text-xs text-zinc-400">
                                          <button className="px-2 py-1 border border-zinc-800 rounded-md hover:border-lime-500/40">Actions</button>
                                          <button className="px-2 py-1 border border-zinc-800 rounded-md hover:border-lime-500/40">Create Job</button>
                                        </div>
                                      </button>
                                    );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
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
                        setToastMessage(message);
                        setToastVisible(true);
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
              <div className="absolute inset-0" onClick={() => setShowRunPipeline(false)} />
              <div className="relative w-[min(700px,92vw)] max-h-[85vh] bg-zinc-900/95 border border-zinc-800 rounded-2xl p-6 flex flex-col gap-5 shadow-2xl overflow-y-auto">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs text-zinc-500 uppercase tracking-widest">Run Pipeline</div>
                    <div className="text-lg font-semibold text-zinc-100">
                      {runPipelineHasDownload ? (downloadProjectName || 'New Project') : (runPipelineProject?.name ?? 'Project')}
                    </div>
                  </div>
                  <button
                    onClick={() => setShowRunPipeline(false)}
                    className="px-3 py-2 text-xs font-semibold border border-zinc-800 rounded-lg text-zinc-400 hover:text-zinc-100 hover:border-zinc-700"
                  >
                    Close
                  </button>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-xs text-zinc-500 uppercase tracking-widest">
                    {runPipelineHasDownload ? 'Project' : 'Project'}
                  </label>
                  {runPipelineHasDownload ? (
                    <div className="flex flex-col gap-2">
                      <div className="relative">
                        <input
                          value={downloadProjectName}
                          onChange={e => {
                            setDownloadProjectName(e.target.value);
                            setDownloadProjectPickerOpen(true);
                          }}
                          onFocus={() => setDownloadProjectPickerOpen(true)}
                          onBlur={() => setTimeout(() => setDownloadProjectPickerOpen(false), 120)}
                          className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none"
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
                                    setDownloadProjectPickerOpen(false);
                                  }}
                                  className="w-full px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-900"
                                >
                                  {folder.name}
                                </button>
                              ))}
                            {vaultFolders.filter(folder => folder.name.toLowerCase().includes(downloadProjectName.trim().toLowerCase())).length === 0 && (
                              <div className="px-3 py-2 text-xs text-zinc-500">No matches</div>
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
                      className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none disabled:opacity-60"
                    >
                      <option value="" disabled>Select a project</option>
                      {vaultFolders.map(folder => (
                        <option key={folder.id} value={folder.id}>{folder.name}</option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-xs text-zinc-500 uppercase tracking-widest">Pipeline</label>
                  <select
                    value={runPipelineId ?? ''}
                    onChange={e => setRunPipelineId(e.target.value || null)}
                    disabled={pipelineLibrary.length === 0}
                    className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none"
                  >
                    {pipelineLibrary.length === 0 && (
                      <option value="">No pipelines saved</option>
                    )}
                    {pipelineLibrary.map(pipe => (
                      <option key={pipe.id} value={pipe.id}>{pipe.name}</option>
                    ))}
                  </select>
                </div>

                <div className="border border-zinc-800 rounded-xl p-4 bg-zinc-900/70">
                  <div className="text-xs text-zinc-500 uppercase tracking-widest mb-3">
                    {runPipelineHasDownload ? 'Inputs (URL)' : 'Inputs (Video/Audio)'}
                  </div>
                  {runPipelineLoading ? (
                    <div className="text-xs text-zinc-500">Loading...</div>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {runPipelineHasDownload ? (
                        <div className="flex flex-col gap-2">
                          <input
                            value={downloadUrl}
                            onChange={e => setDownloadUrl(e.target.value)}
                            className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none"
                            placeholder="https://..."
                          />
                          <label className="flex items-center justify-between gap-3 px-3 py-2 border border-dashed border-zinc-700 rounded-lg text-sm text-zinc-400 hover:border-zinc-500 cursor-pointer">
                            <span>{downloadCookiesFile?.name ?? 'Upload cookies.txt (optional)'}</span>
                            <input
                              type="file"
                              accept=".txt"
                              onChange={e => setDownloadCookiesFile(e.target.files?.[0] ?? null)}
                              className="hidden"
                            />
                          </label>
                          <input
                            value={downloadSubtitleLang}
                            onChange={e => setDownloadSubtitleLang(e.target.value)}
                            list="ytdlp-sub-langs"
                            className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none"
                            placeholder="Subtitle language (e.g. ai-zh)"
                          />
                          {downloadAnalyzeListSubs.length > 0 && (
                            <datalist id="ytdlp-sub-langs">
                              {downloadAnalyzeListSubs.map((entry: any) => (
                                <option key={entry.lang} value={entry.lang} />
                              ))}
                            </datalist>
                          )}
                          <label className="flex items-center gap-2 text-xs text-zinc-300">
                            <input
                              type="checkbox"
                              checked={downloadNoPlaylist}
                              onChange={e => setDownloadNoPlaylist(e.target.checked)}
                              className="accent-lime-400"
                            />
                            No playlist
                          </label>
                          <button
                            onClick={analyzeYtDlp}
                            disabled={downloadAnalyzeLoading || !downloadUrl.trim()}
                            className="px-3 py-2 text-xs font-semibold border border-zinc-800 rounded-lg text-zinc-200 hover:border-lime-500/50 hover:text-lime-300 disabled:opacity-60 disabled:cursor-not-allowed"
                          >
                            {downloadAnalyzeLoading ? 'Analyzing...' : 'Analyze URL'}
                          </button>
                          {downloadAnalyzeError && (
                            <div className="text-[11px] text-red-400">{downloadAnalyzeError}</div>
                          )}
                          {downloadAnalyzeResult && (
                            <div className="mt-1 border border-zinc-800 rounded-lg p-3 bg-zinc-900/70">
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
                              <div className="grid gap-2 mt-3 text-[11px] text-zinc-400">
                                <div>Video formats: {downloadAnalyzeVideoFormats.length}</div>
                                <div>Audio formats: {downloadAnalyzeAudioFormats.length}</div>
                                <div>Subtitle languages: {downloadAnalyzeSubtitleCount}</div>
                              </div>
                              {bestSingleFormat && (
                                <div className="mt-3 text-[11px] text-zinc-300">
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
                                <div className="mt-3 text-[11px] text-zinc-300">
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
                      ) : (
                        <>
                          <div className="flex flex-col gap-2">
                            <select
                              value={runPipelineInputId ?? ''}
                              onChange={e => setRunPipelineInputId(e.target.value || null)}
                              className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none"
                            >
                              {runPipelineProject?.files
                                .filter(file => file.type === 'video' || file.type === 'audio')
                                .map(file => (
                                  <option key={file.id} value={file.id}>{file.name}</option>
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

                {runPipelineHasUvr && (
                  <div className="border border-zinc-800 rounded-xl p-4 bg-zinc-900/70">
                    <div className="text-xs text-zinc-500 uppercase tracking-widest mb-3">Block Config: VR (UVR)</div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="flex flex-col gap-2">
                        <label className="text-[11px] text-zinc-500 uppercase tracking-widest">Backend</label>
                        <input
                          list="uvr-backends"
                          value={runPipelineBackend}
                          onChange={e => setRunPipelineBackend(e.target.value)}
                          className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none"
                          placeholder="vr"
                        />
                        <datalist id="uvr-backends">
                          <option value="vr" />
                          <option value="mdx" />
                          <option value="demucs" />
                        </datalist>
                      </div>
                      <div className="flex flex-col gap-2">
                        <label className="text-[11px] text-zinc-500 uppercase tracking-widest">Model</label>
                        {vrModels.length ? (
                          <select
                            value={vrModel}
                            onChange={e => setVrModel(e.target.value)}
                            className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none"
                          >
                            {vrModels.map(model => (
                              <option key={model} value={model}>{model}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            value={vrModel}
                            onChange={e => setVrModel(e.target.value)}
                            className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none"
                            placeholder="MGM_MAIN_v4.pth"
                          />
                        )}
                      </div>
                    </div>
                  </div>
                )}

                <button
                  onClick={runPipelineJob}
                  disabled={runPipelineSubmitting}
                  className="w-full px-4 py-2 bg-lime-500 text-zinc-950 rounded-lg text-xs font-semibold hover:bg-lime-400 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {runPipelineSubmitting ? 'Queuing...' : 'Run'}
                </button>
              </div>
            </div>
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
                  <button
                    onClick={() => setJobLogOpen(false)}
                    className="px-3 py-2 text-xs font-semibold border border-zinc-800 rounded-lg text-zinc-400 hover:text-zinc-100 hover:border-zinc-700"
                  >
                    Close
                  </button>
                </div>
                <div className="bg-zinc-950/60 border border-zinc-800 rounded-xl p-4 text-xs text-zinc-200 whitespace-pre-wrap overflow-y-auto">
                  {jobLogTarget.log || jobLogTarget.error || 'No log output yet.'}
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
