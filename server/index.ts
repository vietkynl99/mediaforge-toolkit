import 'dotenv/config';
import express from 'express';
import fs from 'fs/promises';
import { createReadStream } from 'fs';
import { spawn } from 'child_process';
import crypto from 'crypto';
import os from 'os';
import path from 'path';
import initSqlJs from 'sql.js';
import { MEDIA_VAULT_ROOT, KNOWN_SUBDIRS, OUTPUT_DIR_NAMES, THUMB_CACHE_DIR, UVR_CLI_PATH, UVR_OUTPUT_DIRNAME } from './constants.js';
import { ttsRouter } from './tts.js';
import { parseAssRenderStyle, writeStyledAssFile } from './subtitleAss.js';

type VaultFileDTO = {
  name: string;
  relativePath: string;
  sizeBytes: number;
  modifiedAt: string;
  type: 'video' | 'audio' | 'subtitle' | 'image' | 'output' | 'other';
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

const VIDEO_EXT = new Set(['.mp4', '.mkv', '.mov', '.avi', '.webm', '.m4v']);
const AUDIO_EXT = new Set(['.wav', '.mp3', '.aac', '.flac', '.ogg', '.m4a']);
const SUB_EXT = new Set(['.srt', '.vtt', '.ass', '.ssa', '.sub']);
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.tif', '.tiff']);
const PREVIEW_MAX_BYTES = 20 * 1024 * 1024;
const PREVIEW_MAX_SECONDS = 60;
const EDGE_TTS_CMD = process.env.EDGE_TTS_CMD?.trim() || 'edge-tts';
const DEFAULT_TTS_VOICE = 'vi-VN-HoaiMyNeural';
const DEFAULT_TTS_OUTPUT_EXT = 'mp3';
const TTS_PITCH_BASE_HZ = 200;
const FONT_LIST_CACHE_MS = 5 * 60 * 1000;

const app = express();
const PORT = Number(process.env.VAULT_PORT ?? 3001);
app.use(express.json({ limit: '2mb' }));
app.use('/api/tts', ttsRouter);

let cachedFonts: string[] | null = null;
let cachedFontsAt = 0;

const listSystemFonts = async (): Promise<string[]> =>
  new Promise((resolve) => {
    const proc = spawn('fc-list', ['-f', '%{family}\n'], {
      stdio: ['ignore', 'pipe', 'ignore'],
      env: {
        ...process.env,
        LANG: process.env.LANG || 'C.UTF-8',
        LC_ALL: process.env.LC_ALL || 'C.UTF-8'
      }
    });
    let output = '';
    proc.stdout.on('data', (chunk) => {
      output += chunk.toString();
    });
    proc.on('error', () => resolve([]));
    proc.on('close', (code) => {
      if (code !== 0) return resolve([]);
      const names = output
        .split(/\r?\n/)
        .flatMap(line => line.split(','))
        .map(name => name.trim().normalize('NFC'))
        .filter(Boolean)
        // Drop obviously corrupted names (escaped sequences / replacement chars / controls)
        .filter(name => !/\\u[0-9a-fA-F]{4}/.test(name))
        .filter(name => !name.includes('�'))
        .filter(name => !/[\p{C}]/u.test(name));
      resolve(Array.from(new Set(names)));
    });
  });

const dbPath = path.join(process.cwd(), 'server', 'data', 'pipelines.sqlite');
const dbDir = path.dirname(dbPath);
await fs.mkdir(dbDir, { recursive: true });

const SQL = await initSqlJs({
  locateFile: (file) => path.join(process.cwd(), 'node_modules', 'sql.js', 'dist', file)
});

let db: any;
try {
  const fileBuffer = await fs.readFile(dbPath);
  db = new SQL.Database(new Uint8Array(fileBuffer));
} catch {
  db = new SQL.Database();
}

db.run(
  `CREATE TABLE IF NOT EXISTS pipelines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    graph_json TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`
);

db.run(
  `CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    project_name TEXT,
    file_name TEXT NOT NULL,
    file_size TEXT NOT NULL,
    status TEXT NOT NULL,
    progress INTEGER NOT NULL,
    tasks_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    started_at TEXT,
    finished_at TEXT,
    duration_ms INTEGER,
    error TEXT,
    log TEXT,
    params_json TEXT
  )`
);

try {
  db.run('ALTER TABLE jobs ADD COLUMN params_json TEXT');
} catch {
  // ignore if already exists
}

const paramPresetTableInfo = db.exec("PRAGMA table_info('param_presets')");
const paramPresetColumns = (paramPresetTableInfo[0]?.values ?? []).map((row: any[]) => String(row[1]));
const hasParamPresetId = paramPresetColumns.includes('id');

if (!hasParamPresetId) {
  db.run(
    `CREATE TABLE IF NOT EXISTS param_presets_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_type TEXT NOT NULL,
      params_json TEXT NOT NULL,
      label TEXT,
      updated_at TEXT NOT NULL
    )`
  );
  try {
    db.run(
      `INSERT INTO param_presets_new (task_type, params_json, label, updated_at)
       SELECT task_type, params_json, label, updated_at FROM param_presets`
    );
  } catch {
    // ignore if old table does not exist yet
  }
  try {
    db.run(
      `INSERT INTO param_presets_new (task_type, params_json, label, updated_at)
       SELECT task_type, params_json, label, updated_at FROM pipeline_defaults`
    );
  } catch {
    // ignore if old table does not exist
  }
  db.run('DROP TABLE IF EXISTS param_presets');
  db.run('DROP TABLE IF EXISTS pipeline_defaults');
  db.run('ALTER TABLE param_presets_new RENAME TO param_presets');
} else {
  db.run(
    `CREATE TABLE IF NOT EXISTS param_presets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_type TEXT NOT NULL,
      params_json TEXT NOT NULL,
      label TEXT,
      updated_at TEXT NOT NULL
    )`
  );
}

try {
  db.run('CREATE INDEX IF NOT EXISTS idx_param_presets_task_type ON param_presets (task_type)');
} catch {
  // ignore
}

db.run('DROP TABLE IF EXISTS file_uvr');

const persistDb = async () => {
  const data = db.export();
  await fs.writeFile(dbPath, Buffer.from(data));
};

type JobStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
type JobTaskStatus = 'pending' | 'active' | 'done' | 'error';
type JobTask = { id: string; type: string; name: string; status: JobTaskStatus; progress: number };
type JobRecord = {
  id: string;
  name: string;
  projectName?: string;
  fileName: string;
  fileSize: string;
  status: JobStatus;
  progress: number;
  tasks: JobTask[];
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  error?: string;
  log?: string;
  params?: Record<string, any>;
};

const jobs: JobRecord[] = [];
const jobQueue: string[] = [];
const downloadQueue: string[] = [];
let activeJobId: string | null = null;
let activeDownloadCount = 0;
const MAX_ACTIVE_DOWNLOADS = 4;
const CANCELLED_ERROR_MESSAGE = 'Job cancelled';
const MAX_JOB_LOG_CHARS = 20000;
const jobPersistTimers = new Map<string, NodeJS.Timeout>();
let persistDbTimer: NodeJS.Timeout | null = null;

const formatLocalTimestamp = () =>
  new Intl.DateTimeFormat('vi-VN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(new Date());

const appendJobLog = (job: JobRecord, message: string) => {
  const timestamp = formatLocalTimestamp();
  const prefixed = message
    .split(/\r?\n/)
    .map(line => (line ? `[${timestamp}] ${line}` : line))
    .join('\n');
  job.log = `${job.log ?? ''}${prefixed}`;
  if (job.log.length > MAX_JOB_LOG_CHARS) {
    job.log = job.log.slice(-MAX_JOB_LOG_CHARS);
  }
  scheduleJobPersist(job);
};

const schedulePersistDb = () => {
  if (persistDbTimer) return;
  persistDbTimer = setTimeout(() => {
    persistDbTimer = null;
    persistDb().catch(() => null);
  }, 500);
};

const upsertJobRecord = (job: JobRecord) => {
  db.run(
    `INSERT OR REPLACE INTO jobs (
      id, name, project_name, file_name, file_size, status, progress,
      tasks_json, created_at, started_at, finished_at, duration_ms, error, log, params_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      job.id,
      job.name,
      job.projectName ?? null,
      job.fileName,
      job.fileSize,
      job.status,
      job.progress,
      JSON.stringify(job.tasks ?? []),
      job.createdAt,
      job.startedAt ?? null,
      job.finishedAt ?? null,
      job.durationMs ?? null,
      job.error ?? null,
      job.log ?? null,
      job.params ? JSON.stringify(job.params) : null
    ]
  );
  schedulePersistDb();
};

const scheduleJobPersist = (job: JobRecord) => {
  const existing = jobPersistTimers.get(job.id);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(() => {
    jobPersistTimers.delete(job.id);
    upsertJobRecord(job);
  }, 500);
  jobPersistTimers.set(job.id, timer);
};

const upsertUvrMetadata = (payload: {
  relativePath: string;
  processedAt: string;
  backend?: string;
  model?: string;
  outputFormat?: string;
  outputs?: string[];
  jobId?: string;
}) => {
  const relative = payload.relativePath.replace(/\\/g, '/');
  const projectName = relative.split('/')[0];
  if (!projectName) return;
  const projectRoot = path.join(MEDIA_VAULT_ROOT, projectName);
  const metaDir = path.join(projectRoot, '.mediaforge');
  const metaFile = path.join(metaDir, 'uvr.json');
  const readMeta = async () => {
    try {
      const raw = await fs.readFile(metaFile, 'utf-8');
      const parsed = JSON.parse(raw);
      return typeof parsed === 'object' && parsed ? parsed : {};
    } catch {
      return {};
    }
  };
  const writeMeta = async (data: Record<string, VaultFileDTO['uvr']>) => {
    await fs.mkdir(metaDir, { recursive: true });
    await fs.writeFile(metaFile, JSON.stringify(data, null, 2), 'utf-8');
  };
  readMeta()
    .then(data => {
      data[relative] = {
        processedAt: payload.processedAt,
        backend: payload.backend ?? undefined,
        model: payload.model ?? undefined,
        outputFormat: payload.outputFormat ?? undefined,
        outputs: payload.outputs,
        role: 'source'
      };
      return writeMeta(data);
    })
    .catch(() => null);
};

const upsertTtsMetadata = (payload: {
  relativePath: string;
  processedAt: string;
  voice?: string;
  rate?: number;
  pitch?: number;
  volume?: number;
  overlapSeconds?: number;
  overlapMode?: 'overlap' | 'truncate';
  removeLineBreaks?: boolean;
  outputs?: string[];
}) => {
  const relative = payload.relativePath.replace(/\\/g, '/');
  const projectName = relative.split('/')[0];
  if (!projectName) return;
  const projectRoot = path.join(MEDIA_VAULT_ROOT, projectName);
  const metaDir = path.join(projectRoot, '.mediaforge');
  const metaFile = path.join(metaDir, 'tts.json');
  const readMeta = async () => {
    try {
      const raw = await fs.readFile(metaFile, 'utf-8');
      const parsed = JSON.parse(raw);
      return typeof parsed === 'object' && parsed ? parsed : {};
    } catch {
      return {};
    }
  };
  const writeMeta = async (data: Record<string, VaultFileDTO['tts']>) => {
    await fs.mkdir(metaDir, { recursive: true });
    await fs.writeFile(metaFile, JSON.stringify(data, null, 2), 'utf-8');
  };
  readMeta()
    .then(data => {
      data[relative] = {
        processedAt: payload.processedAt,
        voice: payload.voice ?? undefined,
        rate: payload.rate,
        pitch: payload.pitch,
        volume: payload.volume,
        overlapSeconds: payload.overlapSeconds,
        overlapMode: payload.overlapMode,
        removeLineBreaks: payload.removeLineBreaks,
        outputs: payload.outputs,
        role: 'source'
      };
      return writeMeta(data);
    })
    .catch(() => null);
};

const loadJobsFromDb = () => {
  try {
    const result = db.exec(
      `SELECT id, name, project_name, file_name, file_size, status, progress,
        tasks_json, created_at, started_at, finished_at, duration_ms, error, log, params_json
       FROM jobs
       ORDER BY created_at DESC`
    );
    const rows = result[0]?.values ?? [];
    const nowIso = new Date().toISOString();
    const loaded: JobRecord[] = rows.map((row: any[]) => {
      const [
        id,
        name,
        projectName,
        fileName,
        fileSize,
        status,
        progress,
        tasksJson,
        createdAt,
        startedAt,
        finishedAt,
        durationMs,
        error,
        log,
        paramsJson
      ] = row;
      let tasks: JobTask[] = [];
      try {
        tasks = JSON.parse(tasksJson ?? '[]');
      } catch {
        tasks = [];
      }
      const job: JobRecord = {
        id,
        name,
        projectName: projectName ?? undefined,
        fileName,
        fileSize,
        status,
        progress,
        tasks,
        createdAt,
        startedAt: startedAt ?? undefined,
        finishedAt: finishedAt ?? undefined,
        durationMs: typeof durationMs === 'number' ? durationMs : durationMs ? Number(durationMs) : undefined,
        error: error ?? undefined,
        log: log ?? undefined
      };
      if (paramsJson) {
        try {
          job.params = JSON.parse(paramsJson);
        } catch {
          job.params = undefined;
        }
      }
      if (job.status === 'queued' || job.status === 'processing') {
        job.status = 'failed';
        job.error = 'Job interrupted by server restart';
        job.finishedAt = nowIso;
        const base = job.startedAt ?? job.createdAt;
        job.durationMs = new Date(job.finishedAt).getTime() - new Date(base).getTime();
      }
      return job;
    });
    jobs.splice(0, jobs.length, ...loaded);
    loaded.forEach(job => {
      if (job.status === 'failed' && job.error === 'Job interrupted by server restart') {
        upsertJobRecord(job);
      }
    });
  } catch {
    return;
  }
};

loadJobsFromDb();

const formatBytes = (bytes: number) => {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, index);
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
};

const taskNameMap: Record<string, string> = {
  download: 'Download (yt-dlp)',
  download_subs: 'Download Subtitles',
  download_video: 'Download Video',
  download_audio: 'Download Audio',
  download_merge: 'Merge Video + Audio',
  uvr: 'Vocal Removal',
  tts: 'Text-to-Speech',
  stt: 'Speech-to-Text',
  translate: 'Translation',
  edit: 'Subtitle Edit',
  burn: 'Subtitle Burn'
};

const sanitizeProjectName = (value: string) =>
  value.replace(/[\\/]/g, ' ').replace(/\.\./g, ' ').trim();

const sanitizeFileName = (value: string) => {
  const base = path.basename(value || 'cookies.txt');
  const cleaned = base.replace(/[^\w.\-() ]+/g, '_').trim();
  return cleaned || 'cookies.txt';
};

const resolveCookiesPath = (value: string) => {
  if (!value) return null;
  const normalized = path.normalize(value);
  if (path.isAbsolute(normalized)) {
    return normalized;
  }
  const rootPath = path.resolve(MEDIA_VAULT_ROOT);
  const fullPath = path.resolve(MEDIA_VAULT_ROOT, normalized);
  if (!fullPath.startsWith(`${rootPath}${path.sep}`) && fullPath !== rootPath) {
    return null;
  }
  return fullPath;
};

const buildTasksFromGraph = (graph: any): JobTask[] => {
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const tasks: JobTask[] = [];
  nodes.forEach((node: any, index: number) => {
    const type = node.type ?? 'task';
    if (type === 'download') {
      const base = index + 1;
      tasks.push(
        { id: `download_subs-${base}`, type: 'download_subs', name: taskNameMap.download_subs, status: 'pending', progress: 0 },
        { id: `download_video-${base}`, type: 'download_video', name: taskNameMap.download_video, status: 'pending', progress: 0 },
        { id: `download_audio-${base}`, type: 'download_audio', name: taskNameMap.download_audio, status: 'pending', progress: 0 },
        { id: `download_merge-${base}`, type: 'download_merge', name: taskNameMap.download_merge, status: 'pending', progress: 0 }
      );
      return;
    }
    tasks.push({
      id: `${type}-${index + 1}`,
      type,
      name: taskNameMap[type] ?? (node.label ?? 'Task'),
      status: 'pending',
      progress: 0
    });
  });
  return tasks;
};

const getJobById = (id: string) => jobs.find(job => job.id === id);

const runJob = async (job: JobRecord, mode: 'normal' | 'download') => {
  job.status = 'processing';
  job.progress = 0;
  job.startedAt = new Date().toISOString();
  scheduleJobPersist(job);

  try {
    const downloadSubsTask = job.tasks.find(task => task.type === 'download_subs');
    const downloadVideoTask = job.tasks.find(task => task.type === 'download_video');
    const downloadAudioTask = job.tasks.find(task => task.type === 'download_audio');
    const downloadMergeTask = job.tasks.find(task => task.type === 'download_merge');
    if (downloadSubsTask || downloadVideoTask || downloadAudioTask || downloadMergeTask) {
      const rawDownloadMode = (job as any).__downloadMode as string | undefined;
      const downloadMode = rawDownloadMode === 'subs' || rawDownloadMode === 'media' || rawDownloadMode === 'all'
        ? rawDownloadMode
        : 'all';
      if (downloadSubsTask) {
        downloadSubsTask.status = 'active';
        downloadSubsTask.progress = 0;
      }
      if (downloadVideoTask) {
        downloadVideoTask.status = 'pending';
        downloadVideoTask.progress = 0;
      }
      if (downloadAudioTask) {
        downloadAudioTask.status = 'pending';
        downloadAudioTask.progress = 0;
      }
      if (downloadMergeTask) {
        downloadMergeTask.status = 'pending';
        downloadMergeTask.progress = 0;
      }
      if (downloadMode === 'subs') {
        if (downloadVideoTask) {
          downloadVideoTask.status = 'done';
          downloadVideoTask.progress = 100;
        }
        if (downloadAudioTask) {
          downloadAudioTask.status = 'done';
          downloadAudioTask.progress = 100;
        }
        if (downloadMergeTask) {
          downloadMergeTask.status = 'done';
          downloadMergeTask.progress = 100;
        }
      }
      if (downloadMode === 'media') {
        if (downloadSubsTask) {
          downloadSubsTask.status = 'done';
          downloadSubsTask.progress = 100;
        }
      }
      const downloadTasks = [downloadSubsTask, downloadVideoTask, downloadAudioTask, downloadMergeTask].filter(Boolean) as JobTask[];
      const updateJobProgress = () => {
        if (downloadTasks.length === 0) return;
        const weight = 100 / downloadTasks.length;
        const total = downloadTasks.reduce((sum, task) => {
          if (task.status === 'error') {
            return sum + weight;
          }
          const value = Math.max(0, Math.min(100, task.progress ?? 0));
          return sum + (value / 100) * weight;
        }, 0);
        // Each sub-task contributes up to weight% (4 tasks => 25% each).
        const allCompleted = downloadTasks.every(task => task.status === 'done' || task.status === 'error');
        const capped = allCompleted ? 100 : 99;
        job.progress = Math.max(0, Math.min(capped, Math.round(total)));
      };
      let lastProgress = 0;
      let phase: 'subs' | 'media' = 'subs';
      let mediaPhase: 'video' | 'audio' | 'merge' = 'video';
      let subsFailedDetected = false;
      const markDone = (task?: JobTask | null) => {
        if (!task || task.status === 'error') return;
        task.status = 'done';
        task.progress = 100;
      };
      const markActive = (task?: JobTask | null) => {
        if (!task || task.status === 'error') return;
        task.status = 'active';
      };
      const markError = (task?: JobTask | null) => {
        if (!task) return;
        task.status = 'error';
        task.progress = 0;
      };
      const setSubsProgress = (value: number) => {
        const next = Math.max(lastProgress, Math.min(99, Math.round(value)));
        if (next === lastProgress) return;
        lastProgress = next;
        if (downloadSubsTask) downloadSubsTask.progress = next;
        updateJobProgress();
        scheduleJobPersist(job);
      };
      const setVideoProgress = (value: number) => {
        const next = Math.max(0, Math.min(99, Math.round(value)));
        if (downloadVideoTask) downloadVideoTask.progress = next;
        updateJobProgress();
        scheduleJobPersist(job);
      };
      const setAudioProgress = (value: number) => {
        const next = Math.max(0, Math.min(99, Math.round(value)));
        if (downloadAudioTask) downloadAudioTask.progress = next;
        updateJobProgress();
        scheduleJobPersist(job);
      };
      const setMergeProgress = (value: number) => {
        const next = Math.max(0, Math.min(99, Math.round(value)));
        if (downloadMergeTask) downloadMergeTask.progress = next;
        updateJobProgress();
        scheduleJobPersist(job);
      };
      const abortController = new AbortController();
      (job as any).__abortController = abortController;
      const sourceDir = (job as any).__downloadSourceDir as string | undefined;
      const url = (job as any).__downloadUrl as string | undefined;
      const cookiesFile = (job as any).__downloadCookiesFile as string | null | undefined;
      const noPlaylist = (job as any).__downloadNoPlaylist as boolean | undefined;
      const subLangs = (job as any).__downloadSubLangs as string | undefined;
      if (!sourceDir || !url) {
        throw new Error('Missing download parameters');
      }
      const before = new Set<string>((await fs.readdir(sourceDir, { withFileTypes: true }))
        .filter(entry => entry.isFile())
        .map(entry => entry.name));
      const downloadResult = await runYtDlpTask(
        url,
        sourceDir,
        cookiesFile ?? undefined,
        noPlaylist ?? true,
        subLangs,
        downloadMode,
        (chunk) => {
          appendJobLog(job, chunk);
          const lines = chunk.split(/\r?\n/);
          for (const line of lines) {
            if (!line) continue;
            if (line.includes('COMMAND (subs-only)')) {
              phase = 'subs';
              setSubsProgress(10);
              continue;
            }
            if (line.includes('COMMAND (media)')) {
              phase = 'media';
              if (downloadSubsTask) {
                if (subsFailedDetected) {
                  markError(downloadSubsTask);
                } else {
                  markDone(downloadSubsTask);
                }
              }
              mediaPhase = 'video';
              markActive(downloadVideoTask);
              if (downloadAudioTask && downloadAudioTask.status !== 'error') {
                downloadAudioTask.status = 'pending';
              }
              if (downloadMergeTask && downloadMergeTask.status !== 'error') {
                downloadMergeTask.status = 'pending';
              }
              setVideoProgress(5);
              continue;
            }
            if (/ERROR:/i.test(line)) {
              if (phase === 'subs') {
                markError(downloadSubsTask);
              } else if (phase === 'media') {
                if (mediaPhase === 'video') markError(downloadVideoTask);
                if (mediaPhase === 'audio') markError(downloadAudioTask);
                if (mediaPhase === 'merge') markError(downloadMergeTask);
              }
              updateJobProgress();
              scheduleJobPersist(job);
            }
            if (phase === 'subs' && line.includes('There are no subtitles for the requested languages')) {
              subsFailedDetected = true;
              if (downloadSubsTask) {
                markError(downloadSubsTask);
                updateJobProgress();
                scheduleJobPersist(job);
              }
            }
            if (phase === 'media') {
              if (/Downloading video/i.test(line)) {
                mediaPhase = 'video';
                markActive(downloadVideoTask);
              }
              if (/Downloading audio/i.test(line)) {
                if (downloadVideoTask?.status !== 'error') markDone(downloadVideoTask);
                mediaPhase = 'audio';
                markActive(downloadAudioTask);
              }
              if (/Destination:/i.test(line)) {
                const matchExt = line.match(/\.(\w{2,4})\s*$/i);
                if (matchExt) {
                  const ext = `.${matchExt[1].toLowerCase()}`;
                  if (VIDEO_EXT.has(ext)) {
                    mediaPhase = 'video';
                    markActive(downloadVideoTask);
                  }
                  if (AUDIO_EXT.has(ext)) {
                    if (downloadVideoTask?.status !== 'error') markDone(downloadVideoTask);
                    mediaPhase = 'audio';
                    markActive(downloadAudioTask);
                  }
                }
              }
              if (/Merging formats into/i.test(line) || /Merger:/i.test(line)) {
                if (downloadAudioTask?.status !== 'error') markDone(downloadAudioTask);
                mediaPhase = 'merge';
                markActive(downloadMergeTask);
                setMergeProgress(10);
              }
            }
            const match = line.match(/\b(\d{1,3}(?:\.\d+)?)%/);
            if (match && phase === 'media') {
              const percent = Math.min(100, Math.max(0, Number(match[1])));
              if (Number.isFinite(percent)) {
                if (mediaPhase === 'video') {
                  setVideoProgress(percent);
                } else if (mediaPhase === 'audio') {
                  setAudioProgress(percent);
                }
              }
            }
          }
        },
        { signal: abortController.signal, onStart: proc => ((job as any).__activeProcess = proc) }
      );
      if (!job.log || job.log.trim().length === 0) {
        job.log = downloadResult.log || `yt-dlp completed at ${new Date().toISOString()}`;
      }
      const newPaths = [
        ...downloadResult.subsFiles.map(name => path.join(sourceDir, name)),
        ...downloadResult.mediaFiles.map(name => path.join(sourceDir, name))
      ];
      const outputs = newPaths.map(pathname => path.relative(MEDIA_VAULT_ROOT, pathname));
      const projectRelativePath = (job as any).__projectRelativePath as string | undefined;
      if (outputs.length) {
        appendJobLog(job, `Outputs:\n${outputs.map(item => `- ${item}`).join('\n')}\n`);
      }
      if (projectRelativePath) {
        appendJobLog(job, `Project:\n- ${projectRelativePath}\n`);
      }
      const subsCandidates = downloadResult.subsFiles.map(name => path.join(sourceDir, name)).filter(pathname => isSubtitleFile(pathname));
      const mediaCandidates = downloadResult.mediaFiles.map(name => path.join(sourceDir, name)).filter(pathname => isVideoFile(pathname) || isAudioFile(pathname));
      const hasVideoFile = mediaCandidates.some(pathname => isVideoFile(pathname));
      const hasAudioFile = mediaCandidates.some(pathname => isAudioFile(pathname));
      const hasMuxedVideo = hasVideoFile;
      const hasVideo = hasVideoFile;
      const hasAudio = hasAudioFile || hasMuxedVideo;
      const wantsSubs = downloadMode !== 'media';
      const wantsMedia = downloadMode !== 'subs';
      if (mediaCandidates.length) {
        let selectedPath = mediaCandidates[0];
        let selectedSize = 0;
        for (const candidate of mediaCandidates) {
          try {
            const stats = await fs.stat(candidate);
            if (stats.size >= selectedSize) {
              selectedPath = candidate;
              selectedSize = stats.size;
            }
          } catch {
            continue;
          }
        }
      if (selectedPath) {
        const stats = await fs.stat(selectedPath);
        job.fileName = path.basename(selectedPath);
        job.fileSize = formatBytes(stats.size);
        (job as any).__downloadSelectedPath = selectedPath;
        const projectRoot = (job as any).__projectRoot as string | undefined;
        const projectRelativePath = (job as any).__projectRelativePath as string | undefined;
        if (projectRoot) {
          (job as any).__inputPath = projectRoot;
          (job as any).__inputRelativePath = projectRelativePath ?? path.relative(MEDIA_VAULT_ROOT, projectRoot);
        } else {
          (job as any).__inputPath = selectedPath;
          (job as any).__inputRelativePath = path.relative(MEDIA_VAULT_ROOT, selectedPath);
        }
          scheduleJobPersist(job);
        }
      }
      const projectRoot = (job as any).__projectRoot as string | undefined;
      if (projectRoot && !(job as any).__inputPath) {
        (job as any).__inputPath = projectRoot;
        (job as any).__inputRelativePath = (job as any).__projectRelativePath ?? path.relative(MEDIA_VAULT_ROOT, projectRoot);
        scheduleJobPersist(job);
      }
      if (downloadSubsTask) {
        if (!wantsSubs) {
          markDone(downloadSubsTask);
        } else if (subsCandidates.length) {
          markDone(downloadSubsTask);
        } else {
          markError(downloadSubsTask);
        }
      }
      if (downloadVideoTask) {
        if (!wantsMedia) {
          markDone(downloadVideoTask);
        } else if (hasVideo) {
          markDone(downloadVideoTask);
        } else {
          markError(downloadVideoTask);
        }
      }
      if (downloadAudioTask) {
        if (!wantsMedia) {
          markDone(downloadAudioTask);
        } else if (hasAudio) {
          markDone(downloadAudioTask);
        } else {
          markError(downloadAudioTask);
        }
      }
      if (downloadMergeTask) {
        if (!wantsMedia) {
          markDone(downloadMergeTask);
        } else if (hasVideo && hasAudio) {
          markDone(downloadMergeTask);
        } else {
          markError(downloadMergeTask);
        }
      }
      if (wantsMedia && (!hasVideo || !hasAudio)) {
        throw new Error('Download did not produce required media outputs');
      }
      job.progress = Math.round((job.tasks.filter(task => task.status === 'done').length / job.tasks.length) * 100);
      scheduleJobPersist(job);
    }
    const uvrTask = job.tasks.find(task => task.type === 'uvr');
    if (uvrTask) {
      const downloadSelectedPath = (job as any).__downloadSelectedPath as string | undefined;
      const uvrInputPath = downloadSelectedPath ?? (job as any).__inputPath;
      if (!uvrInputPath) {
        throw new Error('Missing input after download');
      }
      uvrTask.status = 'active';
      uvrTask.progress = 0;
      const updateUvrJobProgress = () => {
        const total = job.tasks.reduce((sum, task) => sum + (task.progress ?? 0), 0);
        job.progress = Math.max(0, Math.min(99, Math.round(total / job.tasks.length)));
        scheduleJobPersist(job);
      };
      updateUvrJobProgress();
      const abortController = new AbortController();
      (job as any).__abortController = abortController;
      const outputDir = (job as any).__outputDir as string;
      const before = new Set<string>((await fs.readdir(outputDir)).map(name => path.join(outputDir, name)));
      const uvrLog = await runUvrTask(
        uvrInputPath,
        outputDir,
        (job as any).__model,
        (job as any).__outputFormat,
        (job as any).__backend ?? 'vr',
        (chunk) => {
          appendJobLog(job, chunk);
          const lines = chunk.split(/\r?\n/);
          for (const line of lines) {
            const match = line.match(/^\s*(\d{1,3})%\|/);
            if (!match) continue;
            const percent = Math.min(100, Math.max(0, Number(match[1])));
            if (!Number.isFinite(percent)) continue;
            if (percent <= (uvrTask.progress ?? 0)) continue;
            uvrTask.progress = percent;
            updateUvrJobProgress();
          }
        },
        { signal: abortController.signal, onStart: proc => ((job as any).__activeProcess = proc) }
      );
      const resolvedLog = job.log && job.log.trim().length > 0 ? job.log : uvrLog;
      job.log = resolvedLog || `UVR completed at ${new Date().toISOString()}`;
      const after = (await fs.readdir(outputDir)).map(name => path.join(outputDir, name));
      const outputs = after
        .filter(pathname => !before.has(pathname))
        .map(pathname => path.relative(MEDIA_VAULT_ROOT, pathname));
      const uvrInputRelativePath = path.relative(MEDIA_VAULT_ROOT, uvrInputPath);
      if (uvrInputRelativePath) {
        upsertUvrMetadata({
          relativePath: uvrInputRelativePath,
          processedAt: new Date().toISOString(),
          backend: (job as any).__backend ?? 'vr',
          model: (job as any).__model,
          outputFormat: (job as any).__outputFormat,
          outputs,
          jobId: job.id
        });
      }
      if (job.log && job.log.length > MAX_JOB_LOG_CHARS) {
        job.log = job.log.slice(-MAX_JOB_LOG_CHARS);
      }
      uvrTask.status = 'done';
      uvrTask.progress = 100;
      const total = job.tasks.reduce((sum, task) => sum + (task.progress ?? 0), 0);
      job.progress = Math.max(0, Math.min(99, Math.round(total / job.tasks.length)));
      scheduleJobPersist(job);
    }
    const ttsTask = job.tasks.find(task => task.type === 'tts');
    if (ttsTask) {
      const inputPath = (job as any).__inputPath as string | undefined;
      if (!inputPath) {
        throw new Error('Missing input for TTS task');
      }
      ttsTask.status = 'active';
      ttsTask.progress = 0;
      const total = job.tasks.reduce((sum, task) => sum + (task.progress ?? 0), 0);
      job.progress = Math.max(0, Math.min(99, Math.round(total / job.tasks.length)));
      scheduleJobPersist(job);
      const outputDir = (job as any).__outputDir as string;
      const ttsResult = await runTtsTask(inputPath, outputDir, {
        voice: (job as any).__ttsVoice as string | undefined,
        rate: (job as any).__ttsRate as number | undefined,
        pitch: (job as any).__ttsPitch as number | undefined,
        volume: (job as any).__ttsVolume as number | undefined,
        overlapMode: (job as any).__ttsOverlapMode as 'overlap' | 'truncate' | undefined,
        removeLineBreaks: (job as any).__ttsRemoveLineBreaks as boolean | undefined,
        onLog: chunk => appendJobLog(job, chunk),
        onProgress: (completed, total) => {
          const percent = Math.min(99, Math.round((completed / Math.max(1, total)) * 100));
          if (percent <= (ttsTask.progress ?? 0)) return;
          ttsTask.progress = percent;
          const totalProgress = job.tasks.reduce((sum, task) => sum + (task.progress ?? 0), 0);
          job.progress = Math.max(0, Math.min(99, Math.round(totalProgress / job.tasks.length)));
          scheduleJobPersist(job);
        }
      });
      ttsTask.status = 'done';
      ttsTask.progress = 100;
      (job as any).__inputPath = ttsResult.outputPath;
      (job as any).__inputRelativePath = ttsResult.outputRelativePath;
      upsertTtsMetadata({
        relativePath: path.relative(MEDIA_VAULT_ROOT, inputPath),
        processedAt: new Date().toISOString(),
        voice: ttsResult.voice,
        rate: ttsResult.rate,
        pitch: ttsResult.pitch,
        volume: ttsResult.volume,
        overlapSeconds: ttsResult.overlapSeconds,
        overlapMode: ttsResult.overlapMode,
        removeLineBreaks: (job as any).__ttsRemoveLineBreaks as boolean | undefined,
        outputs: [ttsResult.outputRelativePath]
      });
      if (!job.log || job.log.trim().length === 0) {
        job.log = `TTS completed at ${new Date().toISOString()}`;
      }
      appendJobLog(job, `Total overlap: ${ttsResult.overlapSeconds.toFixed(2)}s\n`);
      appendJobLog(job, `Output:\n- ${ttsResult.outputRelativePath}\n`);
      const totalAfter = job.tasks.reduce((sum, task) => sum + (task.progress ?? 0), 0);
      job.progress = Math.max(0, Math.min(99, Math.round(totalAfter / job.tasks.length)));
      scheduleJobPersist(job);
    }
    job.status = 'completed';
    job.progress = 100;
    job.finishedAt = new Date().toISOString();
    job.durationMs = new Date(job.finishedAt).getTime() - new Date(job.startedAt ?? job.createdAt).getTime();
    scheduleJobPersist(job);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Job failed';
    if ((job as any).__cancelRequested || message === CANCELLED_ERROR_MESSAGE) {
      job.status = 'cancelled';
      job.error = CANCELLED_ERROR_MESSAGE;
      appendJobLog(job, CANCELLED_ERROR_MESSAGE);
    } else {
      job.status = 'failed';
      job.error = message;
      job.log = [job.log, job.error].filter(Boolean).join('\n');
      if (job.log && job.log.length > MAX_JOB_LOG_CHARS) {
        job.log = job.log.slice(-MAX_JOB_LOG_CHARS);
      }
    }
    job.finishedAt = new Date().toISOString();
    job.durationMs = new Date(job.finishedAt).getTime() - new Date(job.startedAt ?? job.createdAt).getTime();
    job.tasks.forEach(task => {
      if (task.status === 'active' || task.status === 'pending') task.status = 'error';
    });
    scheduleJobPersist(job);
  } finally {
    if (mode === 'normal') {
      activeJobId = null;
      setImmediate(processNextJob);
    } else {
      activeDownloadCount = Math.max(0, activeDownloadCount - 1);
      setImmediate(processNextDownload);
    }
  }
};

const processNextJob = async () => {
  if (activeJobId || jobQueue.length === 0) return;
  const nextId = jobQueue.shift();
  if (!nextId) return;
  const job = getJobById(nextId);
  if (!job) return;
  activeJobId = job.id;
  runJob(job, 'normal');
};

const processNextDownload = async () => {
  if (activeDownloadCount >= MAX_ACTIVE_DOWNLOADS || downloadQueue.length === 0) return;
  const nextId = downloadQueue.shift();
  if (!nextId) return;
  const job = getJobById(nextId);
  if (!job) return;
  activeDownloadCount += 1;
  runJob(job, 'download');
};
const durationCache = new Map<string, { mtimeMs: number; duration: number }>();

const ensureThumbCache = async () => {
  await fs.mkdir(THUMB_CACHE_DIR, { recursive: true });
};

ensureThumbCache().catch(() => null);

const isOutputFile = (filePath: string, name: string) => {
  const lowered = `${filePath}/${name}`.toLowerCase();
  if (lowered.includes('/output/') || lowered.includes('/outputs/') || lowered.includes('/export/') || lowered.includes('/exports/')) {
    return true;
  }
  return lowered.includes('output') || lowered.includes('export') || lowered.includes('render') || lowered.includes('subbed');
};

const detectType = (filePath: string, name: string) => {
  const ext = path.extname(name).toLowerCase();
  if (VIDEO_EXT.has(ext)) return 'video';
  if (AUDIO_EXT.has(ext)) return 'audio';
  if (SUB_EXT.has(ext)) return 'subtitle';
  if (IMAGE_EXT.has(ext)) return 'image';
  if (isOutputFile(filePath, name)) return 'output';
  return 'other';
};

const isKnownSubdir = (dirName: string) => KNOWN_SUBDIRS.has(dirName.toLowerCase());

const parseTimeToSeconds = (value: string) => {
  const parts = value.replace(',', '.').split(':');
  if (parts.length < 3) return 0;
  const [hh, mm, ss] = parts;
  const seconds = Number.parseFloat(ss);
  return Number(hh) * 3600 + Number(mm) * 60 + seconds;
};

const parseSubtitleDuration = (content: string) => {
  const regex = /(\d{1,2}:\d{2}:\d{2}(?:[.,]\d{1,3})?)\s*-->\s*(\d{1,2}:\d{2}:\d{2}(?:[.,]\d{1,3})?)/g;
  let match: RegExpExecArray | null = null;
  let lastEnd = '';
  while ((match = regex.exec(content))) {
    lastEnd = match[2];
  }
  return lastEnd ? parseTimeToSeconds(lastEnd) : 0;
};

const computeOverlapSecondsFromSegments = (segments: Array<{ start: number; end: number }>) => {
  if (!segments.length) return 0;
  const events: Array<{ t: number; d: number }> = [];
  segments.forEach(seg => {
    events.push({ t: seg.start, d: 1 });
    events.push({ t: seg.end, d: -1 });
  });
  events.sort((a, b) => (a.t === b.t ? a.d - b.d : a.t - b.t));
  let active = 0;
  let overlap = 0;
  let prevTime = events[0].t;
  for (const event of events) {
    const dt = event.t - prevTime;
    if (active >= 2 && dt > 0) {
      overlap += dt;
    }
    active += event.d;
    prevTime = event.t;
  }
  return Math.max(0, overlap);
};

type SubtitleCue = {
  start: number;
  end: number;
  text: string;
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

const parseAssTimestamp = (value: string) => {
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

const parseSrtVttCues = (content: string, removeLineBreaks: boolean) => {
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
    if (!line) continue;
    if (line.startsWith('WEBVTT')) continue;
    if (line.startsWith('NOTE')) continue;
    if (/^\d+$/.test(line)) continue;
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

const parseAssCues = (content: string, removeLineBreaks: boolean) => {
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

const formatTtsRate = (value?: number) => {
  if (value === undefined || value === null) return undefined;
  if (!Number.isFinite(value) || value <= 0) return undefined;
  if (value === 1) return undefined;
  const percent = Math.round((value - 1) * 100);
  return `${percent >= 0 ? '+' : ''}${percent}%`;
};

const formatTtsVolume = (value?: number) => {
  if (value === undefined || value === null) return undefined;
  if (!Number.isFinite(value) || value <= 0) return undefined;
  const percent = Math.round((value - 1) * 100);
  return `${percent >= 0 ? '+' : ''}${percent}%`;
};

const formatTtsPitch = (value?: number) => {
  if (value === undefined || value === null) return undefined;
  if (!Number.isFinite(value)) return undefined;
  if (value === 0) return undefined;
  const ratio = Math.pow(2, value / 12);
  const deltaHz = Math.round(TTS_PITCH_BASE_HZ * (ratio - 1));
  const signed = deltaHz >= 0 ? `+${deltaHz}` : `${deltaHz}`;
  return `${signed}Hz`;
};

const runFfprobeWithBin = (bin: string, input: string) => new Promise<number>((resolve, reject) => {
  const args = [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    input
  ];
  const proc = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  let error = '';
  proc.stdout.on('data', data => { output += data.toString(); });
  proc.stderr.on('data', data => { error += data.toString(); });
  proc.on('error', reject);
  proc.on('close', code => {
    if (code !== 0) {
      reject(new Error(error || `ffprobe exited with code ${code}`));
      return;
    }
    const value = Number.parseFloat(output.trim());
    resolve(Number.isFinite(value) ? value : 0);
  });
});

type TtsTaskResult = {
  outputPath: string;
  outputRelativePath: string;
  voice: string;
  rate?: number;
  pitch?: number;
  volume?: number;
  overlapSeconds: number;
  overlapMode: 'overlap' | 'truncate';
};

const runTtsTask = async (inputFullPath: string, outputDir: string, options?: {
  voice?: string;
  rate?: number;
  pitch?: number;
  volume?: number;
  overlapMode?: 'overlap' | 'truncate';
  removeLineBreaks?: boolean;
  onProgress?: (completed: number, total: number) => void;
  onLog?: (chunk: string) => void;
}): Promise<TtsTaskResult> => {
  const ext = path.extname(inputFullPath).toLowerCase();
  if (!SUB_EXT.has(ext)) {
    throw new Error('TTS input must be a subtitle file');
  }
  const raw = await fs.readFile(inputFullPath, 'utf-8');
  const removeLineBreaks = options?.removeLineBreaks !== false;
  const cues = ext === '.ass' || ext === '.ssa'
    ? parseAssCues(raw, removeLineBreaks)
    : parseSrtVttCues(raw, removeLineBreaks);
  if (!cues.length) {
    throw new Error('Subtitle file has no usable cues');
  }
  const cueDurations = cues.map(cue => Math.max(0, cue.end - cue.start));
  const audioDurations: number[] = [];
  await fs.mkdir(outputDir, { recursive: true });
  const baseName = path.basename(inputFullPath, ext);
  const outputName = `${baseName}.tts.${DEFAULT_TTS_OUTPUT_EXT}`;
  const outputPath = path.join(outputDir, outputName);
  const voice = options?.voice || DEFAULT_TTS_VOICE;
  const rate = formatTtsRate(options?.rate);
  const pitch = formatTtsPitch(options?.pitch);
  const volume = formatTtsVolume(options?.volume);
  const overlapMode = options?.overlapMode === 'overlap' ? 'overlap' : 'truncate';
  const withFlagValue = (flag: string, value?: string) => {
    if (!value) return [];
    return [`${flag}=${value}`];
  };
  const formatArg = (value: string) => (/[^\w@%+=:,./-]/.test(value) ? JSON.stringify(value) : value);
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tts-cues-'));
  const cuePaths: string[] = [];
  try {
    for (let i = 0; i < cues.length; i += 1) {
      const cue = cues[i];
      const cuePath = path.join(tmpDir, `cue-${String(i).padStart(4, '0')}.${DEFAULT_TTS_OUTPUT_EXT}`);
      const args = [
        '--text',
        cue.text,
        '--voice',
        voice,
        '--write-media',
        cuePath,
        ...withFlagValue('--rate', rate),
        ...withFlagValue('--pitch', pitch),
        ...withFlagValue('--volume', volume)
      ];
      const commandLine = [EDGE_TTS_CMD, ...args].map(formatArg).join(' ');
      options?.onLog?.(`COMMAND (tts cue ${i + 1}/${cues.length}): ${commandLine}\n`);
      await new Promise<void>((resolve, reject) => {
        const proc = spawn(EDGE_TTS_CMD, args);
        let errorOutput = '';
        let stdOutput = '';
        proc.stdout.on('data', data => {
          stdOutput += data.toString();
        });
        proc.stderr.on('data', data => {
          errorOutput += data.toString();
        });
        proc.on('error', reject);
        proc.on('close', code => {
          if (code !== 0) {
            const details = [errorOutput, stdOutput].filter(Boolean).join('\n');
            reject(new Error(details || `edge-tts exited with code ${code}`));
            return;
          }
          resolve();
        });
      });
      cuePaths.push(cuePath);
      const duration = await runFfprobe(cuePath).catch(() => 0);
      audioDurations.push(duration);
      options?.onProgress?.(i + 1, cues.length);
    }

    const ffmpegPath = await fs.access('/usr/bin/ffmpeg').then(() => '/usr/bin/ffmpeg').catch(() => 'ffmpeg');
    const inputArgs = cuePaths.flatMap(cuePath => ['-i', cuePath]);
    const filterChains: string[] = [];
    const mixInputs: string[] = [];
    cues.forEach((cue, index) => {
      const delayMs = Math.max(0, Math.round(cue.start * 1000));
      const duration = Math.max(0, cue.end - cue.start);
      const trim = overlapMode === 'truncate' ? `atrim=0:${duration},` : '';
      filterChains.push(`[${index}:a]${trim}asetpts=PTS-STARTPTS,adelay=${delayMs}|${delayMs}[a${index}]`);
      mixInputs.push(`[a${index}]`);
    });
    const filter = `${filterChains.join(';')};${mixInputs.join('')}amix=inputs=${mixInputs.length}:duration=longest,loudnorm=I=-16:TP=-1.5:LRA=11[out]`;
    const ffmpegArgs = [
      '-y',
      ...inputArgs,
      '-filter_complex',
      filter,
      '-map',
      '[out]',
      '-c:a',
      'libmp3lame',
      '-q:a',
      '4',
      outputPath
    ];
    const ffmpegCommand = [ffmpegPath, ...ffmpegArgs].map(formatArg).join(' ');
    options?.onLog?.(`COMMAND (ffmpeg mix): ${ffmpegCommand}\n`);
    await new Promise<void>((resolve, reject) => {
      const proc = spawn(ffmpegPath, ffmpegArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
      let stderr = '';
      proc.stderr.on('data', data => {
        stderr += data.toString();
      });
      proc.on('error', reject);
      proc.on('close', code => {
        if (code === 0) resolve();
        else reject(new Error(stderr.trim() || `ffmpeg exited with code ${code}`));
      });
    });
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => null);
  }
  const segments = cues.map((cue, index) => {
    const duration = audioDurations[index] ?? 0;
    const cap = overlapMode === 'truncate' ? Math.min(duration, cueDurations[index] ?? duration) : duration;
    return { start: cue.start, end: cue.start + Math.max(0, cap) };
  }).filter(seg => seg.end > seg.start);
  const overlapSeconds = computeOverlapSecondsFromSegments(segments);
  return {
    outputPath,
    outputRelativePath: path.relative(MEDIA_VAULT_ROOT, outputPath),
    voice,
    rate: options?.rate,
    pitch: options?.pitch,
    volume: options?.volume,
    overlapSeconds,
    overlapMode
  };
};

const runFfprobe = async (input: string) => {
  try {
    return await runFfprobeWithBin(process.env.FFPROBE_PATH ?? 'ffprobe', input);
  } catch (error) {
    if (error instanceof Error && error.message.includes('ENOENT')) {
      return await runFfprobeWithBin('/usr/bin/ffprobe', input);
    }
    throw error;
  }
};

const getDurationSeconds = async (fullPath: string, type: VaultFileDTO['type'], stats: { mtimeMs: number }) => {
  if (type !== 'video' && type !== 'audio' && type !== 'subtitle') return undefined;
  const cacheKey = `${fullPath}:${type}`;
  const cached = durationCache.get(cacheKey);
  if (cached && cached.mtimeMs === stats.mtimeMs) return cached.duration;

  try {
    let duration = 0;
    if (type === 'subtitle') {
      const content = await fs.readFile(fullPath, 'utf-8');
      duration = parseSubtitleDuration(content);
    } else {
      duration = await runFfprobe(fullPath);
    }
    if (duration > 0) {
      durationCache.set(cacheKey, { mtimeMs: stats.mtimeMs, duration });
      return duration;
    }
  } catch {
    return undefined;
  }
  return undefined;
};

const readFilesFromDir = async (
  dirPath: string,
  basePath: string,
  includeSubdir = false,
  uvrMeta?: Map<string, VaultFileDTO['uvr']>,
  ttsMeta?: Map<string, VaultFileDTO['tts']>
) => {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const files: VaultFileDTO[] = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const fullPath = path.join(dirPath, entry.name);
    const stats = await fs.stat(fullPath);
    const relativePath = path.relative(basePath, fullPath);
    const type = detectType(dirPath, entry.name);
    const durationSeconds = await getDurationSeconds(fullPath, type, stats);
    files.push({
      name: entry.name,
      relativePath,
      sizeBytes: stats.size,
      modifiedAt: stats.mtime.toISOString(),
      type: includeSubdir && type !== 'subtitle' && type !== 'video' && type !== 'audio'
        ? 'output'
        : type,
      extension: path.extname(entry.name).toLowerCase(),
      durationSeconds,
      uvr: uvrMeta?.get(relativePath),
      tts: ttsMeta?.get(relativePath),
      linkedTo: ttsMeta?.get(relativePath)?.sourceRelativePath ?? uvrMeta?.get(relativePath)?.sourceRelativePath
    });
  }

  return files;
};

const buildUvrOutputMap = (uvrMeta: Map<string, VaultFileDTO['uvr']>) => {
  const outputMap = new Map<string, VaultFileDTO['uvr']>();
  for (const [sourceRelativePath, meta] of uvrMeta.entries()) {
    if (!meta?.outputs?.length) continue;
    meta.outputs.forEach(outputPath => {
      outputMap.set(outputPath, { ...meta, role: 'output', sourceRelativePath });
    });
  }
  return outputMap;
};

const buildTtsOutputMap = (ttsMeta: Map<string, VaultFileDTO['tts']>) => {
  const outputMap = new Map<string, VaultFileDTO['tts']>();
  for (const [sourceRelativePath, meta] of ttsMeta.entries()) {
    if (!meta?.outputs?.length) continue;
    meta.outputs.forEach(outputPath => {
      outputMap.set(outputPath, { ...meta, role: 'output', sourceRelativePath });
    });
  }
  return outputMap;
};

const readProjectTtsMeta = async (projectRoot: string) => {
  const metaFile = path.join(projectRoot, '.mediaforge', 'tts.json');
  try {
    const raw = await fs.readFile(metaFile, 'utf-8');
    const parsed = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed) {
      return parsed as Record<string, VaultFileDTO['tts']>;
    }
  } catch {
    return {};
  }
  return {};
};

const readProjectUvrMeta = async (projectRoot: string) => {
  const metaFile = path.join(projectRoot, '.mediaforge', 'uvr.json');
  try {
    const raw = await fs.readFile(metaFile, 'utf-8');
    const parsed = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed) {
      return parsed as Record<string, VaultFileDTO['uvr']>;
    }
  } catch {
    return {};
  }
  return {};
};

const readVault = async (): Promise<VaultFolderDTO[]> => {
  const rootEntries = await fs.readdir(MEDIA_VAULT_ROOT, { withFileTypes: true });
  const folders: VaultFolderDTO[] = [];

  for (const entry of rootEntries) {
    if (!entry.isDirectory()) continue;
    const folderPath = path.join(MEDIA_VAULT_ROOT, entry.name);
    const subEntries = await fs.readdir(folderPath, { withFileTypes: true });
    const sourceDir = subEntries.find(item => item.isDirectory() && item.name.toLowerCase() === 'source');
    if (!sourceDir) {
      continue;
    }

    const sourcePath = path.join(folderPath, sourceDir.name);
    const projectUvrMeta = await readProjectUvrMeta(folderPath);
    const uvrMetaMap = new Map<string, VaultFileDTO['uvr']>(Object.entries(projectUvrMeta));
    const uvrOutputMeta = buildUvrOutputMap(uvrMetaMap);
    const projectTtsMeta = await readProjectTtsMeta(folderPath);
    const ttsMetaMap = new Map<string, VaultFileDTO['tts']>(Object.entries(projectTtsMeta));
    const ttsOutputMeta = buildTtsOutputMap(ttsMetaMap);
    const folderFiles = await readFilesFromDir(sourcePath, MEDIA_VAULT_ROOT, false, uvrMetaMap, ttsMetaMap);
    const outputDirEntry = subEntries.find(item => item.isDirectory() && OUTPUT_DIR_NAMES.has(item.name.toLowerCase()));
    if (outputDirEntry) {
      const outputPath = path.join(folderPath, outputDirEntry.name);
      const outputFiles = await readFilesFromDir(outputPath, MEDIA_VAULT_ROOT, true, uvrOutputMeta, ttsOutputMeta);
      folderFiles.push(...outputFiles);
    }

    folders.push({
      name: entry.name,
      path: folderPath,
      files: folderFiles,
    });
  }

  return folders;
};

app.get('/api/vault', async (_req, res) => {
  try {
    const folders = await readVault();
    res.json({ folders });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

app.delete('/api/vault/project', async (req, res) => {
  const projectNameRaw = typeof req.body?.projectName === 'string' ? req.body.projectName.trim() : '';
  if (!projectNameRaw) {
    res.status(400).json({ error: 'Missing projectName' });
    return;
  }
  const safeProjectName = sanitizeProjectName(projectNameRaw);
  if (!safeProjectName || safeProjectName !== projectNameRaw) {
    res.status(400).json({ error: 'Invalid project name' });
    return;
  }
  const rootPath = path.resolve(MEDIA_VAULT_ROOT);
  const projectRoot = path.join(MEDIA_VAULT_ROOT, safeProjectName);
  const resolvedProjectRoot = path.resolve(projectRoot);
  if (!resolvedProjectRoot.startsWith(`${rootPath}${path.sep}`)) {
    res.status(400).json({ error: 'Invalid project path' });
    return;
  }
  try {
    const stats = await fs.stat(resolvedProjectRoot);
    if (!stats.isDirectory()) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
  } catch {
    res.status(404).json({ error: 'Project not found' });
    return;
  }
  try {
    await fs.rm(resolvedProjectRoot, { recursive: true, force: true });
    res.json({ ok: true, projectName: safeProjectName });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to delete project';
    res.status(500).json({ error: message });
  }
});

const UVR_WORKDIR = path.dirname(UVR_CLI_PATH);
const YTDLP_BIN = process.env.YTDLP_PATH ?? 'yt-dlp';

const listVrModels = () => new Promise<string[]>((resolve, reject) => {
  const proc = spawn('python3', [UVR_CLI_PATH, '--list-models'], { stdio: ['ignore', 'pipe', 'pipe'], cwd: UVR_WORKDIR });
  let output = '';
  let error = '';
  proc.stdout.on('data', data => { output += data.toString(); });
  proc.stderr.on('data', data => { error += data.toString(); });
  proc.on('error', reject);
  proc.on('close', code => {
    if (code !== 0) {
      reject(new Error(error || `uvr_cli exited with code ${code}`));
      return;
    }
    const models = output.split('\n').map(line => line.trim()).filter(Boolean);
    resolve(models);
  });
});

app.get('/api/tasks/vr/models', async (_req, res) => {
  try {
    const models = await listVrModels();
    res.json({ models });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to list models';
    res.status(500).json({ error: message, models: [] });
  }
});

app.get('/api/fonts', async (_req, res) => {
  try {
    const now = Date.now();
    if (cachedFonts && now - cachedFontsAt < FONT_LIST_CACHE_MS) {
      res.json({ fonts: cachedFonts });
      return;
    }
    const fonts = await listSystemFonts();
    cachedFonts = fonts;
    cachedFontsAt = now;
    res.json({ fonts });
  } catch {
    res.json({ fonts: [] });
  }
});

app.get('/api/pipelines', async (_req, res) => {
  try {
    const result = db.exec('SELECT id, name, graph_json, created_at FROM pipelines ORDER BY id DESC');
    const rows = result[0]?.values ?? [];
    const pipelines = rows.map((row: any[]) => {
      const [id, name, graphJson, createdAt] = row;
      let steps = 0;
      let primaryType: string | null = null;
      try {
        const parsed = JSON.parse(graphJson);
        const nodes = Array.isArray(parsed?.nodes) ? parsed.nodes : [];
        steps = nodes.length;
        primaryType = nodes[0]?.type ?? null;
      } catch {
        steps = 0;
        primaryType = null;
      }
      return {
        id,
        name,
        steps,
        updatedAt: createdAt,
        primaryType
      };
    });
    res.json({ pipelines });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load pipelines';
    res.status(500).json({ error: message });
  }
});

app.get('/api/pipelines/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: 'Invalid id' });
    return;
  }
  try {
    const result = db.exec('SELECT id, name, graph_json, created_at FROM pipelines WHERE id = ? LIMIT 1', [id]);
    const row = result[0]?.values?.[0];
    if (!row) {
      res.status(404).json({ error: 'Pipeline not found' });
      return;
    }
    const [pid, name, graphJson, createdAt] = row;
    res.json({ id: pid, name, graph: JSON.parse(graphJson), createdAt });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load pipeline';
    res.status(500).json({ error: message });
  }
});

app.post('/api/pipelines', async (req, res) => {
  const name = typeof req.body?.name === 'string' && req.body.name.trim() ? req.body.name.trim() : 'Untitled Pipeline';
  const graph = req.body?.graph;
  if (!graph || typeof graph !== 'object') {
    res.status(400).json({ error: 'Missing graph' });
    return;
  }
  const graphJson = JSON.stringify(graph);
  const createdAt = new Date().toISOString();
  try {
    db.run('INSERT INTO pipelines (name, graph_json, created_at) VALUES (?, ?, ?)', [name, graphJson, createdAt]);
    const idRow = db.exec('SELECT last_insert_rowid() as id');
    const id = idRow[0]?.values?.[0]?.[0] ?? null;
    await persistDb();
    res.json({ id });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to save pipeline';
    res.status(500).json({ error: message });
  }
});

app.get('/api/jobs', async (_req, res) => {
  res.json({ jobs });
});

app.get('/api/param-presets', async (_req, res) => {
  try {
    const result = db.exec('SELECT id, task_type, params_json, label, updated_at FROM param_presets ORDER BY updated_at DESC');
    const rows = result[0]?.values ?? [];
    const presets = rows.map((row: any[]) => {
      const [id, taskType, paramsJson, label, updatedAt] = row;
      let params: Record<string, any> = {};
      try {
        params = JSON.parse(String(paramsJson));
      } catch {
        params = {};
      }
      return {
        id,
        taskType: String(taskType),
        params,
        label: label ? String(label) : '',
        updatedAt
      };
    });
    res.json({ presets });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load presets';
    res.status(500).json({ error: message });
  }
});

app.post('/api/param-presets', async (req, res) => {
  const taskType = typeof req.body?.taskType === 'string' ? req.body.taskType.trim() : '';
  const params = typeof req.body?.params === 'object' && req.body.params ? req.body.params : null;
  const label = typeof req.body?.label === 'string' ? req.body.label.trim() : '';
  const id = Number.isFinite(Number(req.body?.id)) ? Number(req.body.id) : null;
  if (!taskType || !params) {
    res.status(400).json({ error: 'Missing taskType or params' });
    return;
  }
  try {
    if (id) {
      db.run(
        `UPDATE param_presets
         SET task_type = ?, params_json = ?, label = ?, updated_at = ?
         WHERE id = ?`,
        [taskType, JSON.stringify(params), label || null, new Date().toISOString(), id]
      );
      await persistDb();
      res.json({ id });
      return;
    }
    db.run(
      `INSERT INTO param_presets (task_type, params_json, label, updated_at)
       VALUES (?, ?, ?, ?)`,
      [taskType, JSON.stringify(params), label || null, new Date().toISOString()]
    );
    await persistDb();
    const idRow = db.exec('SELECT last_insert_rowid() as id');
    const nextId = idRow[0]?.values?.[0]?.[0] ?? null;
    res.json({ id: nextId });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to save presets';
    res.status(500).json({ error: message });
  }
});

app.delete('/api/param-presets/:id', async (req, res) => {
  const id = Number(req.params?.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: 'Missing id' });
    return;
  }
  try {
    db.run('DELETE FROM param_presets WHERE id = ?', [id]);
    await persistDb();
    res.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to delete presets';
    res.status(500).json({ error: message });
  }
});

app.post('/api/vault/import', express.raw({ type: 'multipart/form-data', limit: '2gb' }), async (req, res) => {
  try {
    const contentType = String(req.headers['content-type'] || '');
    const boundaryMatch = contentType.match(/boundary=(.+)$/);
    if (!boundaryMatch) {
      res.status(400).json({ error: 'Missing multipart boundary' });
      return;
    }
    const boundary = boundaryMatch[1];
    const buffer = req.body as Buffer;
    const delimiter = Buffer.from(`--${boundary}`);
    const parts: Buffer[] = [];
    let start = buffer.indexOf(delimiter);
    while (start !== -1) {
      start += delimiter.length;
      const end = buffer.indexOf(delimiter, start);
      if (end === -1) break;
      parts.push(buffer.slice(start, end));
      start = end;
    }

    const files: Array<{ filename: string; data: Buffer }> = [];
    let projectNameRaw = '';
    for (const part of parts) {
      const trimmed = part.slice(0, 2).equals(Buffer.from('\r\n')) ? part.slice(2) : part;
      const headerEnd = trimmed.indexOf(Buffer.from('\r\n\r\n'));
      if (headerEnd === -1) continue;
      const headerText = trimmed.slice(0, headerEnd).toString('utf-8');
      const content = trimmed.slice(headerEnd + 4, trimmed.length - 2); // drop trailing CRLF
      const disposition = headerText.match(/Content-Disposition:[^\n]+/i)?.[0] ?? '';
      const nameMatch = disposition.match(/name=\"([^\"]+)\"/i);
      const filenameMatch = disposition.match(/filename=\"([^\"]*)\"/i);
      const fieldName = nameMatch?.[1] ?? '';
      if (filenameMatch && filenameMatch[1]) {
        files.push({ filename: filenameMatch[1], data: content });
      } else if (fieldName === 'projectName') {
        projectNameRaw = content.toString('utf-8').trim();
      }
    }

    const safeProjectName = sanitizeProjectName(projectNameRaw);
    if (!safeProjectName) {
      res.status(400).json({ error: 'Missing projectName' });
      return;
    }
    if (files.length === 0) {
      res.status(400).json({ error: 'No files uploaded' });
      return;
    }

    const projectRoot = path.join(MEDIA_VAULT_ROOT, safeProjectName);
    const sourceDir = path.join(projectRoot, 'source');
    await fs.mkdir(sourceDir, { recursive: true });

    const uniqueName = async (dir: string, baseName: string) => {
      const parsed = path.parse(baseName);
      let name = sanitizeFileName(baseName);
      let counter = 1;
      while (true) {
        const candidate = path.join(dir, name);
        const exists = await fs.stat(candidate).then(stat => stat.isFile()).catch(() => false);
        if (!exists) return name;
        name = `${parsed.name} (${counter})${parsed.ext}`;
        counter += 1;
      }
    };

    for (const file of files) {
      const safeName = await uniqueName(sourceDir, file.filename);
      const dest = path.join(sourceDir, safeName);
      await fs.writeFile(dest, file.data);
    }

    res.json({ ok: true, projectName: safeProjectName, count: files.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Import failed';
    res.status(500).json({ error: message });
  }
});

app.delete('/api/jobs/:id', async (req, res) => {
  const job = getJobById(req.params.id);
  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }
  if (job.status === 'queued' || job.status === 'processing') {
    res.status(400).json({ error: 'Cannot delete a running job. Please cancel it first.' });
    return;
  }
  const index = jobs.findIndex(item => item.id === job.id);
  if (index >= 0) jobs.splice(index, 1);
  db.run('DELETE FROM jobs WHERE id = ?', [job.id]);
  await persistDb();
  res.json({ ok: true });
});

app.post('/api/jobs/:id/cancel', async (req, res) => {
  const job = getJobById(req.params.id);
  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }
  if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
    res.status(400).json({ error: `Job already ${job.status}` });
    return;
  }
  (job as any).__cancelRequested = true;
  if (job.status === 'queued') {
    const index = jobQueue.indexOf(job.id);
    if (index >= 0) jobQueue.splice(index, 1);
    const downloadIndex = downloadQueue.indexOf(job.id);
    if (downloadIndex >= 0) downloadQueue.splice(downloadIndex, 1);
    job.status = 'cancelled';
    job.progress = 0;
    job.finishedAt = new Date().toISOString();
    job.durationMs = new Date(job.finishedAt).getTime() - new Date(job.createdAt).getTime();
    job.tasks.forEach(task => {
      if (task.status === 'active' || task.status === 'pending') task.status = 'error';
    });
    appendJobLog(job, CANCELLED_ERROR_MESSAGE);
    scheduleJobPersist(job);
    res.json({ ok: true });
    return;
  }
  const controller = (job as any).__abortController as AbortController | undefined;
  controller?.abort();
  const proc = (job as any).__activeProcess as ReturnType<typeof spawn> | undefined;
  proc?.kill('SIGTERM');
  appendJobLog(job, 'Cancel requested. Stopping process...');
  scheduleJobPersist(job);
  res.json({ ok: true });
});

app.post('/api/jobs/run', async (req, res) => {
  const pipelineId = Number(req.body?.pipelineId);
  const inlineGraph = req.body?.graph;
  const inlineName = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const inputPath = typeof req.body?.inputPath === 'string' ? req.body.inputPath : '';
  const downloadUrl = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
  const downloadProjectNameRaw = typeof req.body?.projectName === 'string' ? req.body.projectName.trim() : '';
  const downloadCookiesFile = typeof req.body?.cookiesFile === 'string'
    ? req.body.cookiesFile.trim()
    : (typeof req.body?.cookies === 'string' ? req.body.cookies.trim() : '');
  const downloadCookiesContent = typeof req.body?.cookiesContent === 'string' ? req.body.cookiesContent : '';
  const downloadCookiesFileName = typeof req.body?.cookiesFileName === 'string' ? req.body.cookiesFileName.trim() : '';
  const downloadNoPlaylist = typeof req.body?.noPlaylist === 'boolean' ? req.body.noPlaylist : true;
  const downloadSubLangs = typeof req.body?.subLangs === 'string' ? req.body.subLangs.trim() : '';
  const downloadModeRaw = typeof req.body?.downloadMode === 'string' ? req.body.downloadMode.trim() : 'all';
  const downloadMode = (downloadModeRaw === 'subs' || downloadModeRaw === 'media' || downloadModeRaw === 'all')
    ? downloadModeRaw
    : 'all';
  const model = typeof req.body?.model === 'string' ? req.body.model : 'MGM_MAIN_v4.pth';
  const backend = typeof req.body?.backend === 'string' ? req.body.backend : 'vr';
  const outputFormat = typeof req.body?.outputFormat === 'string' ? req.body.outputFormat : 'Mp3';
  const ttsOverlapMode = req.body?.overlapMode === 'overlap' ? 'overlap' : 'truncate';
  const ttsRemoveLineBreaks = req.body?.removeLineBreaks !== false;
  const overwrite = req.body?.overwrite === true;
  const ttsVoice = typeof req.body?.voice === 'string' ? req.body.voice.trim() : '';
  const ttsRate = typeof req.body?.rate === 'number' ? req.body.rate : undefined;
  const ttsPitch = typeof req.body?.pitch === 'number' ? req.body.pitch : undefined;
  const ttsVolume = typeof req.body?.volume === 'number' ? req.body.volume : undefined;

  try {
    let pipelineName = inlineName || 'Ad-hoc Pipeline';
    let graph = inlineGraph;
    if (Number.isFinite(pipelineId)) {
      const result = db.exec('SELECT id, name, graph_json FROM pipelines WHERE id = ? LIMIT 1', [pipelineId]);
      const row = result[0]?.values?.[0];
      if (!row) {
        res.status(404).json({ error: 'Pipeline not found' });
        return;
      }
      const [, name, graphJson] = row;
      pipelineName = name;
      graph = JSON.parse(graphJson);
    } else if (!graph || typeof graph !== 'object') {
      res.status(400).json({ error: 'Invalid pipelineId or graph' });
      return;
    }

    const tasks = buildTasksFromGraph(graph);
    if (!tasks.length) {
      res.status(400).json({ error: 'Pipeline has no tasks' });
      return;
    }

    const hasDownload = tasks.some(task => task.type === 'download' || task.type.startsWith('download_'));
    const createdAt = new Date().toISOString();
    const jobId = `job-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    let job: JobRecord;
    if (hasDownload) {
      if (!downloadUrl) {
        res.status(400).json({ error: 'Missing url' });
        return;
      }
      const safeProjectName = sanitizeProjectName(downloadProjectNameRaw);
      if (!safeProjectName) {
        res.status(400).json({ error: 'Missing projectName' });
        return;
      }
      if (downloadProjectNameRaw.trim() !== safeProjectName) {
        res.status(400).json({ error: 'Invalid project name' });
        return;
      }
      const projectRoot = path.join(MEDIA_VAULT_ROOT, safeProjectName);
      const sourceDir = path.join(projectRoot, 'source');
      const workingDir = path.join(projectRoot, 'working');
      const outputDir = path.join(projectRoot, UVR_OUTPUT_DIRNAME);
      const projectExists = await fs.stat(projectRoot).then(stat => stat.isDirectory()).catch(() => false);
      if (projectExists) {
        const hasFiles = async (dir: string) => {
          try {
            const entries = await fs.readdir(dir);
            return entries.length > 0;
          } catch {
            return false;
          }
        };
        const alreadyHasOutputs = await hasFiles(sourceDir) || await hasFiles(outputDir);
        if (alreadyHasOutputs && !overwrite) {
          res.status(409).json({ error: 'Project outputs already exist.', kind: 'download' });
          return;
        }
      }
      await fs.mkdir(sourceDir, { recursive: true });
      await fs.mkdir(workingDir, { recursive: true });
      await fs.mkdir(outputDir, { recursive: true });
      let cookiesFile: string | null = null;
      if (downloadCookiesContent) {
        const filename = sanitizeFileName(downloadCookiesFileName || 'cookies.txt');
        cookiesFile = path.join(workingDir, filename);
        await fs.writeFile(cookiesFile, downloadCookiesContent, 'utf-8');
      } else if (downloadCookiesFile) {
        cookiesFile = resolveCookiesPath(downloadCookiesFile);
        if (!cookiesFile) {
          res.status(400).json({ error: 'Invalid cookiesFile path' });
          return;
        }
        try {
          const stats = await fs.stat(cookiesFile);
          if (!stats.isFile()) {
            res.status(400).json({ error: 'cookiesFile is not a file' });
            return;
          }
        } catch {
          res.status(400).json({ error: 'cookiesFile not found' });
          return;
        }
      }

      job = {
        id: jobId,
        name: pipelineName,
        projectName: safeProjectName,
        fileName: downloadUrl,
        fileSize: '0 B',
        status: 'queued',
        progress: 0,
        tasks,
        createdAt,
        params: {
          pipelineId,
          pipelineName,
          projectName: safeProjectName,
          download: {
            url: downloadUrl,
            mode: downloadMode,
            noPlaylist: downloadNoPlaylist,
            subLangs: downloadSubLangs,
            overwrite
          },
          uvr: {
            backend,
            model,
            outputFormat
          },
          tts: {
            voice: ttsVoice || undefined,
            rate: ttsRate,
            pitch: ttsPitch,
            volume: ttsVolume,
            overlapMode: ttsOverlapMode,
            removeLineBreaks: ttsRemoveLineBreaks
          }
        }
      };

      (job as any).__downloadUrl = downloadUrl;
      (job as any).__downloadSourceDir = sourceDir;
      (job as any).__downloadCookiesFile = cookiesFile;
      (job as any).__downloadNoPlaylist = downloadNoPlaylist;
      (job as any).__downloadSubLangs = downloadSubLangs;
      (job as any).__downloadMode = downloadMode;
      (job as any).__projectRoot = projectRoot;
      (job as any).__projectRelativePath = path.relative(MEDIA_VAULT_ROOT, projectRoot);
      (job as any).__outputDir = outputDir;
      (job as any).__model = model;
      (job as any).__outputFormat = outputFormat;
      (job as any).__backend = backend;
      (job as any).__ttsOverlapMode = ttsOverlapMode;
      (job as any).__ttsRemoveLineBreaks = ttsRemoveLineBreaks;
      if (ttsVoice) (job as any).__ttsVoice = ttsVoice;
      if (ttsRate !== undefined) (job as any).__ttsRate = ttsRate;
      if (ttsPitch !== undefined) (job as any).__ttsPitch = ttsPitch;
      if (ttsVolume !== undefined) (job as any).__ttsVolume = ttsVolume;
    } else {
      if (!inputPath) {
        res.status(400).json({ error: 'Missing inputPath' });
        return;
      }
      const fullPath = resolveSafePath(inputPath);
      if (!fullPath) {
        res.status(400).json({ error: 'Invalid inputPath' });
        return;
      }

      const stats = await fs.stat(fullPath);
      const fileName = path.basename(fullPath);
      const fileSize = formatBytes(stats.size);
      const projectName = inputPath.split(/[\\/]/)[0];
      const projectRoot = path.join(MEDIA_VAULT_ROOT, projectName);
      const outputDir = path.join(projectRoot, UVR_OUTPUT_DIRNAME);
      await fs.mkdir(outputDir, { recursive: true });

      if (!overwrite) {
        const existing = await fs.readdir(outputDir).catch(() => []);
        const baseName = path.parse(fullPath).name.toLowerCase();
        const hasUvr = tasks.some(task => task.type === 'uvr');
        const hasTts = tasks.some(task => task.type === 'tts');
        if (hasTts) {
          const ttsName = `${path.parse(fullPath).name}.tts.${DEFAULT_TTS_OUTPUT_EXT}`;
          const ttsPath = path.join(outputDir, ttsName);
          const ttsExists = await fs.stat(ttsPath).then(stat => stat.isFile()).catch(() => false);
          if (ttsExists) {
            res.status(409).json({ error: 'TTS output already exists.', kind: 'tts', path: path.relative(MEDIA_VAULT_ROOT, ttsPath) });
            return;
          }
        }
        if (hasUvr) {
          const hasMatch = existing.some(name => name.toLowerCase().includes(baseName));
          if (hasMatch) {
            res.status(409).json({ error: 'UVR outputs already exist.', kind: 'uvr' });
            return;
          }
        }
      }

      job = {
        id: jobId,
        name: pipelineName,
        projectName,
        fileName,
        fileSize,
        status: 'queued',
        progress: 0,
        tasks,
        createdAt,
        params: {
          pipelineId,
          pipelineName,
          projectName,
          inputRelativePath: inputPath,
          uvr: {
            backend,
            model,
            outputFormat
          },
          tts: {
            voice: ttsVoice || undefined,
            rate: ttsRate,
            pitch: ttsPitch,
            volume: ttsVolume,
            overlapMode: ttsOverlapMode,
            removeLineBreaks: ttsRemoveLineBreaks
          }
        }
      };

      (job as any).__inputPath = fullPath;
      (job as any).__inputRelativePath = inputPath;
      (job as any).__outputDir = outputDir;
      (job as any).__model = model;
      (job as any).__outputFormat = outputFormat;
      (job as any).__backend = backend;
      (job as any).__ttsOverlapMode = ttsOverlapMode;
      (job as any).__ttsRemoveLineBreaks = ttsRemoveLineBreaks;
      if (ttsVoice) (job as any).__ttsVoice = ttsVoice;
      if (ttsRate !== undefined) (job as any).__ttsRate = ttsRate;
      if (ttsPitch !== undefined) (job as any).__ttsPitch = ttsPitch;
      if (ttsVolume !== undefined) (job as any).__ttsVolume = ttsVolume;
    }

    jobs.unshift(job);
    scheduleJobPersist(job);
    if (hasDownload) {
      if (activeDownloadCount < MAX_ACTIVE_DOWNLOADS) {
        activeDownloadCount += 1;
        runJob(job, 'download');
      } else {
        downloadQueue.push(jobId);
      }
    } else {
      jobQueue.push(jobId);
      processNextJob();
    }

    res.json({ id: jobId });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to run pipeline';
    res.status(500).json({ error: message });
  }
});

app.delete('/api/pipelines/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: 'Invalid id' });
    return;
  }
  try {
    db.run('DELETE FROM pipelines WHERE id = ?', [id]);
    await persistDb();
    res.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to delete pipeline';
    res.status(500).json({ error: message });
  }
});

