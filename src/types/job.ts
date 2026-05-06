export type JobStatus = 'queued' | 'processing' | 'stopping' | 'awaiting_input' | 'completed' | 'failed' | 'cancelled';

export interface ProcessingTask {
  id: string;
  type: 'download' | 'download_subs' | 'download_video' | 'download_audio' | 'download_merge' | 'uvr' | 'tts' | 'render';
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
  logFile?: string | null;
  taskCount?: number;
  error?: string;
  params?: {
    pipelineId?: number | string;
    pipelineName?: string;
    projectName?: string;
    inputPaths?: string[];
    inputRelativePath?: string;
    download?: {
      url?: string;
      mode?: 'all' | 'subs' | 'media';
      noPlaylist?: boolean;
      subLangs?: string;
    };
    render?: {
      inputPaths?: string[];
      videoPath?: string;
      audioPath?: string;
      subtitlePath?: string;
    };
    uvr?: {
      backend?: string;
      model?: string;
      outputFormat?: string;
    };
    tts?: {
      voice?: string;
      rate?: number;
      pitch?: number;
      volume?: number;
      overlapSeconds?: number;
      overlapMode?: 'overlap' | 'truncate';
      removeLineBreaks?: boolean;
    };
    translate?: {
      subtitleFile?: string;
      preset?: {
        reference?: {
          title_or_summary?: string;
        };
        genres?: string[];
        character_names?: string[];
        humor_level?: number;
      };
      batchSize?: number;
      targetIds?: string[];
    };
    optimize?: {
      subtitleFile?: string;
      preset?: {
        reference?: {
          title_or_summary?: string;
        };
        genres?: string[];
        character_names?: string[];
        humor_level?: number;
      };
      batchSize?: number;
      targetIds?: string[];
    };
  };
}
