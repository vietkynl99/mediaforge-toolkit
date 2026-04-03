import 'dotenv/config';
import express from 'express';
import fs from 'fs/promises';
import { createReadStream } from 'fs';
import { spawn } from 'child_process';
import crypto from 'crypto';
import path from 'path';
import initSqlJs from 'sql.js';
import { MEDIA_VAULT_ROOT, KNOWN_SUBDIRS, OUTPUT_DIR_NAMES, THUMB_CACHE_DIR, UVR_CLI_PATH, UVR_OUTPUT_DIRNAME } from './constants.js';
import { ttsRouter } from './tts.js';

type VaultFileDTO = {
  name: string;
  relativePath: string;
  sizeBytes: number;
  modifiedAt: string;
  type: 'video' | 'audio' | 'subtitle' | 'output' | 'other';
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

const VIDEO_EXT = new Set(['.mp4', '.mkv', '.mov', '.avi', '.webm', '.m4v']);
const AUDIO_EXT = new Set(['.wav', '.mp3', '.aac', '.flac', '.ogg', '.m4a']);
const SUB_EXT = new Set(['.srt', '.vtt', '.ass', '.ssa', '.sub']);

const app = express();
const PORT = Number(process.env.VAULT_PORT ?? 3001);
app.use(express.json({ limit: '2mb' }));
app.use('/api/tts', ttsRouter);

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
    log TEXT
  )`
);

db.run(
  `CREATE TABLE IF NOT EXISTS file_uvr (
    relative_path TEXT PRIMARY KEY,
    processed_at TEXT NOT NULL,
    backend TEXT,
    model TEXT,
    output_format TEXT,
    output_paths_json TEXT,
    last_job_id TEXT
  )`
);

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
};

const jobs: JobRecord[] = [];
const jobQueue: string[] = [];
let activeJobId: string | null = null;
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
      tasks_json, created_at, started_at, finished_at, duration_ms, error, log
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      job.log ?? null
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
  db.run(
    `INSERT OR REPLACE INTO file_uvr (
      relative_path, processed_at, backend, model, output_format, output_paths_json, last_job_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      payload.relativePath,
      payload.processedAt,
      payload.backend ?? null,
      payload.model ?? null,
      payload.outputFormat ?? null,
      payload.outputs ? JSON.stringify(payload.outputs) : null,
      payload.jobId ?? null
    ]
  );
  schedulePersistDb();
};

const loadUvrMetadataMap = () => {
  const map = new Map<string, VaultFileDTO['uvr']>();
  try {
    const result = db.exec(
      `SELECT relative_path, processed_at, backend, model, output_format, output_paths_json
       FROM file_uvr`
    );
    const rows = result[0]?.values ?? [];
    rows.forEach((row: any[]) => {
      const [relativePath, processedAt, backend, model, outputFormat, outputPathsJson] = row;
      let outputs: string[] | undefined;
      try {
        outputs = outputPathsJson ? JSON.parse(outputPathsJson) : undefined;
      } catch {
        outputs = undefined;
      }
      map.set(relativePath, {
        processedAt,
        backend: backend ?? undefined,
        model: model ?? undefined,
        outputFormat: outputFormat ?? undefined,
        outputs
      });
    });
  } catch {
    return map;
  }
  return map;
};