app.post('/api/tasks/ytdlp/analyze', async (req, res) => {
  const url = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
  const cookiesContent = typeof req.body?.cookiesContent === 'string' ? req.body.cookiesContent : '';
  const cookiesFileName = typeof req.body?.cookiesFileName === 'string' ? req.body.cookiesFileName.trim() : '';
  const noPlaylist = typeof req.body?.noPlaylist === 'boolean' ? req.body.noPlaylist : true;
  if (!url) {
    res.status(400).json({ error: 'Missing url' });
    return;
  }

  let cookiesFile: string | undefined;
  let tempDir: string | null = null;
  try {
    if (cookiesContent) {
      tempDir = await fs.mkdtemp(path.join('/tmp', 'yt-dlp-cookies-'));
      const filename = sanitizeFileName(cookiesFileName || 'cookies.txt');
      cookiesFile = path.join(tempDir, filename);
      await fs.writeFile(cookiesFile, cookiesContent, 'utf-8');
    }
    const result = await runYtDlpAnalyze(url, cookiesFile, noPlaylist, 60000);
    let listSubsOutput = '';
    let listSubsParsed: Array<{ lang: string; formats: string[] }> = [];
    if (cookiesFile) {
      try {
        listSubsOutput = await runYtDlpListSubs(url, cookiesFile, noPlaylist, 60000);
        listSubsParsed = parseYtDlpListSubs(listSubsOutput);
      } catch {
        listSubsOutput = '';
        listSubsParsed = [];
      }
    }
    res.json({
      ...result,
      listSubs: listSubsParsed,
      listSubsRaw: listSubsOutput || null
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to analyze url';
    res.status(500).json({ error: message });
  } finally {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => null);
    }
  }
});

