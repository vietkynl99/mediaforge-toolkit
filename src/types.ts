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

export type JobStatus = 'queued' | 'processing' | 'awaiting_input' | 'completed' | 'failed' | 'cancelled';

export interface ProcessingTask {
  id: string;
  type: 'download' | 'download_subs' | 'download_video' | 'download_audio' | 'download_merge' | 'uvr' | 'tts' | 'stt' | 'translate' | 'edit' | 'burn';
  name: string;
  status: 'pending' | 'active' | 'done' | 'error';
  progress: number;
}

export interface MediaJob {
  id: string;
  name: string;
  projectName?: string;
  fileName: string;
  fileSize: string;
  status: JobStatus;
  progress: number;
  tasks: ProcessingTask[];
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  eta?: string;
  cpuUsage?: number;
  gpuUsage?: number;
  log?: string;
  error?: string;
}

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
  burn: FileVideo
};
