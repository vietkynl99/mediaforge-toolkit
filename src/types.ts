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
  Link2,
  Cpu,
  Activity,
  HardDrive,
  FileVideo,
  FileAudio,
  Type,
  Languages,
  Scissors
} from 'lucide-react';
import type { JobStatus, ProcessingTask, MediaJob } from './types/job';
export type { JobStatus, ProcessingTask, MediaJob };

export const MOCK_JOBS: MediaJob[] = [];

export const TASK_ICONS = {
  download: Download,
  download_subs: Type,
  download_video: FileVideo,
  download_audio: FileAudio,
  download_merge: Link2,
  uvr: FileAudio,
  tts: FileAudio,
  stt: Type,
  translate: Languages,
  edit: Scissors,
  burn: FileVideo,
  render: FileVideo
};

export type { AuthUser } from './types/auth';
export type { PipelineSummary, TaskTemplate } from './types/pipeline';
export type { RenderConfigV2, RenderSubtitleAssState, RenderTemplate, SubtitleStylePreset, BlurRegionEffect } from './types/render';
export { BASE_SUBTITLE_STYLE, DEFAULT_RENDER_SUBTITLE_ASS, SUBTITLE_STYLE_PRESETS, VIET_SUBTITLE_FONTS } from './types/render';
export type { VaultFile, VaultFileDTO, VaultFileType, VaultFolder, VaultFolderDTO, VaultStatus } from './types/vault';