const runYtDlpTask = async (
  url: string,
  outputDir: string,
  cookiesFile?: string,
  noPlaylist = true,
  subLangs?: string,
  downloadMode: 'all' | 'subs' | 'media' = 'all',
  onData?: (chunk: string) => void,
  options?: { signal?: AbortSignal; onStart?: (proc: ReturnType<typeof spawn>) => void }
) => {
  const normalizedLangs = subLangs?.trim();
  const wantsSubs = Boolean(normalizedLangs);
  const baseArgs = [
    ...(noPlaylist ? ['--no-playlist'] : []),
    '--no-warnings',
    '--newline',
    ...(cookiesFile ? ['--cookies', cookiesFile] : []),
    '-o', path.join(outputDir, '%(title).200s.%(ext)s'),
    url
  ];

  const runWithArgs = (args: string[], label: string) => {
    const formatArg = (value: string) => (/[^\w@%+=:,./-]/.test(value) ? JSON.stringify(value) : value);
    const commandLine = [YTDLP_BIN, ...args].map(formatArg).join(' ');
    if (options?.signal?.aborted) {
      return Promise.reject(new Error(CANCELLED_ERROR_MESSAGE));
    }
    return new Promise<string>((resolve, reject) => {
      const proc = spawn(YTDLP_BIN, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      options?.onStart?.(proc);
      let output = '';
      let error = '';
      const commandPrefix = `COMMAND (${label}): ${commandLine}\n`;
      output += commandPrefix;
      onData?.(commandPrefix);
      const handleAbort = () => {
        proc.kill('SIGTERM');
      };
      options?.signal?.addEventListener('abort', handleAbort);
      proc.stdout.on('data', data => {
        const chunk = data.toString();
        output += chunk;
        onData?.(chunk);
      });
      proc.stderr.on('data', data => {
        const chunk = data.toString();
        error += chunk;
        onData?.(chunk);
      });
      proc.on('error', reject);
      proc.on('close', code => {
        options?.signal?.removeEventListener('abort', handleAbort);
        if (options?.signal?.aborted) {
          reject(new Error(CANCELLED_ERROR_MESSAGE));
          return;
        }
        const combined = [output.trim(), error.trim()].filter(Boolean).join('\n');
        if (code !== 0) {
          reject(new Error(combined || `yt-dlp exited with code ${code}`));
          return;
        }
        resolve(combined);
      });
    });
  };

  const subsArgs = [
    ...(wantsSubs ? ['--write-subs', '--sub-langs', normalizedLangs!] : ['--write-subs', '--write-auto-subs']),
    '--sub-format', 'srt',
    '--convert-subs', 'srt',
    '--skip-download',
    ...baseArgs
  ];

  const mediaArgs = [
    ...baseArgs
  ];

  const listFiles = async () => {
    const entries = await fs.readdir(outputDir, { withFileTypes: true });
    return entries.filter(entry => entry.isFile()).map(entry => entry.name);
  };

  const beforeSubs = new Set<string>(await listFiles());
  let subsLog = '';
  let afterSubs = await listFiles();
  let subsFiles: string[] = [];
  if (downloadMode !== 'media') {
    subsLog = await runWithArgs(subsArgs, 'subs-only');
    afterSubs = await listFiles();
    subsFiles = afterSubs.filter(name => !beforeSubs.has(name));
  }

  const beforeMedia = new Set<string>(afterSubs);
  let mediaLog = '';
  let afterMedia = await listFiles();
  let mediaFiles: string[] = [];
  if (downloadMode !== 'subs') {
    mediaLog = await runWithArgs(mediaArgs, 'media');
    afterMedia = await listFiles();
    mediaFiles = afterMedia.filter(name => !beforeMedia.has(name));
  }

  const combinedLog = [subsLog, mediaLog].filter(Boolean).join('\n');
  return { log: combinedLog, subsFiles, mediaFiles };
};

const runYtDlpAnalyze = async (
  url: string,
  cookiesFile?: string,
  noPlaylist = true,
  timeoutMs = 60000
) => {
  const args = [
    ...(noPlaylist ? ['--no-playlist'] : []),
    '--no-warnings',
    '-J',
    ...(cookiesFile ? ['--cookies', cookiesFile] : []),
    url
  ];
  return new Promise<any>((resolve, reject) => {
    const proc = spawn(YTDLP_BIN, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    let error = '';
    const timer = setTimeout(() => {
      proc.kill('SIGTERM');
      reject(new Error('yt-dlp analyze timed out'));
    }, timeoutMs);
    proc.stdout.on('data', data => { output += data.toString(); });
    proc.stderr.on('data', data => { error += data.toString(); });
    proc.on('error', reject);
    proc.on('close', code => {
      clearTimeout(timer);
      const combinedError = error.trim();
      if (code !== 0) {
        reject(new Error(combinedError || `yt-dlp exited with code ${code}`));
        return;
      }
      try {
        const parsed = JSON.parse(output.trim());
        resolve({ data: parsed, warnings: combinedError ? combinedError.split(/\r?\n/).filter(Boolean) : [] });
      } catch (parseError) {
        reject(new Error(combinedError || 'Unable to parse yt-dlp output'));
      }
    });
  });
};

const runYtDlpListSubs = async (
  url: string,
  cookiesFile?: string,
  noPlaylist = true,
  timeoutMs = 60000
) => {
  const args = [
    ...(noPlaylist ? ['--no-playlist'] : []),
    '--list-subs',
    '--no-warnings',
    ...(cookiesFile ? ['--cookies', cookiesFile] : []),
    url
  ];
  return new Promise<string>((resolve, reject) => {
    const proc = spawn(YTDLP_BIN, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    let error = '';
    const timer = setTimeout(() => {
      proc.kill('SIGTERM');
      reject(new Error('yt-dlp list-subs timed out'));
    }, timeoutMs);
    proc.stdout.on('data', data => { output += data.toString(); });
    proc.stderr.on('data', data => { error += data.toString(); });
    proc.on('error', reject);
    proc.on('close', code => {
      clearTimeout(timer);
      const combined = [output.trim(), error.trim()].filter(Boolean).join('\n');
      if (code !== 0) {
        reject(new Error(combined || `yt-dlp exited with code ${code}`));
        return;
      }
      resolve(combined);
    });
  });
};

const parseYtDlpListSubs = (text: string) => {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex(line => line.includes('Available subtitles'));
  if (start === -1) return [];
  const entries: Array<{ lang: string; formats: string[] }> = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line) continue;
    if (line.toLowerCase().startsWith('language')) continue;
    if (line.toLowerCase().startsWith('deprecated feature')) continue;
    if (line.startsWith('[')) continue;
    const parts = line.split(/\s+/);
    if (parts.length < 2) continue;
    const [lang, ...formats] = parts;
    const srtFormats = formats.filter(format => format.toLowerCase() === 'srt');
    if (srtFormats.length === 0) continue;
    entries.push({ lang, formats: srtFormats });
  }
  return entries;
};

const runUvrTask = async (
  inputFullPath: string,
  outputDir: string,
  model: string,
  outputFormat: string,
  backend: string,
  onData?: (chunk: string) => void,
  options?: { signal?: AbortSignal; onStart?: (proc: ReturnType<typeof spawn>) => void }
) => {
  const args = [
    UVR_CLI_PATH,
    '--input',
    inputFullPath,
    '--output',
    outputDir,
    '--backend',
    backend,
    '--model',
    model,
    '--save-format',
    outputFormat,
    '--yes',
  ];
  const formatArg = (value: string) => (/[^\w@%+=:,./-]/.test(value) ? JSON.stringify(value) : value);
  const commandLine = ['python3', ...args].map(formatArg).join(' ');
  if (options?.signal?.aborted) {
    return Promise.reject(new Error(CANCELLED_ERROR_MESSAGE));
  }
  return new Promise<string>((resolve, reject) => {
    const proc = spawn('python3', args, { stdio: ['ignore', 'pipe', 'pipe'], cwd: UVR_WORKDIR });
    options?.onStart?.(proc);
    let output = '';
    let error = '';
    const commandPrefix = `COMMAND: ${commandLine}\n`;
    output += commandPrefix;
    onData?.(commandPrefix);
    const handleAbort = () => {
      proc.kill('SIGTERM');
    };
    options?.signal?.addEventListener('abort', handleAbort);
    proc.stdout.on('data', data => {
      const chunk = data.toString();
      output += chunk;
      onData?.(chunk);
    });
    proc.stderr.on('data', data => {
      const chunk = data.toString();
      error += chunk;
      onData?.(chunk);
    });
    proc.on('error', reject);
    proc.on('close', code => {
      options?.signal?.removeEventListener('abort', handleAbort);
      if (options?.signal?.aborted) {
        reject(new Error(CANCELLED_ERROR_MESSAGE));
        return;
      }
      const combined = [output.trim(), error.trim()].filter(Boolean).join('\n');
      if (code !== 0) {
        reject(new Error(combined || `uvr_cli exited with code ${code}`));
        return;
      }
      resolve(combined);
    });
  });
};

app.post('/api/tasks/vr', async (req, res) => {
  const inputPath = typeof req.body?.inputPath === 'string' ? req.body.inputPath : '';
  const model = typeof req.body?.model === 'string' ? req.body.model : 'MGM_MAIN_v4.pth';
  const backend = typeof req.body?.backend === 'string' ? req.body.backend : 'vr';
  const outputFormat = typeof req.body?.outputFormat === 'string' ? req.body.outputFormat : 'Mp3';
  if (!inputPath) {
    res.status(400).json({ error: 'Missing inputPath' });
    return;
  }

  const fullPath = resolveSafePath(inputPath);
  if (!fullPath) {
    res.status(400).json({ error: 'Invalid inputPath' });
    return;
  }

  const projectName = inputPath.split(/[\\/]/)[0];
  if (!projectName) {
    res.status(400).json({ error: 'Invalid project path' });
    return;
  }

  const projectRoot = path.join(MEDIA_VAULT_ROOT, projectName);
  const outputDir = path.join(projectRoot, UVR_OUTPUT_DIRNAME);
  await fs.mkdir(outputDir, { recursive: true });

  const before = new Set<string>((await fs.readdir(outputDir)).map(name => path.join(outputDir, name)));

  let inputForUvr = fullPath;
  if (isVideoFile(fullPath)) {
    const tempDir = await fs.mkdtemp(path.join('/tmp', 'uvr_input_'));
    const tempPath = path.join(tempDir, `${path.parse(fullPath).name}.wav`);
    const ffmpegPath = await fs.access('/usr/bin/ffmpeg').then(() => '/usr/bin/ffmpeg').catch(() => 'ffmpeg');
    await new Promise<void>((resolve, reject) => {
      const proc = spawn(ffmpegPath, ['-y', '-i', fullPath, '-vn', '-acodec', 'pcm_s16le', tempPath], { stdio: 'ignore' });
      proc.on('error', reject);
      proc.on('close', code => {
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg exited with code ${code}`));
      });
    });
    inputForUvr = tempPath;
  }

  try {
    const uvrLog = await runUvrTask(inputForUvr, outputDir, model, outputFormat, backend);
    const after = (await fs.readdir(outputDir)).map(name => path.join(outputDir, name));
    const outputs = after.filter(pathname => !before.has(pathname)).map(pathname => path.relative(MEDIA_VAULT_ROOT, pathname));
    upsertUvrMetadata({
      relativePath: inputPath,
      processedAt: new Date().toISOString(),
      backend,
      model,
      outputFormat,
      outputs
    });
    res.json({ outputs, log: uvrLog || `UVR completed at ${new Date().toISOString()}` });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to run VR task';
    res.status(500).json({ error: message });
  }
});

const resolveSafePath = (relativePath: string) => {
  const normalized = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, '');
  const fullPath = path.resolve(MEDIA_VAULT_ROOT, normalized);
  const rootPath = path.resolve(MEDIA_VAULT_ROOT);
  if (!fullPath.startsWith(`${rootPath}${path.sep}`) && fullPath !== rootPath) {
    return null;
  }
  return fullPath;
};

const getContentType = (ext: string) => {
  const map: Record<string, string> = {
    '.mp4': 'video/mp4',
    '.mkv': 'video/x-matroska',
    '.mov': 'video/quicktime',
    '.webm': 'video/webm',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.aac': 'audio/aac',
    '.flac': 'audio/flac',
    '.m4a': 'audio/mp4',
    '.ogg': 'audio/ogg',
    '.srt': 'text/plain; charset=utf-8',
    '.vtt': 'text/vtt; charset=utf-8',
    '.ass': 'text/plain; charset=utf-8',
    '.ssa': 'text/plain; charset=utf-8'
  };
  return map[ext.toLowerCase()] ?? 'application/octet-stream';
};

app.get('/api/vault/stream', async (req, res) => {
  const relPath = typeof req.query.path === 'string' ? req.query.path : '';
  const preview = req.query.preview === '1';
  if (!relPath) {
    res.status(400).json({ error: 'Missing path' });
    return;
  }

  const fullPath = resolveSafePath(relPath);
  if (!fullPath) {
    res.status(400).json({ error: 'Invalid path' });
    return;
  }

  try {
    const stats = await fs.stat(fullPath);
    const fileSize = stats.size;
    const ext = path.extname(fullPath);
    const contentType = getContentType(ext);
    const range = req.headers.range;
    let previewEnd = fileSize - 1;
    if (preview && isAudioFile(fullPath) && fileSize > PREVIEW_MAX_BYTES) {
      let durationSeconds = 0;
      try {
        durationSeconds = await runFfprobe(fullPath);
      } catch {
        durationSeconds = 0;
      }
      if (durationSeconds > 0) {
        const ratio = Math.min(1, PREVIEW_MAX_SECONDS / durationSeconds);
        previewEnd = Math.min(fileSize - 1, Math.max(0, Math.ceil(fileSize * ratio) - 1));
      } else {
        previewEnd = Math.min(fileSize - 1, PREVIEW_MAX_BYTES - 1);
      }
    }

    if (range) {
      const match = range.match(/bytes=(\d+)-(\d*)/);
      if (!match) {
        res.status(416).end();
        return;
      }
      const start = Number(match[1]);
      let end = match[2] ? Number(match[2]) : fileSize - 1;
      if (preview) {
        if (start > previewEnd) {
          res.status(416).end();
          return;
        }
        end = Math.min(end, previewEnd);
      }
      const chunkSize = end - start + 1;
      const totalSize = preview ? previewEnd + 1 : fileSize;

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${totalSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': contentType
      });

      createReadStream(fullPath, { start, end }).pipe(res);
      return;
    }

    if (preview && previewEnd < fileSize - 1) {
      res.writeHead(200, {
        'Content-Length': previewEnd + 1,
        'Accept-Ranges': 'bytes',
        'Content-Type': contentType
      });
      createReadStream(fullPath, { start: 0, end: previewEnd }).pipe(res);
      return;
    }

    res.writeHead(200, {
      'Content-Length': fileSize,
      'Accept-Ranges': 'bytes',
      'Content-Type': contentType
    });
    createReadStream(fullPath).pipe(res);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to stream file';
    res.status(500).json({ error: message });
  }
});

app.get('/api/vault/text', async (req, res) => {
  const relPath = typeof req.query.path === 'string' ? req.query.path : '';
  if (!relPath) {
    res.status(400).json({ error: 'Missing path' });
    return;
  }

  const fullPath = resolveSafePath(relPath);
  if (!fullPath) {
    res.status(400).json({ error: 'Invalid path' });
    return;
  }

  try {
    const content = await fs.readFile(fullPath, 'utf-8');
    res.json({ content });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to read file';
    res.status(500).json({ error: message });
  }
});

const isVideoFile = (filePath: string) => VIDEO_EXT.has(path.extname(filePath).toLowerCase());
const isAudioFile = (filePath: string) => AUDIO_EXT.has(path.extname(filePath).toLowerCase());
const isSubtitleFile = (filePath: string) => SUB_EXT.has(path.extname(filePath).toLowerCase());
const isImageFile = (filePath: string) => IMAGE_EXT.has(path.extname(filePath).toLowerCase());

const getFfmpegPath = async () => {
  return await fs.access('/usr/bin/ffmpeg').then(() => '/usr/bin/ffmpeg').catch(() => 'ffmpeg');
};

const runFfmpeg = async (input: string, output: string) => new Promise<void>(async (resolve, reject) => {
  const ffmpegPath = await getFfmpegPath();
  const args = ['-y', '-ss', '00:00:01', '-i', input, '-frames:v', '1', '-q:v', '3', '-vf', 'scale=360:-1', output];
  const proc = spawn(ffmpegPath, args, { stdio: 'ignore' });
  proc.on('error', reject);
  proc.on('close', code => {
    if (code === 0) resolve();
    else reject(new Error(`ffmpeg exited with code ${code}`));
  });
});

const escapeFilterPath = (value: string) => value.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\'");

/** libass: avoid charenc on UTF-8 ASS; original_size should match PlayRes for correct placement when video is scaled. */
const buildSubtitlesVideoFilter = (subtitlePath: string, assOriginalSize?: { w: number; h: number }) => {
  const escaped = escapeFilterPath(subtitlePath);
  const lower = subtitlePath.toLowerCase();
  const isAss = lower.endsWith('.ass') || lower.endsWith('.ssa');
  if (isAss) {
    let f = `subtitles='${escaped}'`;
    if (assOriginalSize && assOriginalSize.w > 0 && assOriginalSize.h > 0) {
      f += `:original_size=${assOriginalSize.w}x${assOriginalSize.h}`;
    }
    return f;
  }
  return `subtitles='${escaped}':charenc=UTF-8`;
};

/** Solid black JPEG (320×240) when ffmpeg cannot produce a preview frame. */
const RENDER_PREVIEW_BLACK_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAgAAAQABAAD//gAQTGF2YzU4LjU0LjEwMAD/2wBDAAg+Pkk+SVVVVVVVVWRdZGhoaGRkZGRoaGhwcHCDg4NwcHBoaHBwfHyDg4+Tj4eHg4eTk5ubm7q6srLZ2eD/////xABLAAEBAAAAAAAAAAAAAAAAAAAACAEBAAAAAAAAAAAAAAAAAAAAABABAAAAAAAAAAAAAAAAAAAAABEBAAAAAAAAAAAAAAAAAAAAAP/AABEIAPABQAMBIgACEQADEQD/2gAMAwEAAhEDEQA/AJ/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB//9k=',
  'base64'
);

type BlurRegionEffect = {
  type: 'blur_region';
  left: number;
  right: number;
  top: number;
  bottom: number;
  sigma: number;
  /** 0 = hard edge; 1–20 = feather width as % of half the shorter crop side. */
  feather: number;
};

const clampRender = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const BLUR_FEATHER_MAX = 10;

const parseBlurRegionEffects = (raw: unknown): BlurRegionEffect[] => {
  if (!Array.isArray(raw)) return [];
  const out: BlurRegionEffect[] = [];
  raw.forEach(item => {
    if (!item || typeof item !== 'object') return;
    const o = item as Record<string, unknown>;
    if (o.type !== 'blur_region') return;
    const sigma = o.sigma === undefined || o.sigma === null ? 15 : clampRender(Number(o.sigma), 0.5, 80);
    if (!Number.isFinite(sigma)) return;
    const feather = o.feather === undefined || o.feather === null ? 0 : clampRender(Number(o.feather), 0, BLUR_FEATHER_MAX);
    if (!Number.isFinite(feather)) return;

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
      left = clampRender(Number(o.left), 0, 100);
      right = clampRender(Number(o.right), 0, 100);
      top = clampRender(Number(o.top), 0, 100);
      bottom = clampRender(Number(o.bottom), 0, 100);
    } else {
      const x = clampRender(Number(o.x), 0, 100);
      const y = clampRender(Number(o.y), 0, 100);
      const w = clampRender(Number(o.w), 0, 100);
      const h = clampRender(Number(o.h), 0, 100);
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(w) || !Number.isFinite(h)) return;
      if (w <= 0 || h <= 0) return;
      left = x;
      top = y;
      right = clampRender(100 - x - w, 0, 100);
      bottom = clampRender(100 - y - h, 0, 100);
    }

    if (!Number.isFinite(left) || !Number.isFinite(right) || !Number.isFinite(top) || !Number.isFinite(bottom)) return;
    if (left + right >= 100 || top + bottom >= 100) return;
    out.push({ type: 'blur_region', left, right, top, bottom, sigma, feather });
  });
  return out;
};

/** Distance-to-edge mask (0–255) for feathered blur; d = min dist to crop border in px. */
const blurFeatherGeqLum = (featherPct: number) => {
  const f = Math.max(0, Math.min(BLUR_FEATHER_MAX, Math.round(featherPct)));
  if (f <= 0) return '';
  /**
   * ffmpeg 4.x geq splits `lum` on commas and treats `:` as filter opt separator — use only + - * / abs ().
   * Use W/H (not w/h): lowercase w is not a valid width variable in this evaluator.
   * min(a,b)=(a+b-abs(a-b))/2; ramp to 255 past edge via min(1,d/edge)=(1+t-abs(1-t))/2, t=d/(edge+eps).
   */
  const edge = `${f}*sqrt(W*W+H*H)/200`;
  const dx = '(W-1-abs(2*X-(W-1)))/2';
  const dy = '(H-1-abs(2*Y-(H-1)))/2';
  const d = `((${dx})+(${dy})-abs((${dx})-(${dy})))/2`;
  const t = `(${d})/((${edge})+0.001)`;
  return `255*(1+(${t})-abs(1-(${t})))/2`;
};

/** Inset % from each edge → crop/overlay; order: effects then subtitles then scale. */
const buildRenderPreviewFilterComplex = (
  subtitlePath: string | undefined,
  effects: BlurRegionEffect[],
  assOriginalSize?: { w: number; h: number }
) => {
  const segments: string[] = [];
  let current = '0:v';

  effects.forEach((e, index) => {
    const x = e.left;
    const y = e.top;
    const w = 100 - e.left - e.right;
    const h = 100 - e.top - e.bottom;
    const main = `mfx${index}`;
    const tmp = `tfx${index}`;
    const out = `vfx${index}`;
    const sigma = e.sigma;
    const feather = e.feather > 0 ? e.feather : 0;
    const lumExpr = blurFeatherGeqLum(feather);

    let chain: string;
    if (!lumExpr) {
      const bl = `bfx${index}`;
      chain =
        `[${current}]split=2[${main}][${tmp}];` +
        `[${tmp}]crop=iw*${w}/100:ih*${h}/100:iw*${x}/100:ih*${y}/100,gblur=sigma=${sigma}[${bl}];` +
        `[${main}][${bl}]overlay=W*${x}/100:H*${y}/100[${out}]`;
    } else {
      const co = `corig${index}`;
      const cb = `cblur${index}`;
      const gb = `gbfx${index}`;
      const mk = `msk${index}`;
      const pa = `pafx${index}`;
      const prgb = `prgb${index}`;
      const mr = `mrgb${index}`;
      const vor = `vovl${index}`;
      /**
       * Blur must stay RGB before alphamerge: yuv420p + alphamerge loses chroma (B&W preview).
       * bgra → alphamerge → rgba keeps patch color; main must be rgb24 before overlay with rgba,
       * then yuv420p — overlaying RGBA onto YUV main still drops chroma in some ffmpeg paths.
       */
      chain =
        `[${current}]split=2[${main}][${tmp}];` +
        `[${main}]format=rgb24[${mr}];` +
        `[${tmp}]crop=iw*${w}/100:ih*${h}/100:iw*${x}/100:ih*${y}/100,split=2[${co}][${cb}];` +
        `[${cb}]gblur=sigma=${sigma},format=bgra[${gb}];` +
        `[${co}]format=gray,geq=lum='${lumExpr}'[${mk}];` +
        `[${gb}][${mk}]alphamerge[${pa}];` +
        `[${pa}]format=rgba[${prgb}];` +
        `[${mr}][${prgb}]overlay=W*${x}/100:H*${y}/100:format=auto[${vor}];` +
        `[${vor}]format=yuv420p[${out}]`;
    }
    segments.push(chain);
    current = out;
  });

  if (subtitlePath) {
    segments.push(`[${current}]${buildSubtitlesVideoFilter(subtitlePath, assOriginalSize)}[subout]`);
    current = 'subout';
  }

  segments.push(`[${current}]scale=720:-1[out]`);

  return segments.join(';');
};

const runFfmpegFrameAt = async (
  input: string,
  output: string,
  seconds: number,
  subtitlePath?: string,
  effects?: BlurRegionEffect[],
  assOriginalSize?: { w: number; h: number }
) =>
  new Promise<void>(async (resolve, reject) => {
    const ffmpegPath = await getFfmpegPath();
    const safeSeconds = Math.max(0, seconds);
    const blurEffects = effects ?? [];
    const useComplex = blurEffects.length > 0;

    /**
     * -ss before -i is fast (seek) but breaks subtitles= / libass: frame PTS no longer matches SRT/ASS times.
     * With any subtitle burn, seek after -i so decoded timestamps align with cue times (slower on long files).
     */
    const burnSubs = Boolean(subtitlePath);
    const args: string[] = ['-y'];
    if (!burnSubs) {
      args.push('-ss', safeSeconds.toFixed(3));
    }
    args.push('-i', input);
    if (burnSubs) {
      args.push('-ss', safeSeconds.toFixed(3));
    }
    args.push('-frames:v', '1', '-q:v', '3');

    if (useComplex) {
      args.push(
        '-filter_complex',
        buildRenderPreviewFilterComplex(subtitlePath, blurEffects, assOriginalSize),
        '-map',
        '[out]'
      );
    } else {
      const filters: string[] = [];
      if (subtitlePath) {
        filters.push(buildSubtitlesVideoFilter(subtitlePath, assOriginalSize));
      }
      filters.push('scale=720:-1');
      args.push('-vf', filters.join(','));
    }
    args.push(output);

    const proc = spawn(ffmpegPath, args, { stdio: 'ignore' });
    proc.on('error', reject);
    proc.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}`));
    });
  });

app.get('/api/vault/thumb', async (req, res) => {
  const relPath = typeof req.query.path === 'string' ? req.query.path : '';
  if (!relPath) {
    res.status(400).json({ error: 'Missing path' });
    return;
  }

  const fullPath = resolveSafePath(relPath);
  if (!fullPath || !isVideoFile(fullPath)) {
    res.status(400).json({ error: 'Invalid video path' });
    return;
  }

  try {
    const stats = await fs.stat(fullPath);
    const hash = crypto.createHash('sha1').update(`${relPath}:${stats.mtimeMs}`).digest('hex');
    const thumbPath = path.join(THUMB_CACHE_DIR, `${hash}.jpg`);

    try {
      await fs.access(thumbPath);
    } catch {
      await runFfmpeg(fullPath, thumbPath);
    }

    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    createReadStream(thumbPath).pipe(res);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to generate thumbnail';
    res.status(500).json({ error: message });
  }
});

app.get('/api/render-preview', async (req, res) => {
  const videoRel = typeof req.query.videoPath === 'string' ? req.query.videoPath : '';
  const subtitleRel = typeof req.query.subtitlePath === 'string' ? req.query.subtitlePath : '';
  const effectsJson = typeof req.query.effects === 'string' ? req.query.effects : '';
  const at = typeof req.query.at === 'string' ? Number(req.query.at) : 0;
  if (!videoRel) {
    res.status(400).json({ error: 'Missing videoPath' });
    return;
  }

  const videoPath = resolveSafePath(videoRel);
  if (!videoPath || !isVideoFile(videoPath)) {
    res.status(400).json({ error: 'Invalid video path' });
    return;
  }

  let subtitlePath: string | undefined;
  if (subtitleRel) {
    const resolved = resolveSafePath(subtitleRel);
    if (!resolved || !isSubtitleFile(resolved)) {
      res.status(400).json({ error: 'Invalid subtitle path' });
      return;
    }
    subtitlePath = resolved;
  }

  let parsedEffects: BlurRegionEffect[] = [];
  if (effectsJson) {
    try {
      const raw = JSON.parse(effectsJson) as unknown;
      parsedEffects = parseBlurRegionEffects(raw);
    } catch {
      res.status(400).json({ error: 'Invalid effects JSON' });
      return;
    }
  }

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'render-preview-'));
  const outputPath = path.join(tmpDir, 'frame.jpg');
  const subtitleStyleJson = typeof req.query.subtitleStyle === 'string' ? req.query.subtitleStyle : '';
  let previewBuf: Buffer = RENDER_PREVIEW_BLACK_JPEG;
  try {
    let atSeconds = Number.isFinite(at) ? Math.max(0, at) : 0;
    /** Timeline có thể dài hơn video (audio/sub dài hơn); seek quá cuối file → ffmpeg không tạo frame. */
    try {
      const stats = await fs.stat(videoPath);
      let videoDur = (await getDurationSeconds(videoPath, 'video', stats)) ?? 0;
      if (videoDur <= 0) {
        videoDur = await runFfprobe(videoPath).catch(() => 0);
      }
      if (videoDur > 0) {
        const end = Math.max(0, videoDur - 0.05);
        atSeconds = Math.min(atSeconds, end);
      }
    } catch {
      /* giữ atSeconds */
    }

    let effectiveSubtitlePath = subtitlePath;
    let assOriginalSize: { w: number; h: number } | undefined;
    if (subtitlePath) {
      let stylePayload: unknown = {};
      if (subtitleStyleJson.trim()) {
        try {
          stylePayload = JSON.parse(subtitleStyleJson) as unknown;
        } catch {
          res.status(400).json({ error: 'Invalid subtitleStyle JSON' });
          return;
        }
      }
      const style = parseAssRenderStyle(stylePayload);
      const assOut = path.join(tmpDir, 'render-burn.ass');
      try {
        await writeStyledAssFile(subtitlePath, style, assOut);
        effectiveSubtitlePath = assOut;
        assOriginalSize = { w: style.playResX, h: style.playResY };
      } catch {
        /** Không parse được cue (vd. .sub) → dùng file gốc. */
        effectiveSubtitlePath = subtitlePath;
      }
    }

    await runFfmpegFrameAt(videoPath, outputPath, atSeconds, effectiveSubtitlePath, parsedEffects, assOriginalSize);
    previewBuf = await fs.readFile(outputPath);
  } catch {
    previewBuf = RENDER_PREVIEW_BLACK_JPEG;
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => null);
  }

  res.setHeader('Content-Type', 'image/jpeg');
  res.setHeader('Cache-Control', 'no-store');
  res.send(previewBuf);
});

app.listen(PORT, () => {
  console.log(`Media backend running on http://localhost:${PORT}`);
});
