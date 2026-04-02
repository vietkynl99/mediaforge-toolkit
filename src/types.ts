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
  FileVideo,
  FileAudio,
  Type,
  Languages,
  Scissors
} from 'lucide-react';

export type JobStatus = 'queued' | 'processing' | 'awaiting_input' | 'completed' | 'failed';

export interface ProcessingNode {
  id: string;
  type: 'uvr' | 'stt' | 'translate' | 'edit' | 'burn';
  name: string;
  status: 'pending' | 'active' | 'done' | 'error';
  progress: number;
}

export interface MediaJob {
  id: string;
  name: string;
  fileName: string;
  fileSize: string;
  status: JobStatus;
  progress: number;
  nodes: ProcessingNode[];
  createdAt: string;
  eta?: string;
  cpuUsage?: number;
  gpuUsage?: number;
}

export const MOCK_JOBS: MediaJob[] = [
  {
    id: 'job-101',
    name: 'Interview Subtitle Burn',
    fileName: 'interview_4k_final.mp4',
    fileSize: '1.2 GB',
    status: 'processing',
    progress: 45,
    createdAt: '2024-03-20 14:30',
    eta: '12m 30s',
    cpuUsage: 65,
    gpuUsage: 82,
    nodes: [
      { id: 'n1', type: 'uvr', name: 'Vocal Removal', status: 'done', progress: 100 },
      { id: 'n2', type: 'stt', name: 'Speech-to-Text', status: 'active', progress: 45 },
      { id: 'n3', type: 'translate', name: 'Translation', status: 'pending', progress: 0 },
      { id: 'n4', type: 'burn', name: 'Subtitle Burn', status: 'pending', progress: 0 }
    ]
  },
  {
    id: 'job-102',
    name: 'Podcast Stem Separation',
    fileName: 'podcast_ep42.wav',
    fileSize: '450 MB',
    status: 'completed',
    progress: 100,
    createdAt: '2024-03-20 12:15',
    nodes: [
      { id: 'n1', type: 'uvr', name: 'Vocal Removal', status: 'done', progress: 100 }
    ]
  },
  {
    id: 'job-103',
    name: 'Anime Ep 05 Translation',
    fileName: 'anime_raw_05.mkv',
    fileSize: '850 MB',
    status: 'awaiting_input',
    progress: 70,
    createdAt: '2024-03-20 11:00',
    nodes: [
      { id: 'n1', type: 'stt', name: 'Speech-to-Text', status: 'done', progress: 100 },
      { id: 'n2', type: 'translate', name: 'Review Translation', status: 'active', progress: 100 }
    ]
  }
];

export const NODE_ICONS = {
  uvr: FileAudio,
  stt: Type,
  translate: Languages,
  edit: Scissors,
  burn: FileVideo
};