const loadJobsFromDb = () => {
  try {
    const result = db.exec(
      `SELECT id, name, project_name, file_name, file_size, status, progress,
        tasks_json, created_at, started_at, finished_at, duration_ms, error, log
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
        log
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

const processNextJob = async () => {
  if (activeJobId || jobQueue.length === 0) return;
  const nextId = jobQueue.shift();
  if (!nextId) return;
  const job = getJobById(nextId);
  if (!job) return;

  activeJobId = job.id;
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
      if (outputs.length) {
        appendJobLog(job, `Outputs:\n${outputs.map(item => `- ${item}`).join('\n')}\n`);
      }
      const subsCandidates = downloadResult.subsFiles.map(name => path.join(sourceDir, name)).filter(pathname => isSubtitleFile(pathname));
      const mediaCandidates = downloadResult.mediaFiles.map(name => path.join(sourceDir, name)).filter(pathname => isVideoFile(pathname) || isAudioFile(pathname));
      const hasVideoFile = mediaCandidates.some(pathname => isVideoFile(pathname));
      const hasAudioFile = mediaCandidates.some(pathname => isAudioFile(pathname));
      const hasMuxedVideo = hasVideoFile;
      const hasVideo = hasVideoFile;
      const hasAudio = hasAudioFile || hasMuxedVideo;
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
        (job as any).__inputPath = selectedPath;
        (job as any).__inputRelativePath = path.relative(MEDIA_VAULT_ROOT, selectedPath);
          scheduleJobPersist(job);
        }
      }
      if (downloadSubsTask) {
        if (subsCandidates.length) {
          markDone(downloadSubsTask);
        } else {
          markError(downloadSubsTask);
        }
      }
      if (downloadVideoTask) {
        if (hasVideo) {
          markDone(downloadVideoTask);
        } else {
          markError(downloadVideoTask);
        }
      }
      if (downloadAudioTask) {
        if (hasAudio) {
          markDone(downloadAudioTask);
        } else {
          markError(downloadAudioTask);
        }
      }
      if (downloadMergeTask) {
        if (hasVideo && hasAudio) {
          markDone(downloadMergeTask);
        } else {
          markError(downloadMergeTask);
        }
      }
      if (!hasVideo || !hasAudio) {
        throw new Error('Download did not produce required media outputs');
      }
      job.progress = Math.round((job.tasks.filter(task => task.status === 'done').length / job.tasks.length) * 100);
      scheduleJobPersist(job);
    }
    const uvrTask = job.tasks.find(task => task.type === 'uvr');
    if (uvrTask) {
      if (!(job as any).__inputPath) {
        throw new Error('Missing input after download');
      }
      uvrTask.status = 'active';
      const abortController = new AbortController();
      (job as any).__abortController = abortController;
      const outputDir = (job as any).__outputDir as string;
      const before = new Set<string>((await fs.readdir(outputDir)).map(name => path.join(outputDir, name)));
      const uvrLog = await runUvrTask(
        (job as any).__inputPath,
        outputDir,
        (job as any).__model,
        (job as any).__outputFormat,
        (job as any).__backend ?? 'vr',
        (chunk) => {
          appendJobLog(job, chunk);
        },
        { signal: abortController.signal, onStart: proc => ((job as any).__activeProcess = proc) }
      );
      const resolvedLog = job.log && job.log.trim().length > 0 ? job.log : uvrLog;
      job.log = resolvedLog || `UVR completed at ${new Date().toISOString()}`;
      const after = (await fs.readdir(outputDir)).map(name => path.join(outputDir, name));
      const outputs = after
        .filter(pathname => !before.has(pathname))
        .map(pathname => path.relative(MEDIA_VAULT_ROOT, pathname));
      if ((job as any).__inputRelativePath) {
        upsertUvrMetadata({
          relativePath: (job as any).__inputRelativePath,
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
    activeJobId = null;
    setImmediate(processNextJob);
  }
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
  uvrMeta?: Map<string, VaultFileDTO['uvr']>
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
      uvr: uvrMeta?.get(relativePath)
    });
  }

  return files;
};

const readVault = async (): Promise<VaultFolderDTO[]> => {
  const rootEntries = await fs.readdir(MEDIA_VAULT_ROOT, { withFileTypes: true });
  const folders: VaultFolderDTO[] = [];
  const uvrMeta = loadUvrMetadataMap();

  for (const entry of rootEntries) {
    if (!entry.isDirectory()) continue;
    const folderPath = path.join(MEDIA_VAULT_ROOT, entry.name);
    const subEntries = await fs.readdir(folderPath, { withFileTypes: true });
    const sourceDir = subEntries.find(item => item.isDirectory() && item.name.toLowerCase() === 'source');
    if (!sourceDir) {
      continue;
    }

    const sourcePath = path.join(folderPath, sourceDir.name);
    const folderFiles = await readFilesFromDir(sourcePath, MEDIA_VAULT_ROOT, false, uvrMeta);

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
    res.status(400).json({ error: 'Invalid projectName' });
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
  const model = typeof req.body?.model === 'string' ? req.body.model : 'MGM_MAIN_v4.pth';
  const backend = typeof req.body?.backend === 'string' ? req.body.backend : 'vr';
  const outputFormat = typeof req.body?.outputFormat === 'string' ? req.body.outputFormat : 'Mp3';

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
        if (alreadyHasOutputs) {
          res.json({ ok: true, skipped: true, message: 'Project already exists. Skipping download.' });
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
        createdAt
      };

      (job as any).__downloadUrl = downloadUrl;
      (job as any).__downloadSourceDir = sourceDir;
      (job as any).__downloadCookiesFile = cookiesFile;
      (job as any).__downloadNoPlaylist = downloadNoPlaylist;
      (job as any).__downloadSubLangs = downloadSubLangs;
      (job as any).__outputDir = outputDir;
      (job as any).__model = model;
      (job as any).__outputFormat = outputFormat;
      (job as any).__backend = backend;
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

      job = {
        id: jobId,
        name: pipelineName,
        projectName,
        fileName,
        fileSize,
        status: 'queued',
        progress: 0,
        tasks,
        createdAt
      };

      (job as any).__inputPath = fullPath;
      (job as any).__inputRelativePath = inputPath;
      (job as any).__outputDir = outputDir;
      (job as any).__model = model;
      (job as any).__outputFormat = outputFormat;
      (job as any).__backend = backend;
    }

    jobs.unshift(job);
    jobQueue.push(jobId);
    scheduleJobPersist(job);
    processNextJob();

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
  onData?: (chunk: string) => void,
  options?: { signal?: AbortSignal; onStart?: (proc: ReturnType<typeof spawn>) => void }
) => {
  const normalizedLangs = subLangs?.trim();
  const wantsSubs = Boolean(normalizedLangs);
  const baseArgs = [
    ...(noPlaylist ? ['--no-playlist'] : []),
    '--no-warnings',
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
  const subsLog = await runWithArgs(subsArgs, 'subs-only');
  const afterSubs = await listFiles();
  const subsFiles = afterSubs.filter(name => !beforeSubs.has(name));

  const beforeMedia = new Set<string>(afterSubs);
  const mediaLog = await runWithArgs(mediaArgs, 'media');
  const afterMedia = await listFiles();
  const mediaFiles = afterMedia.filter(name => !beforeMedia.has(name));

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

    if (range) {
      const match = range.match(/bytes=(\d+)-(\d*)/);
      if (!match) {
        res.status(416).end();
        return;
      }
      const start = Number(match[1]);
      const end = match[2] ? Number(match[2]) : fileSize - 1;
      const chunkSize = end - start + 1;

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': contentType
      });

      createReadStream(fullPath, { start, end }).pipe(res);
      return;
    }

    res.writeHead(200, {
      'Content-Length': fileSize,
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

const runFfmpeg = (input: string, output: string) => new Promise<void>((resolve, reject) => {
  const args = ['-y', '-ss', '00:00:01', '-i', input, '-frames:v', '1', '-q:v', '3', '-vf', 'scale=360:-1', output];
  const proc = spawn('ffmpeg', args, { stdio: 'ignore' });
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

app.listen(PORT, () => {
  console.log(`Media Vault backend running on http://localhost:${PORT}`);
});
