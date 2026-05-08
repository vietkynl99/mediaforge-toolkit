import 'dotenv/config';
import express from 'express';
import fs from 'fs/promises';
import { appendFile } from 'fs/promises';
import { createReadStream, readFileSync, existsSync } from 'fs';
import { spawn } from 'child_process';
import crypto from 'crypto';
import os from 'os';
import path from 'path';
import { MEDIA_VAULT_ROOT, KNOWN_SUBDIRS, OUTPUT_DIR_NAMES, THUMB_CACHE_DIR, UVR_CLI_PATH, UVR_OUTPUT_DIRNAME } from './constants.js';
import { ttsRouter } from './tts.js';
import { parseAssCues, parseSrtVttCues, parseSktProjectCues, type SubtitleCue } from './subtitleCues.js';
import {
  DEFAULT_TTS_VOICE,
  DEFAULT_TTS_OUTPUT_EXT,
  TTS_CUE_OUTPUT_EXT,
  TTS_INTERNAL_SAMPLE_RATE,
  TTS_INTERNAL_CHANNELS,
  TTS_PITCH_BASE_HZ,
  TTS_CUE_CACHE_DIRNAME,
  TTS_CUE_CONCURRENCY,
  TTS_MIX_SEGMENT_SECONDS,
  TTS_MP3_BITRATE_KBPS,
  TTS_DEBUG_TIMING,
  EDGE_TTS_MAX_RETRIES,
  EDGE_TTS_RETRY_DELAY_MS,
  formatTtsRate,
  formatTtsPitch,
  sanitizeRateFactor,
  sanitizePitchSemitones,
  normalizeTtsOutputSettings,
  buildTtsOutputSignature,
} from './ttsUtils.js';
import { buildAssDocument, parseAssRenderStyle, writeStyledAssFile } from './subtitleAss.js';
import { RenderConfigV2, RenderItemV2, RenderEffectV2, BlurRegionEffect } from '../shared/types.js';
import { 
  initConfigManager, 
  getConfigManager, 
  initResourceManager, 
  getResourceManager,
  SystemConfig,
  DEFAULT_SYSTEM_CONFIG 
} from './job/index.js';
import { 
  initDatabase, 
  getDb, 
  persistDb, 
  schedulePersistDb,
  createAuthRouter,
  authMiddleware,
  getSessionFromRequest,
  setSessionCookie,
  clearSessionCookie,
  normalizeUsername,
  isValidUsername,
  isValidPassword,
  hashPassword,
  verifyPassword,
  getCpuUsage,
  getMemoryUsage,
  getCpuCount,
  getServerStats,
  type AuthSession
} from './core/index.js';
import {
  ensureCircleMaskPgm,
  ensureFeatherMaskPgm,
  measureAudioLufs,
  escapeFilterPath,
  clampRender,
  parseBlurRegionEffects,
  summarizeRenderConfigForDebug,
  BLUR_FEATHER_MAX,
  STATIC_MASK_LOOP_FILTER,
  parseResolution,
  resolveRenderInputPath
} from './services/render.js';
import {
  runFfprobe,
  runFfprobeSampleRate,
  runFfprobeStreamSamples,
  runFfprobeStartTime
} from './services/ffprobe.js';
import {
  type VaultFileDTO,
  type VaultFolderDTO,
  VIDEO_EXT,
  AUDIO_EXT,
  SUB_EXT,
  IMAGE_EXT,
  detectType,
  parseTimeToSeconds,
  parseSubtitleDuration,
  getDurationSeconds,
  buildUvrOutputMap,
  buildTtsOutputMap,
  readProjectTtsMeta,
  readProjectUvrMeta,
  readFilesFromDir,
  isVideoFile,
  isAudioFile,
  isSubtitleFile,
  isImageFile,
  resolveSafePath,
  getContentType
} from './services/vault.js';
import {
  buildRenderV2FilterGraph,
  checkCopyPathEligibility,
  buildRenderV2FfmpegArgs,
  buildRenderV2Signature,
  buildRenderInputFingerprints,
  isReusableRenderSegment,
  runFfmpegLoggedCommand,
  escapeConcatFilePath,
  parseFfmpegProgressSeconds,
  buildSubtitlesVideoFilter,
  formatArg,
  type BuildFilterGraphOptions,
  type FilterGraphResult,
  type CopyPathResult
} from './services/render-v2.js';

// Wrapper for resolveSafePath with MEDIA_VAULT_ROOT
const safeResolvePath = (relativePath: string) => resolveSafePath(relativePath, MEDIA_VAULT_ROOT);

type ProjectConfig = {
  renderV2?: {
    ffmpegThreads?: number;
  };
};

type ProjectMeta = {
  status?: string;
};

const PROJECT_META_FILE = 'project-meta.json';

const readProjectMeta = async (folderPath: string): Promise<ProjectMeta> => {
  try {
    const metaPath = path.join(folderPath, PROJECT_META_FILE);
    const content = await fs.readFile(metaPath, 'utf-8');
    return JSON.parse(content) as ProjectMeta;
  } catch {
    return {};
  }
};

const writeProjectMeta = async (folderPath: string, meta: ProjectMeta): Promise<void> => {
  const metaPath = path.join(folderPath, PROJECT_META_FILE);
  await fs.writeFile(metaPath, JSON.stringify(meta, null, 2));
};

// Download state management for resumable downloads
type DownloadState = {
  url: string;
  downloadMode: 'all' | 'subs' | 'media';
  subLangs?: string;
  // Track completion status of each phase
  subsCompleted: boolean;       // Phase 1: subtitle download completed
  subsFiles: string[];          // Subtitle files copied to sourceDir
  mediaCompleted: boolean;      // Phase 4: merge completed (final video)
  mediaFile?: string;           // Final merged video file copied to sourceDir
  lastUpdated: string;
};

const DOWNLOAD_STATE_FILE = 'download-state.json';

const readDownloadState = async (downloadDir: string): Promise<DownloadState | null> => {
  try {
    const statePath = path.join(downloadDir, DOWNLOAD_STATE_FILE);
    const content = await fs.readFile(statePath, 'utf-8');
    return JSON.parse(content) as DownloadState;
  } catch {
    return null;
  }
};

const writeDownloadState = async (downloadDir: string, state: DownloadState): Promise<void> => {
  const statePath = path.join(downloadDir, DOWNLOAD_STATE_FILE);
  state.lastUpdated = new Date().toISOString();
  await fs.writeFile(statePath, JSON.stringify(state, null, 2));
};

// Check if a file exists in sourceDir
const fileExistsInSource = async (sourceDir: string, filename: string): Promise<boolean> => {
  try {
    const filePath = path.join(sourceDir, filename);
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
};

// Check if all subtitle files from state exist in sourceDir
const subsExistInSource = async (sourceDir: string, subsFiles: string[]): Promise<boolean> => {
  if (!subsFiles || subsFiles.length === 0) return false;
  for (const f of subsFiles) {
    if (!(await fileExistsInSource(sourceDir, f))) return false;
  }
  return true;
};

// Move files from downloadDir to sourceDir
const moveFilesToSource = async (downloadDir: string, sourceDir: string, filenames: string[]): Promise<string[]> => {
  const moved: string[] = [];
  for (const name of filenames) {
    const srcPath = path.join(downloadDir, name);
    const destPath = path.join(sourceDir, name);
    try {
      await fs.rename(srcPath, destPath);
      moved.push(name);
    } catch {
      // Ignore errors for individual files
    }
  }
  return moved;
};

// UVR state for tracking progress and outputs
type UvrState = {
  inputPath: string;           // Relative path of input file
  inputHash?: string;           // Hash of input file for validation
  backend: string;
  model: string;
  outputFormat: string;
  completed: boolean;           // UVR processing completed
  outputs: string[];            // Output files moved to uvr-output
  lastUpdated: string;
};

const UVR_STATE_FILE = 'uvr-state.json';

const readUvrState = async (uvrDir: string): Promise<UvrState | null> => {
  try {
    const statePath = path.join(uvrDir, UVR_STATE_FILE);
    const content = await fs.readFile(statePath, 'utf-8');
    return JSON.parse(content) as UvrState;
  } catch {
    return null;
  }
};

const writeUvrState = async (uvrDir: string, state: UvrState): Promise<void> => {
  const statePath = path.join(uvrDir, UVR_STATE_FILE);
  state.lastUpdated = new Date().toISOString();
  await fs.writeFile(statePath, JSON.stringify(state, null, 2));
};

// Move UVR outputs from runtime dir to output dir
const moveUvrOutputs = async (runtimeDir: string, outputDir: string, baseName: string): Promise<string[]> => {
  const moved: string[] = [];
  try {
    const files = await fs.readdir(runtimeDir).catch(() => []);
    for (const name of files) {
      // Skip state file and split folders
      if (name === UVR_STATE_FILE || name.startsWith('uvr_cli_split_')) continue;
      // Only move output files (vocal, instrument, etc.)
      const nameLower = name.toLowerCase();
      if (nameLower.includes('(vocals)') || nameLower.includes('(instrumental)') ||
          nameLower.includes('[vr]') || nameLower.includes(baseName.toLowerCase())) {
        const srcPath = path.join(runtimeDir, name);
        const destPath = path.join(outputDir, name);
        const stat = await fs.stat(srcPath).catch(() => null);
        if (stat?.isFile()) {
          try {
            await fs.rename(srcPath, destPath);
            moved.push(name);
          } catch {
            // Ignore errors for individual files
          }
        }
      }
    }
  } catch (err) {
    console.error('Failed to move UVR outputs:', err);
  }
  return moved;
};

const PREVIEW_MAX_BYTES = 20 * 1024 * 1024;
const PREVIEW_MAX_SECONDS = 60;
const loadProjectConfig = (): ProjectConfig => {
  const configPath = path.join(process.cwd(), 'config.json');
  try {
    const raw = readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as ProjectConfig) : {};
  } catch {
    return {};
  }
};
const PROJECT_CONFIG = loadProjectConfig();
const EDGE_TTS_CMD = process.env.EDGE_TTS_CMD?.trim() || 'edge-tts';
const RENDER_V2_CODEC = process.env.RENDER_V2_CODEC?.trim() || 'h264';
const RENDER_V2_PRESET = process.env.RENDER_V2_PRESET?.trim() || 'fast';
const RENDER_V2_CRF = Number(process.env.RENDER_V2_CRF ?? 21);
const RENDER_V2_GOP = Number(process.env.RENDER_V2_GOP ?? 0);
const RENDER_V2_TUNE = process.env.RENDER_V2_TUNE?.trim() || '';
const RENDER_V2_CACHE_DIRNAME = '.mediaforge/render-v2-cache';
const RENDER_V2_SEGMENT_SECONDS = Math.max(
  5,
  Number.isFinite(Number(process.env.RENDER_V2_SEGMENT_SECONDS))
    ? Number(process.env.RENDER_V2_SEGMENT_SECONDS)
    : 60
);
// UVR chunk size in seconds for splitting long audio files
// Smaller chunks = less memory per chunk but more processing overhead
// Default: 600 seconds (10 minutes) - good balance for most cases
const UVR_MAX_CHUNK_SECONDS = Math.max(
  60,
  Number.isFinite(Number(process.env.UVR_MAX_CHUNK_SECONDS))
    ? Number(process.env.UVR_MAX_CHUNK_SECONDS)
    : 600
);
const RENDER_V2_FFMPEG_THREADS = (() => {
  const valueFromConfig = Number(PROJECT_CONFIG.renderV2?.ffmpegThreads);
  const valueFromEnv = Number(process.env.RENDER_V2_FFMPEG_THREADS);
  const value = Number.isFinite(valueFromConfig) ? valueFromConfig : valueFromEnv;
  if (!Number.isFinite(value)) return null;
  const normalized = Math.floor(value);
  return normalized >= 1 ? normalized : null;
})();
// Maximum number of segments rendered in parallel. Default 2; set
// RENDER_V2_PARALLEL_SEGMENTS=1 to revert to sequential (useful for profiling
// or on memory-constrained servers). Each parallel segment spawns its own
// FFmpeg process, so values above the CPU core count are counterproductive.
const RENDER_V2_PARALLEL_SEGMENTS = Math.max(
  1,
  Number.isFinite(Number(process.env.RENDER_V2_PARALLEL_SEGMENTS))
    ? Number(process.env.RENDER_V2_PARALLEL_SEGMENTS)
    : 2
);
const FONT_LIST_CACHE_MS = 5 * 60 * 1000;

const app = express();
const PORT = Number(process.env.VAULT_PORT ?? 3001);
const REGISTER_MODE =
  ['1', 'true', 'yes', 'on'].includes((process.env.REGISTER_MODE ?? '').toLowerCase());
app.use(express.json({ limit: '2mb' }));

// Auth middleware
app.use('/api', authMiddleware);

// Auth routes
app.use('/api', createAuthRouter(REGISTER_MODE));

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

// Initialize database
await initDatabase();
const db = getDb();

// Initialize job system
const configManager = initConfigManager(db, persistDb);
let systemConfig: SystemConfig = DEFAULT_SYSTEM_CONFIG;

(async () => {
  try {
    systemConfig = await configManager.load();
    initResourceManager(systemConfig);
    console.log('Job system initialized with system config');
  } catch (err) {
    console.error('Failed to initialize job system:', err);
    initResourceManager(DEFAULT_SYSTEM_CONFIG);
  }
})();

type JobStatus = 'queued' | 'processing' | 'stopping' | 'awaiting_input' | 'completed' | 'failed' | 'cancelled';
type JobTaskStatus = 'pending' | 'active' | 'done' | 'error';
type JobTask = { id: string; type: string; name: string; status: JobTaskStatus; progress: number; processed?: number; total?: number };
type JobRecord = {
  id: string;
  name: string;
  projectName?: string;
  fileName: string;
  fileSize: string;
  status: JobStatus;
  progress: number;
  eta?: string;
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
const JOB_LOGS_DIR = path.join(process.cwd(), 'server', 'data', 'logs');
const jobPersistTimers = new Map<string, NodeJS.Timeout>();
const STATS_CACHE_MIN_INTERVAL_MS = 5000; // 5 seconds
let statsCache: { data: any; timestamp: number } | null = null;

const formatIdRange = (ids: any[] | any): string => {
  if (!Array.isArray(ids) || ids.length === 0) return String(ids || '');
  const sortedIds = ids
    .map(id => typeof id === 'string' ? parseInt(id, 10) : Number(id))
    .filter(id => !isNaN(id))
    .sort((a, b) => a - b);
  
  if (sortedIds.length === 0) return JSON.stringify(ids);

  const ranges: string[] = [];
  let start = sortedIds[0];
  let end = start;

  for (let i = 1; i <= sortedIds.length; i++) {
    if (i < sortedIds.length && sortedIds[i] === end + 1) {
      end = sortedIds[i];
    } else {
      if (start === end) {
        ranges.push(`${start}`);
      } else {
        ranges.push(`${start}-${end}`);
      }
      if (i < sortedIds.length) {
        start = sortedIds[i];
        end = start;
      }
    }
  }

  return ranges.join(', ');
};

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

const stripAnsiCodes = (text: string) => text.replace(/\u001b\[[0-9;]*[A-Za-z]/g, '');

const getJobLogPath = (job: JobRecord) => {
  const date = new Date(job.createdAt);
  const dayPrefix = date.toISOString().split('T')[0];
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  const timePrefix = `${hours}-${minutes}-${seconds}`;
  const sanitizedJobName = (job.name || 'job').replace(/[^\w\s-]/g, '').replace(/\s+/g, '_');

  const dir = path.join(JOB_LOGS_DIR, dayPrefix);
  const filename = `${dayPrefix}_${timePrefix}_${sanitizedJobName}_${job.id}.log`;
  return { dir, filename, fullPath: path.join(dir, filename) };
};

const isFfmpegProgressLogLine = (line: string) => {
  const withoutTimestamp = line.replace(/^\[\d{2}:\d{2}:\d{2} \d{2}\/\d{2}\/\d{4}\]\s*/, '');
  const cleaned = stripAnsiCodes(withoutTimestamp);
  return /^\s*frame=\s*\d+\b/.test(cleaned) && /\btime=\s*\d+:\d+:\d+(?:\.\d+)?\b/.test(cleaned);
};

const compactJobLogProgressLines = (log: string) => {
  // Determine if the original log ended with a newline.
  const hadTrailingNewline = log.endsWith('\n') || log.endsWith('\r\n');
  const lines = log.split(/\r?\n/);
  const compacted: string[] = [];
  let latestProgressLine: string | null = null;
  for (const line of lines) {
    // Trim the line to remove any leading/trailing whitespace, including newlines
    // that might have been part of the original message.
    const trimmedLine = line.trim();
    if (isFfmpegProgressLogLine(trimmedLine)) {
      latestProgressLine = trimmedLine; // Store the trimmed progress line
      continue;
    }
    if (trimmedLine) { // Only push non-empty lines
      compacted.push(trimmedLine);
    }
  }

  if (latestProgressLine) {
    compacted.push(latestProgressLine);
  }

  let next = compacted.join('\n');
  if (hadTrailingNewline && next.length > 0 && !next.endsWith('\n')) {
    next += '\n';
  }
  return next;
};

const appendJobLog = (job: JobRecord, message: string) => {
  const timestamp = formatLocalTimestamp();
  const prefixed = message
    .split(/\r?\n|\r/)
    .filter(line => line.trim().length > 0)
    .map(line => `[${timestamp}] ${line}`)
    .join('\n');

  // Also keep a small buffer in memory for quick UI updates if needed,
  // but the source of truth is the file.
  if (prefixed) {
    job.log = compactJobLogProgressLines(`${job.log ?? ''}${prefixed}\n`);
  }

  // Write to file with structured path
  const { dir, fullPath } = getJobLogPath(job);

  (async () => {
    try {
      await fs.mkdir(dir, { recursive: true });
      if (prefixed) {
        await appendFile(fullPath, prefixed + '\n');
      }
    } catch (err) {
      console.error(`Failed to write log for job ${job.id}:`, err);
    }
  })();

  scheduleJobPersist(job);
};

const upsertJobRecord = (job: JobRecord) => {
  db.run(
    `INSERT OR REPLACE INTO jobs (
      id, name, project_name, file_name, file_size, status, progress,
      tasks_json, created_at, started_at, finished_at, duration_ms, error, params_json
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
  overlapSeconds?: number;
  overlapMode?: 'overlap' | 'truncate';
  removeLineBreaks?: boolean;
  outputSignature?: string;
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
      const existing = data[relative];
      const mergedOutputs = Array.from(new Set([...(existing?.outputs ?? []), ...(payload.outputs ?? [])]));
      const nextOutputDetails = { ...(existing?.outputDetails ?? {}) };
      (payload.outputs ?? []).forEach(outputPath => {
        nextOutputDetails[outputPath] = {
          processedAt: payload.processedAt,
          voice: payload.voice ?? undefined,
          rate: payload.rate,
          pitch: payload.pitch,
          overlapSeconds: payload.overlapSeconds,
          overlapMode: payload.overlapMode,
          removeLineBreaks: payload.removeLineBreaks,
          outputSignature: payload.outputSignature
        };
      });
      data[relative] = {
        processedAt: payload.processedAt,
        voice: payload.voice ?? undefined,
        rate: payload.rate,
        pitch: payload.pitch,
        overlapSeconds: payload.overlapSeconds,
        overlapMode: payload.overlapMode,
        removeLineBreaks: payload.removeLineBreaks,
        outputSignature: payload.outputSignature,
        outputs: mergedOutputs,
        outputDetails: nextOutputDetails,
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
        tasks_json, created_at, started_at, finished_at, duration_ms, error, params_json
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
        log: undefined // log is stored in file, loaded on demand via /api/jobs/:id/log
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
        appendJobLog(job, `=== JOB FAILED (server restart) ===\n`);
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

const formatEtaSeconds = (seconds: number) => {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
};

const taskNameMap: Record<string, string> = {
  download: 'Download (yt-dlp)',
  download_subs: 'Download Subtitles',
  download_video: 'Download Video',
  download_audio: 'Download Audio',
  download_merge: 'Merge Video + Audio',
  uvr: 'Vocal Removal',
  tts: 'Text-to-Speech',
  translate: 'AI Translate',
  optimize: 'AI Optimize',
  render: 'Render'
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

const resolveRenderConfigV2 = (raw: unknown): RenderConfigV2 | null => {
  if (!raw || typeof raw !== 'object') return null;
  const cfg = raw as RenderConfigV2;
  if (cfg.version !== '2' || !cfg.timeline || !Array.isArray(cfg.items) || !cfg.inputsMap) return null;
  return cfg;
};

const LOG_RENDER_PREVIEW_FFMPEG_COMMAND = false;
const LOG_RENDER_V2_DEBUG =
  ['1', 'true', 'yes', 'on'].includes((process.env.VITE_SERVER_LOG_RENDER_V2_DEBUG ?? '').toLowerCase());

const runRenderV2Task = async (
  config: RenderConfigV2,
  projectRoot: string,
  options?: {
    onLog?: (chunk: string) => void;
    onProgress?: (currentSeconds: number, totalSeconds: number) => void;
    onSpawn?: (proc: ReturnType<typeof spawn>) => void;
    forceNew?: boolean;
  }
) => {
  const { onLog, onProgress, onSpawn, forceNew } = options ?? {};
  const outputDir = path.join(projectRoot, 'output');
  await fs.mkdir(outputDir, { recursive: true });
  const formatRenderTimestamp = (date: Date) => {
    const yy = String(date.getFullYear()).slice(-2);
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    const ss = String(date.getSeconds()).padStart(2, '0');
    return `${yy}${mm}${dd}-${hh}${min}${ss}`;
  };
  const exportModeForOutput = (config.timeline as any).exportMode || 'video+audio';
  const isAudioOnlyOutput = exportModeForOutput === 'audio only';
  const outputExt = isAudioOnlyOutput ? '.mp3' : '.mp4';
  const outputName = `render-${formatRenderTimestamp(new Date())}${outputExt}`;
  const outputPath = path.join(outputDir, outputName);
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'render-v2-'));
  // Shared LUFS cache: measurements are performed once for the first segment
  // and reused by all subsequent segments, avoiding redundant ffmpeg passes.
  const lufsCache = new Map<string, number>();
  try {
    const ffmpegPath = await getFfmpegPath();

    // ── Copy fast-path (Full or Hybrid) ───────────────────────────────────
    // Check before segmentation. If video is copy-eligible, bypass the entire
    // segment+concat pipeline entirely — one single FFmpeg pass.
    const configStart = Number.isFinite(config.timeline.start) ? Math.max(0, Number(config.timeline.start)) : 0;
    const copyResult = checkCopyPathEligibility(config, MEDIA_VAULT_ROOT, {
      outputStart: configStart,
      onLog
    });

    if (copyResult.mode === 'full') {
      // ── Full Copy: both streams lossless ───────────────────────────────
      const { videoPath, audioPath, duration, audioFromVideo } = copyResult;
      onLog?.(`[CopyPath] mode=FULL — bypassing segment pipeline (fully lossless).\n`);
      const copyArgs = [
        '-y',
        '-i', videoPath,
        '-map', '0:v:0',
        ...(audioFromVideo ? ['-map', '0:a:0'] : ['-i', String(audioPath), '-map', '1:a:0']),
        '-c:v', 'copy',
        '-c:a', 'copy',
        '-t', String(duration),
        outputPath
      ];
      onLog?.(`[CopyPath] Command: ffmpeg ${copyArgs.filter(a => a !== '-y').join(' ')}\n`);
      await runFfmpegLoggedCommand(ffmpegPath, copyArgs, 'render v2 full-copy', onLog, onSpawn,
        seconds => onProgress?.(Math.min(seconds, duration), duration));
      onProgress?.(duration, duration);
      return { outputPath, outputRelativePath: path.relative(MEDIA_VAULT_ROOT, outputPath) };
    }

    if (copyResult.mode === 'hybrid') {
      // ── Hybrid Copy: audio-only render (temp) + copy-video mux ─────────
      const { videoPath, duration, activeAudioSourceCount } = copyResult;
      onLog?.(`[CopyPath] mode=HYBRID — bypassing segment pipeline (video copy, audio rendered separately).\n`);
      onLog?.(`[CopyPath]   Active audio source count: ${activeAudioSourceCount}\n`);

      const hybridAudioConfig: RenderConfigV2 = {
        ...config,
        timeline: {
          ...config.timeline,
          exportMode: 'audio only'
        }
      };
      const hybridAudioTempPath = path.join(tmpDir, 'hybrid-audio.m4a');
      const { args: hybridAudioArgs, outputDuration: hybridAudioDuration } = await buildRenderV2FfmpegArgs(
        hybridAudioConfig,
        hybridAudioTempPath,
        tmpDir,
        MEDIA_VAULT_ROOT,
        {
          codec: RENDER_V2_CODEC === 'h265' ? 'libx265' : 'libx264',
          preset: RENDER_V2_PRESET,
          crf: RENDER_V2_CRF,
          tune: RENDER_V2_TUNE,
          gop: RENDER_V2_GOP,
          threads: RENDER_V2_FFMPEG_THREADS
        },
        {
          debugEnabled: LOG_RENDER_V2_DEBUG,
          debugLabel: 'copypath-hybrid-audio',
          onLog,
          ffmpegPath,
          lufsCache
        }
      );
      const normalizedHybridAudioArgs = [...hybridAudioArgs];
      const outIndex = normalizedHybridAudioArgs.lastIndexOf(hybridAudioTempPath);
      if (outIndex < 0) throw new Error('Hybrid audio temp output path is missing');
      const audioCodecIndex = normalizedHybridAudioArgs.findIndex((arg, idx) => arg === '-c:a' && idx < outIndex);
      if (audioCodecIndex >= 0 && audioCodecIndex + 1 < outIndex) {
        normalizedHybridAudioArgs.splice(audioCodecIndex, 2);
      }
      const qAudioIndex = normalizedHybridAudioArgs.findIndex((arg, idx) => arg === '-q:a' && idx < outIndex);
      if (qAudioIndex >= 0 && qAudioIndex + 1 < outIndex) {
        normalizedHybridAudioArgs.splice(qAudioIndex, 2);
      }
      const vnIndex = normalizedHybridAudioArgs.findIndex((arg, idx) => arg === '-vn' && idx < outIndex);
      if (vnIndex < 0) {
        normalizedHybridAudioArgs.splice(outIndex, 0, '-vn');
      }
      normalizedHybridAudioArgs.splice(outIndex, 0, '-c:a', 'aac');
      normalizedHybridAudioArgs.splice(outIndex, 0, '-b:a', '192k', '-movflags', '+faststart');

      onLog?.(`[CopyPath]   Phase 1/2: Render processed audio temp file\n`);
      const hybridAudioDurationValue = Number(hybridAudioDuration) || duration;
      await runFfmpegLoggedCommand(ffmpegPath, normalizedHybridAudioArgs, 'render v2 hybrid-audio-temp', onLog, onSpawn,
        seconds => onProgress?.(Math.min(seconds, hybridAudioDurationValue), duration));

      const muxArgs = [
        '-y',
        '-i', videoPath,
        '-i', hybridAudioTempPath,
        '-map', '0:v:0',
        '-map', '1:a:0',
        '-c:v', 'copy',
        '-c:a', 'copy',
        '-t', String(duration),
        '-movflags', '+faststart',
        outputPath
      ];
      onLog?.(`[CopyPath]   Phase 2/2: Mux copy-video + processed-audio temp (audioDuration=${Number(hybridAudioDuration).toFixed(3)}s)\n`);
      onLog?.(`[CopyPath] Command: ffmpeg ${muxArgs.filter(a => a !== '-y').join(' ')}\n`);
      await runFfmpegLoggedCommand(ffmpegPath, muxArgs, 'render v2 hybrid-mux', onLog, onSpawn,
        seconds => onProgress?.(Math.min(seconds, duration), duration));
      onProgress?.(duration, duration);
      return { outputPath, outputRelativePath: path.relative(MEDIA_VAULT_ROOT, outputPath) };
    }

    onLog?.(`[CopyPath] mode=NONE (${(copyResult as { mode: 'none'; reason: string }).reason}) — using standard segment pipeline.\n`);

    // ── Standard segment+encode pipeline ──────────────────────────────────
    const { outputDuration } = await buildRenderV2FfmpegArgs(config, outputPath, tmpDir, MEDIA_VAULT_ROOT, {
      codec: RENDER_V2_CODEC === 'h265' ? 'libx265' : 'libx264',
      preset: RENDER_V2_PRESET,
      crf: RENDER_V2_CRF,
      tune: RENDER_V2_TUNE,
      gop: RENDER_V2_GOP,
      threads: RENDER_V2_FFMPEG_THREADS
    }, {
      debugEnabled: LOG_RENDER_V2_DEBUG,
      debugLabel: 'render-total',
      onLog,
      ffmpegPath,
      lufsCache
    });
    const totalSeconds = Number.isFinite(outputDuration) && outputDuration > 0 ? outputDuration : 0;
    if (totalSeconds <= 0) {
      throw new Error('Render has no output duration');
    }
    const { signature, payload } = await buildRenderV2Signature(config, MEDIA_VAULT_ROOT, RENDER_V2_SEGMENT_SECONDS);
    const segmentSeconds = Math.min(RENDER_V2_SEGMENT_SECONDS, Math.max(1, totalSeconds));
    const cacheRoot = path.join(projectRoot, RENDER_V2_CACHE_DIRNAME, signature);

    if (forceNew) {
      await fs.rm(cacheRoot, { recursive: true, force: true }).catch(() => null);
    }

    const segmentsDir = path.join(cacheRoot, 'segments');
    await fs.mkdir(segmentsDir, { recursive: true });
    await fs.writeFile(
      path.join(cacheRoot, 'meta.json'),
      JSON.stringify({
        createdAt: new Date().toISOString(),
        totalSeconds,
        configStart,
        signature,
        ...payload
      }, null, 2),
      'utf-8'
    ).catch(() => null);

    const segmentCount = Math.max(1, Math.ceil(totalSeconds / segmentSeconds));
    const segmentExt = isAudioOnlyOutput ? '.mp3' : '.mp4';
    const getSegmentPath = (i: number) =>
      path.join(segmentsDir, `seg-${String(i).padStart(5, '0')}${segmentExt}`);
    const getSegmentDuration = (i: number) =>
      Math.max(0.001, Math.min(segmentSeconds, totalSeconds - i * segmentSeconds));

    // ── Phase 1: classify segments (cached vs pending) ────────────────────
    const cachedIndices: number[]  = [];
    const pendingIndices: number[] = [];
    for (let i = 0; i < segmentCount; i += 1) {
      const reusable = await isReusableRenderSegment(getSegmentPath(i), getSegmentDuration(i));
      if (reusable) {
        cachedIndices.push(i);
        onLog?.(`CACHE HIT (render segment ${i + 1}/${segmentCount}): ${path.relative(projectRoot, getSegmentPath(i))}\n`);
      } else {
        pendingIndices.push(i);
      }
    }

    const cachedSeconds = cachedIndices.reduce((acc, i) => acc + getSegmentDuration(i), 0);
    onProgress?.(Math.min(totalSeconds, cachedSeconds), totalSeconds);

    if (pendingIndices.length > 0) {
      const parallelism = Math.min(RENDER_V2_PARALLEL_SEGMENTS, pendingIndices.length);
      onLog?.(`[Parallel] Rendering ${pendingIndices.length} segment(s) with concurrency=${parallelism} (${cachedIndices.length} cached).\n`);

      // Per-segment progress accumulator (seconds of encoded output reported by FFmpeg)
      const segProgress = new Map<number, number>();

      const renderOneSegment = async (segmentIndex: number): Promise<void> => {
        const localStartSeconds = segmentIndex * segmentSeconds;
        const expectedDuration  = getSegmentDuration(segmentIndex);
        const segmentPath       = getSegmentPath(segmentIndex);
        const partialPath       = `${segmentPath.replace(/\.(mp4|mp3)$/i, '')}.part${segmentExt}`;

        // Each parallel segment gets its own tmpDir so temp files never collide.
        const useParallelTmp = parallelism > 1;
        const segTmpDir = useParallelTmp
          ? await fs.mkdtemp(path.join(os.tmpdir(), `render-v2-seg${segmentIndex}-`))
          : tmpDir;

        try {
          await fs.rm(partialPath, { force: true }).catch(() => null);
          const { args } = await buildRenderV2FfmpegArgs(
            config,
            partialPath,
            segTmpDir,
            MEDIA_VAULT_ROOT,
            {
              codec: RENDER_V2_CODEC === 'h265' ? 'libx265' : 'libx264',
              preset: RENDER_V2_PRESET,
              crf: RENDER_V2_CRF,
              tune: RENDER_V2_TUNE,
              gop: RENDER_V2_GOP,
              threads: RENDER_V2_FFMPEG_THREADS
            },
            {
              outputStart: configStart + localStartSeconds,
              outputDuration: expectedDuration,
              allowShortDuration: true,
              debugEnabled: LOG_RENDER_V2_DEBUG,
              debugLabel: `render-segment-${segmentIndex + 1}`,
              onLog: segmentIndex === 0 ? onLog : undefined,
              ffmpegPath,
              lufsCache
            }
          );
          segProgress.set(segmentIndex, 0);
          await runFfmpegLoggedCommand(
            ffmpegPath,
            args,
            `render v2 segment ${segmentIndex + 1}/${segmentCount}`,
            onLog,
            onSpawn,
            seconds => {
              if (!onProgress) return;
              const bounded = Math.min(expectedDuration, Math.max(0, seconds));
              segProgress.set(segmentIndex, bounded);
              // Aggregate: cached + sum of in-progress renders
              const inFlightSeconds = Array.from(segProgress.values()).reduce((a, b) => a + b, 0);
              onProgress(Math.min(totalSeconds, cachedSeconds + inFlightSeconds), totalSeconds);
            }
          );
          await fs.rename(partialPath, segmentPath);
          segProgress.set(segmentIndex, expectedDuration);
        } finally {
          if (useParallelTmp) {
            await fs.rm(segTmpDir, { recursive: true, force: true }).catch(() => null);
          }
        }
      };

      // Concurrency-limited Promise runner (semaphore pattern)
      const runWithConcurrency = async (
        tasks: Array<() => Promise<void>>,
        limit: number
      ): Promise<void> => {
        const active = new Set<Promise<void>>();
        for (const task of tasks) {
          const p: Promise<void> = task().finally(() => active.delete(p));
          active.add(p);
          if (active.size >= limit) await Promise.race(active);
        }
        await Promise.all(active);
      };

      await runWithConcurrency(
        pendingIndices.map(i => () => renderOneSegment(i)),
        parallelism
      );
    }

    onProgress?.(totalSeconds, totalSeconds);

    const concatListPath = path.join(cacheRoot, 'concat.txt');
    const concatLines: string[] = [];
    for (let segmentIndex = 0; segmentIndex < segmentCount; segmentIndex += 1) {
      const segmentName = `seg-${String(segmentIndex).padStart(5, '0')}${isAudioOnlyOutput ? '.mp3' : '.mp4'}`;
      const segmentPath = path.join(segmentsDir, segmentName);
      concatLines.push(`file '${escapeConcatFilePath(segmentPath)}'`);
    }
    await fs.writeFile(concatListPath, `${concatLines.join('\n')}\n`, 'utf-8');
    const concatArgs = [
      '-y',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      concatListPath,
      '-c',
      'copy',
      outputPath
    ];
    await runFfmpegLoggedCommand(ffmpegPath, concatArgs, 'render v2 concat', onLog, onSpawn);
    onProgress?.(totalSeconds, totalSeconds);
    return {
      outputPath,
      outputRelativePath: path.relative(MEDIA_VAULT_ROOT, outputPath)
    };
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => null);
  }
};

const runJob = async (job: JobRecord, mode: 'normal' | 'download') => {
  // Check if job was cancelled while in queue
  if ((job as any).__cancelRequested) {
    // Reset activeJobId if this was the active job
    if (mode === 'normal' && activeJobId === job.id) {
      activeJobId = null;
      setImmediate(processNextJob);
    } else if (mode === 'download') {
      activeDownloadCount = Math.max(0, activeDownloadCount - 1);
      setImmediate(processNextDownload);
    }
    return;
  }
  job.status = 'processing';
  job.progress = 0;
  job.startedAt = new Date().toISOString();
  scheduleJobPersist(job);
  appendJobLog(job, `=== JOB STARTED ===\n`);
  const logParams = JSON.parse(JSON.stringify(job.params ?? {}));
  if (logParams.translate?.targetIds) {
    logParams.translate.targetIds = formatIdRange(logParams.translate.targetIds);
  }
  if (logParams.optimize?.targetIds) {
    logParams.optimize.targetIds = formatIdRange(logParams.optimize.targetIds);
  }
  if (logParams.targetIds) {
    logParams.targetIds = formatIdRange(logParams.targetIds);
  }
  appendJobLog(job, `Job params: ${JSON.stringify(logParams, null, 2)}\n`);

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
      const downloadRuntimeDir = (job as any).__downloadRuntimeDir as string | undefined;
      const url = (job as any).__downloadUrl as string | undefined;
      const cookiesFile = (job as any).__downloadCookiesFile as string | null | undefined;
      const noPlaylist = (job as any).__downloadNoPlaylist as boolean | undefined;
      const subLangs = (job as any).__downloadSubLangs as string | undefined;
      if (!sourceDir || !downloadRuntimeDir || !url) {
        throw new Error('Missing download parameters');
      }
      const downloadResult = await runYtDlpTask(
        url,
        downloadRuntimeDir,
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
            // Only mark error for fatal errors, not transient retry messages
            // yt-dlp outputs "ERROR: ... Retrying (N/M)..." for transient errors
            if (/ERROR:/i.test(line) && !/Retrying\s*\(\d+\/\d+\)/i.test(line)) {
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
      const wantsSubs = downloadMode !== 'media';
      const wantsMedia = downloadMode !== 'subs';
      const subsCandidates = downloadResult.subsFiles.map(name => path.join(sourceDir, name)).filter(pathname => isSubtitleFile(pathname));
      let mediaCandidates = downloadResult.mediaFiles.map(name => path.join(sourceDir, name)).filter(pathname => isVideoFile(pathname) || isAudioFile(pathname));
      // If no new files, check for existing media files (yt-dlp may have skipped download)
      if (mediaCandidates.length === 0 && wantsMedia) {
        const existingFiles = (await fs.readdir(sourceDir, { withFileTypes: true }))
          .filter(entry => entry.isFile())
          .map(entry => path.join(sourceDir, entry.name));
        mediaCandidates = existingFiles.filter(pathname => isVideoFile(pathname) || isAudioFile(pathname));
      }
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
      const uvrRuntimeDir = (job as any).__uvrRuntimeDir as string;
      const baseName = path.parse(uvrInputPath).name;

      // Check for existing UVR state (resume capability)
      const existingState = await readUvrState(uvrRuntimeDir);
      const model = (job as any).__model;
      const backend = (job as any).__backend ?? 'vr';
      const outputFormat = (job as any).__outputFormat;
      const uvrInputRelativePath = path.relative(MEDIA_VAULT_ROOT, uvrInputPath);

      // If state exists and is completed with matching params, skip UVR
      if (existingState?.completed &&
          existingState.inputPath === uvrInputRelativePath &&
          existingState.model === model &&
          existingState.backend === backend &&
          existingState.outputFormat === outputFormat) {
        appendJobLog(job, `[UVR] Skipping - already completed with same parameters\n`);
        uvrTask.status = 'done';
        uvrTask.progress = 100;
        const total = job.tasks.reduce((sum, task) => sum + (task.progress ?? 0), 0);
        job.progress = Math.max(0, Math.min(99, Math.round(total / job.tasks.length)));
        scheduleJobPersist(job);
      } else {
        // Run UVR processing
        await fs.mkdir(uvrRuntimeDir, { recursive: true });
        const before = new Set<string>((await fs.readdir(uvrRuntimeDir).catch(() => [])).map(name => path.join(uvrRuntimeDir, name)));
        // Track UVR multi-file progress
        let uvrTotalFiles = 1; // Default to 1 (single file mode)
        let uvrCurrentFile = 1;
        const uvrLog = await runUvrTask(
          uvrInputPath,
          uvrRuntimeDir,
          model,
          outputFormat,
          backend,
          (chunk) => {
            appendJobLog(job, chunk);
            const lines = chunk.split(/\r?\n/);
            for (const line of lines) {
              // Parse "Split '...' into N chunk(s)."
              const splitMatch = line.match(/Split\s+.*\s+into\s+(\d+)\s+chunk/);
              if (splitMatch) {
                uvrTotalFiles = Math.max(1, Number(splitMatch[1]));
                uvrCurrentFile = 1;
                continue;
              }
              // Parse "File X/Y Processing ... Slices..."
              const fileMatch = line.match(/File\s+(\d+)\/(\d+)\s+Processing/);
              if (fileMatch) {
                uvrCurrentFile = Math.max(1, Number(fileMatch[1]));
                uvrTotalFiles = Math.max(uvrCurrentFile, Number(fileMatch[2]));
                continue;
              }
              // Parse progress bar "X%|..."
              const match = line.match(/^\s*(\d{1,3})%\|/);
              if (!match) continue;
              const percent = Math.min(100, Math.max(0, Number(match[1])));
              if (!Number.isFinite(percent)) continue;
              // Calculate overall progress across all files
              // Formula: ((currentFile - 1) + percent/100) / totalFiles * 100
              const overallPercent = Math.round(((uvrCurrentFile - 1) + percent / 100) / uvrTotalFiles * 100);
              if (overallPercent <= (uvrTask.progress ?? 0)) continue;
              uvrTask.progress = overallPercent;
              updateUvrJobProgress();
            }
          },
          { signal: abortController.signal, onStart: proc => ((job as any).__activeProcess = proc) }
        );
        const resolvedLog = job.log && job.log.trim().length > 0 ? job.log : uvrLog;
        job.log = resolvedLog || `UVR completed at ${new Date().toISOString()}`;

        // Move outputs from runtime dir to output dir
        const movedFiles = await moveUvrOutputs(uvrRuntimeDir, outputDir, baseName);
        if (movedFiles.length === 0) {
          throw new Error('UVR task completed but no output files were generated. Check if the process was interrupted or if there were chunk file errors.');
        }
        appendJobLog(job, `[MOVE] Moved ${movedFiles.length} file(s) to output directory\n`);

        // Update UVR state
        await writeUvrState(uvrRuntimeDir, {
          inputPath: uvrInputRelativePath,
          backend,
          model,
          outputFormat,
          completed: true,
          outputs: movedFiles,
          lastUpdated: new Date().toISOString()
        });

        const outputs = movedFiles.map(name => path.relative(MEDIA_VAULT_ROOT, path.join(outputDir, name)));

        if (uvrInputRelativePath) {
          upsertUvrMetadata({
            relativePath: uvrInputRelativePath,
            processedAt: new Date().toISOString(),
            backend,
            model,
            outputFormat,
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
      const ttsAbortController = new AbortController();
      (job as any).__abortController = ttsAbortController;
      const outputDir = (job as any).__outputDir as string;
      const ttsResult = await runTtsTask(inputPath, outputDir, {
        voice: (job as any).__ttsVoice as string | undefined,
        rate: (job as any).__ttsRate as number | undefined,
        pitch: (job as any).__ttsPitch as number | undefined,
        overlapMode: (job as any).__ttsOverlapMode as 'overlap' | 'truncate' | undefined,
        removeLineBreaks: (job as any).__ttsRemoveLineBreaks as boolean | undefined,
        onLog: chunk => appendJobLog(job, chunk),
        signal: ttsAbortController.signal,
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
        overlapSeconds: ttsResult.overlapSeconds,
        overlapMode: ttsResult.overlapMode,
        removeLineBreaks: ttsResult.removeLineBreaks,
        outputSignature: ttsResult.outputSignature,
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

    const translateTask = job.tasks.find(task => task.type === 'translate');
    if (translateTask) {
      const subtitleFile = (job as any).__translateSubtitleFile as string | undefined;
      const projectName = job.projectName;
      if (!subtitleFile || !projectName) {
        throw new Error('Missing input for translate task');
      }
      translateTask.status = 'active';
      translateTask.progress = 0;
      const updateTranslateJobProgress = () => {
        const total = job.tasks.reduce((sum, task) => sum + (task.progress ?? 0), 0);
        job.progress = Math.max(0, Math.min(99, Math.round(total / job.tasks.length)));
        scheduleJobPersist(job);
      };
      updateTranslateJobProgress();
      
      const translateAbortController = new AbortController();
      (job as any).__abortController = translateAbortController;
      
      const translateExecutor = new (await import('./job/executor.js')).SubtitleAiTaskExecutor();
      const translateTaskNode = {
        id: translateTask.id,
        type: 'translate' as const,
        name: translateTask.name,
        status: 'running' as const,
        progress: 0,
        dependencies: [],
        dependents: [],
        priority: 2,
        params: {
          projectName,
          subtitleFile,
          preset: (job as any).__translatePreset,
          targetIds: (job as any).__translateTargetIds
        }
      };

      const translateResult = await translateExecutor.execute(translateTaskNode as any, {
        signal: translateAbortController.signal,
        config: systemConfig,
        onProgress: (p, msg, processed, total) => {
          translateTask.progress = p;
          if (processed !== undefined) (translateTask as any).processed = processed;
          if (total !== undefined) (translateTask as any).total = total;
          if (msg) appendJobLog(job, msg + '\n');
          updateTranslateJobProgress();
        },
        onLog: msg => appendJobLog(job, msg + '\n')
      });

      translateTask.status = 'done';
      translateTask.progress = 100;
      if (translateResult.outputs && translateResult.outputs.length > 0) {
        (translateTask as any).outputs = translateResult.outputs;
      }
      updateTranslateJobProgress();
    }

    const optimizeTask = job.tasks.find(task => task.type === 'optimize');
    if (optimizeTask) {
      const subtitleFile = (job as any).__optimizeSubtitleFile as string | undefined;
      const projectName = job.projectName;
      if (!subtitleFile || !projectName) {
        throw new Error('Missing input for optimize task');
      }
      optimizeTask.status = 'active';
      optimizeTask.progress = 0;
      const updateOptimizeJobProgress = () => {
        const total = job.tasks.reduce((sum, task) => sum + (task.progress ?? 0), 0);
        job.progress = Math.max(0, Math.min(99, Math.round(total / job.tasks.length)));
      };

      const optimizeAbortController = new AbortController();
      (job as any).__abortController = optimizeAbortController;

      const optimizeExecutor = new (await import('./job/executor.js')).SubtitleAiTaskExecutor();
      const optimizeTaskNode = {
        id: optimizeTask.id,
        type: 'optimize' as const,
        name: optimizeTask.name,
        status: 'running' as const,
        progress: 0,
        dependencies: [],
        dependents: [],
        priority: 2,
        params: {
          projectName,
          subtitleFile,
          preset: (job as any).__optimizePreset,
          targetIds: (job as any).__optimizeTargetIds,
          targetIssues: (job as any).__optimizeTargetIssues
        }
      };

      const optimizeResult = await optimizeExecutor.execute(optimizeTaskNode as any, {
        signal: optimizeAbortController.signal,
        config: systemConfig,
        onProgress: (p, msg, processed, total) => {
          optimizeTask.progress = p;
          if (processed !== undefined) (optimizeTask as any).processed = processed;
          if (total !== undefined) (optimizeTask as any).total = total;
          if (msg) appendJobLog(job, msg + '\n');
          updateOptimizeJobProgress();
        },
        onLog: msg => appendJobLog(job, msg + '\n')
      });

      optimizeTask.status = 'done';
      optimizeTask.progress = 100;
      if (optimizeResult.outputs && optimizeResult.outputs.length > 0) {
        (optimizeTask as any).outputs = optimizeResult.outputs;
      }
      updateOptimizeJobProgress();
    }

    const renderTask = job.tasks.find(task => task.type === 'render');
    if (renderTask) {
      const rawConfig = (job as any).__renderConfigV2 ?? (job.params as any)?.render?.configV2;
      const config = resolveRenderConfigV2(rawConfig);
      appendJobLog(job, "DEBUG_CONFIG: " + JSON.stringify({ start: config?.timeline?.start, duration: config?.timeline?.duration }) + "\n");
      if (!config) {
        throw new Error('Missing renderConfigV2');
      }
      const previewSeconds = (job.params as any)?.render?.previewSeconds;
      if (Number.isFinite(previewSeconds) && previewSeconds > 0) {
        const start = config?.timeline.start || 0;
        if (start > 0) {
          appendJobLog(job, `Render preview: last ${previewSeconds}s (starting from ${start.toFixed(1)}s)\n`);
        } else {
          appendJobLog(job, `Render preview: first ${previewSeconds}s\n`);
        }
      }
      renderTask.status = 'active';
      renderTask.progress = 0;
      job.eta = undefined;
      const total = job.tasks.reduce((sum, task) => sum + (task.progress ?? 0), 0);
      job.progress = Math.max(0, Math.min(99, Math.round(total / job.tasks.length)));
      scheduleJobPersist(job);

      const projectRoot = (job as any).__projectRoot as string | undefined;
      if (!projectRoot) {
        throw new Error('Missing project root for render');
      }
      const renderStartedAt = Date.now();
      const result = await runRenderV2Task(
        config,
        projectRoot,
        {
          onLog: chunk => appendJobLog(job, chunk),
          onProgress: (currentSeconds, totalSeconds) => {
            if (totalSeconds <= 0) return;
            const percent = Math.min(99, Math.round((currentSeconds / totalSeconds) * 100));
            if (percent <= (renderTask.progress ?? 0)) return;
            renderTask.progress = percent;
            if (currentSeconds > 0) {
              const elapsed = (Date.now() - renderStartedAt) / 1000;
              if (elapsed > 0.5) {
                const speed = currentSeconds / elapsed;
                if (speed > 0) {
                  const remaining = Math.max(0, totalSeconds - currentSeconds);
                  const etaSeconds = remaining / speed;
                  job.eta = formatEtaSeconds(etaSeconds);
                }
              }
            }
            const totalProgress = job.tasks.reduce((sum, task) => sum + (task.progress ?? 0), 0);
            job.progress = Math.max(0, Math.min(99, Math.round(totalProgress / job.tasks.length)));
            scheduleJobPersist(job);
          },
          onSpawn: proc => {
            (job as any).__activeProcess = proc;
          },
          forceNew: (job as any).__forceRenderV2New
        }
      );
      appendJobLog(job, `Render output:\n- ${result.outputRelativePath}\n`);
      renderTask.status = 'done';
      renderTask.progress = 100;
      job.eta = undefined;
      (job as any).__activeProcess = undefined;
      const totalAfter = job.tasks.reduce((sum, task) => sum + (task.progress ?? 0), 0);
      job.progress = Math.max(0, Math.min(99, Math.round(totalAfter / job.tasks.length)));
      scheduleJobPersist(job);
    }
    job.status = 'completed';
    job.progress = 100;
    job.finishedAt = new Date().toISOString();
    job.durationMs = new Date(job.finishedAt).getTime() - new Date(job.startedAt ?? job.createdAt).getTime();
    appendJobLog(job, `=== JOB COMPLETED ===\nDuration: ${job.durationMs}ms\n`);
    scheduleJobPersist(job);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Job failed';
    if ((job as any).__cancelRequested || message === CANCELLED_ERROR_MESSAGE) {
      job.status = 'cancelled';
      job.error = CANCELLED_ERROR_MESSAGE;
      job.eta = undefined;
      (job as any).__activeProcess = undefined;
      appendJobLog(job, `=== JOB CANCELLED ===\n`);
    } else {
      job.status = 'failed';
      job.error = message;
      job.eta = undefined;
      (job as any).__activeProcess = undefined;
      appendJobLog(job, `=== JOB FAILED ===\nError: ${message}\n`);
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

const isKnownSubdir = (dirName: string) => KNOWN_SUBDIRS.has(dirName.toLowerCase());

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

const buildTtsOutputName = (inputFullPath: string, settings: TtsOutputSettings) => {
  const ext = path.extname(inputFullPath).toLowerCase();
  const baseName = path.basename(inputFullPath, ext);
  const signature = buildTtsOutputSignature(settings);

  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  const timestamp = `${yy}${mm}${dd}-${hh}${min}${ss}`;

  return {
    outputName: `[TTS]${baseName}.${timestamp}.${signature}.${DEFAULT_TTS_OUTPUT_EXT}`,
    outputSignature: signature
  };
};

type TtsTaskResult = {
  outputPath: string;
  outputRelativePath: string;
  outputSignature: string;
  voice: string;
  rate?: number;
  pitch?: number;
  overlapSeconds: number;
  overlapMode: 'overlap' | 'truncate';
  removeLineBreaks: boolean;
};

type TtsOutputSettings = {
  voice: string;
  rate?: number;
  pitch?: number;
  overlapMode: 'overlap' | 'truncate';
  removeLineBreaks: boolean;
};

type CueCacheIdentity = {
  cueText: string;
};

type CueCacheFolderKey = {
  voice: string;
  removeLineBreaks: boolean;
};

type CueCacheEntry = {
  createdAt: string;
  durationSeconds: number;
};

type CueCacheMeta = {
  folderIdentity: CueCacheFolderKey;
  entries: Record<string, CueCacheEntry>;
};

type CueFxCacheFolderKey = {
  rawFolderHash: string;
  rate: number;
  pitch: number;
  outputExt: string;
};

type CueFxCacheIdentity = {
  baseCueKey: string;
};

type CueFxCacheEntry = {
  createdAt: string;
  durationSeconds: number;
};

type CueFxCacheMeta = {
  folderIdentity: CueFxCacheFolderKey;
  entries: Record<string, CueFxCacheEntry>;
};

const fileExists = async (fullPath: string) =>
  fs.access(fullPath).then(() => true).catch(() => false);

const toCueCacheKey = (identity: CueCacheIdentity) =>
  crypto.createHash('sha256').update(JSON.stringify(identity)).digest('hex').slice(0, 24);

const toCueFxCacheKey = (identity: CueFxCacheIdentity) =>
  crypto.createHash('sha256').update(JSON.stringify(identity)).digest('hex').slice(0, 24);

const toCueFolderKey = (folderKey: CueCacheFolderKey) =>
  crypto.createHash('sha256').update(JSON.stringify(folderKey)).digest('hex').slice(0, 12);

const buildCueCacheIdentity = (
  cue: SubtitleCue
): CueCacheIdentity => ({
  cueText: cue.text,
});

const buildCueCachePaths = (projectRoot: string, folderKey: CueCacheFolderKey, key: string, outputExt: string) => {
  const folderHash = toCueFolderKey(folderKey);
  const cacheDir = path.join(projectRoot, TTS_CUE_CACHE_DIRNAME, `raw-${folderHash}`);
  return {
    cacheDir,
    audioPath: path.join(cacheDir, `${key}.${outputExt}`),
    tmpAudioPath: path.join(cacheDir, `${key}.tmp.${outputExt}`),
    metaPath: path.join(cacheDir, 'meta.json')
  };
};

const readCueCacheMeta = async (metaPath: string): Promise<CueCacheMeta | null> => {
  try {
    const raw = await fs.readFile(metaPath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed as CueCacheMeta;
  } catch {
    return null;
  }
};

const writeCueCacheMeta = async (metaPath: string, meta: CueCacheMeta) => {
  await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
};

const initCueCacheMeta = async (
  metaPath: string,
  folderIdentity: CueCacheFolderKey
): Promise<CueCacheMeta> => {
  const existing = await readCueCacheMeta(metaPath);
  if (existing) return existing;
  const meta: CueCacheMeta = { folderIdentity, entries: {} };
  await writeCueCacheMeta(metaPath, meta);
  return meta;
};

const upsertCueCacheEntry = async (
  metaPath: string,
  folderIdentity: CueCacheFolderKey,
  key: string,
  entry: CueCacheEntry
) => {
  const meta = await initCueCacheMeta(metaPath, folderIdentity);
  meta.entries[key] = entry;
  await writeCueCacheMeta(metaPath, meta);
};

const sameCueIdentity = (left: CueCacheIdentity, right: CueCacheIdentity) =>
  left.cueText === right.cueText;

const roundFactor = (value: number) => Math.round(value * 1_000_000) / 1_000_000;

const buildAtempoFilters = (factor: number): string[] => {
  const out: string[] = [];
  let remaining = factor;
  if (!Number.isFinite(remaining) || remaining <= 0) return out;
  while (remaining > 2.0) {
    out.push('atempo=2.0');
    remaining /= 2.0;
  }
  while (remaining < 0.5) {
    out.push('atempo=0.5');
    remaining /= 0.5;
  }
  const rounded = roundFactor(remaining);
  if (Math.abs(rounded - 1) > 0.000001) {
    out.push(`atempo=${rounded}`);
  }
  return out;
};

const buildCueFxFilter = (rate: number, pitchSemitones: number, sampleRateHz: number): string | null => {
  const safeRate = sanitizeRateFactor(rate);
  const safePitch = sanitizePitchSemitones(pitchSemitones);
  const safeSampleRate = Number.isFinite(sampleRateHz) && sampleRateHz > 0
    ? Math.round(sampleRateHz)
    : TTS_INTERNAL_SAMPLE_RATE;
  const pitchRatio = Math.pow(2, safePitch / 12);
  const filters: string[] = [];
  if (Math.abs(safePitch) > 0.000001) {
    const shiftedRate = Math.max(1000, Math.round(safeSampleRate * pitchRatio));
    filters.push(`asetrate=${shiftedRate}`);
    filters.push(`aresample=${safeSampleRate}`);
    filters.push(...buildAtempoFilters(1 / pitchRatio));
  }
  if (Math.abs(safeRate - 1) > 0.000001) {
    filters.push(...buildAtempoFilters(safeRate));
  }
  filters.push(`aresample=${TTS_INTERNAL_SAMPLE_RATE}`);
  return filters.length ? filters.join(',') : null;
};

const MIX_TIMING_EPSILON = 0.0005;

const toCueFxFolderKey = (folderKey: CueFxCacheFolderKey) =>
  crypto.createHash('sha256').update(JSON.stringify(folderKey)).digest('hex').slice(0, 12);

const buildCueFxCachePaths = (projectRoot: string, rawFolderHash: string, folderKey: CueFxCacheFolderKey, key: string, outputExt: string) => {
  const fxFolderHash = toCueFxFolderKey(folderKey);
  const cacheDir = path.join(projectRoot, TTS_CUE_CACHE_DIRNAME, `fx-${rawFolderHash}-${fxFolderHash}`);
  return {
    cacheDir,
    audioPath: path.join(cacheDir, `${key}.${outputExt}`),
    tmpAudioPath: path.join(cacheDir, `${key}.tmp.${outputExt}`),
    metaPath: path.join(cacheDir, 'meta.json')
  };
};

const readCueFxCacheMeta = async (metaPath: string): Promise<CueFxCacheMeta | null> => {
  try {
    const raw = await fs.readFile(metaPath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed as CueFxCacheMeta;
  } catch {
    return null;
  }
};

const writeCueFxCacheMeta = async (metaPath: string, meta: CueFxCacheMeta) => {
  await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
};

const initCueFxCacheMeta = async (
  metaPath: string,
  folderIdentity: CueFxCacheFolderKey
): Promise<CueFxCacheMeta> => {
  const existing = await readCueFxCacheMeta(metaPath);
  if (existing) return existing;
  const meta: CueFxCacheMeta = { folderIdentity, entries: {} };
  await writeCueFxCacheMeta(metaPath, meta);
  return meta;
};

const upsertCueFxCacheEntry = async (
  metaPath: string,
  folderIdentity: CueFxCacheFolderKey,
  key: string,
  entry: CueFxCacheEntry
) => {
  const meta = await initCueFxCacheMeta(metaPath, folderIdentity);
  meta.entries[key] = entry;
  await writeCueFxCacheMeta(metaPath, meta);
};

const sameCueFxIdentity = (left: CueFxCacheIdentity, right: CueFxCacheIdentity) =>
  left.baseCueKey === right.baseCueKey;

const shouldRetryEdgeTtsError = (message: string) => {
  return /429|rate limit|throttl|temporar|try again|server is busy|NoAudioReceived/i.test(message);
};

const runEdgeTtsWithRetry = async (
  command: string,
  args: string[],
  onLog?: (chunk: string) => void,
  contextLabel?: string,
  signal?: AbortSignal
) => {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= EDGE_TTS_MAX_RETRIES; attempt += 1) {
    if (signal?.aborted) {
      throw new Error(CANCELLED_ERROR_MESSAGE);
    }
    const attemptLabel = contextLabel ? `${contextLabel} attempt ${attempt}/${EDGE_TTS_MAX_RETRIES}` : `attempt ${attempt}/${EDGE_TTS_MAX_RETRIES}`;
    onLog?.(`EDGE-TTS ${attemptLabel}: ${[command, ...args].join(' ')}
`);
    try {
      await new Promise<void>((resolve, reject) => {
        if (signal?.aborted) {
          reject(new Error(CANCELLED_ERROR_MESSAGE));
          return;
        }
        const proc = spawn(command, args);
        let errorOutput = '';
        let stdOutput = '';
        const handleAbort = () => {
          proc.kill('SIGTERM');
        };
        signal?.addEventListener('abort', handleAbort);
        proc.stdout.on('data', data => {
          stdOutput += data.toString();
        });
        proc.stderr.on('data', data => {
          errorOutput += data.toString();
        });
        proc.on('error', reject);
        proc.on('close', code => {
          signal?.removeEventListener('abort', handleAbort);
          if (signal?.aborted) {
            reject(new Error(CANCELLED_ERROR_MESSAGE));
            return;
          }
          if (code !== 0) {
            const details = [errorOutput, stdOutput].filter(Boolean).join('\n');
            reject(new Error(details || `edge-tts exited with code ${code}`));
            return;
          }
          resolve();
        });
      });
      onLog?.(`EDGE-TTS ${attemptLabel} succeeded\n`);
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      lastError = error instanceof Error ? error : new Error(message);
      if (message === CANCELLED_ERROR_MESSAGE) {
        throw lastError;
      }
      const retryable = shouldRetryEdgeTtsError(message);
      onLog?.(`EDGE-TTS ${attemptLabel} failed: ${message}\n`);
      if (!retryable || attempt >= EDGE_TTS_MAX_RETRIES) {
        break;
      }
      const delay = EDGE_TTS_RETRY_DELAY_MS * (2 ** (attempt - 1));
      onLog?.(`EDGE-TTS ${attemptLabel} retrying after ${delay}ms\n`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw lastError ?? new Error('edge-tts failed after retries');
};

const runTtsTask = async (inputFullPath: string, outputDir: string, options?: {
  voice?: string;
  rate?: number;
  pitch?: number;
  overlapMode?: 'overlap' | 'truncate';
  removeLineBreaks?: boolean;
  onProgress?: (completed: number, total: number) => void;
  onLog?: (chunk: string) => void;
  signal?: AbortSignal;
}): Promise<TtsTaskResult> => {
  const ext = path.extname(inputFullPath).toLowerCase();
  if (!SUB_EXT.has(ext)) {
    throw new Error('TTS input must be a subtitle file');
  }
  const ttsSettings = normalizeTtsOutputSettings(options);
  const removeLineBreaks = ttsSettings.removeLineBreaks;
  const raw = await fs.readFile(inputFullPath, 'utf-8');
  let cues: SubtitleCue[];
  if (ext === '.sktproject') {
    cues = parseSktProjectCues(raw, removeLineBreaks);
  } else if (ext === '.ass' || ext === '.ssa') {
    cues = parseAssCues(raw, removeLineBreaks);
  } else {
    cues = parseSrtVttCues(raw, removeLineBreaks);
  }
  if (!cues.length) {
    throw new Error('Subtitle file has no usable cues');
  }
  const cueDurations = cues.map(cue => Math.max(0, cue.end - cue.start));
  const audioDurations: number[] = [];
  await fs.mkdir(outputDir, { recursive: true });
  const { outputName, outputSignature } = buildTtsOutputName(inputFullPath, ttsSettings);
  const outputPath = path.join(outputDir, outputName);
  const voice = ttsSettings.voice;
  const fxRate = sanitizeRateFactor(ttsSettings.rate);
  const fxPitch = sanitizePitchSemitones(ttsSettings.pitch);
  const overlapMode = ttsSettings.overlapMode;
  const withFlagValue = (flag: string, value?: string) => {
    if (!value) return [];
    return [`${flag}=${value}`];
  };
  const formatArg = (value: string) => (/[^\w@%+=:,./-]/.test(value) ? JSON.stringify(value) : value);
  const sourceRelativePath = path.relative(MEDIA_VAULT_ROOT, inputFullPath);
  if (sourceRelativePath.startsWith('..') || path.isAbsolute(sourceRelativePath)) {
    throw new Error('TTS input is outside media vault root');
  }
  const projectName = sourceRelativePath.split(path.sep).filter(Boolean)[0];
  if (!projectName) {
    throw new Error('Unable to determine project root for TTS cue cache');
  }
  const projectRoot = path.join(MEDIA_VAULT_ROOT, projectName);
  const cueCacheRoot = path.join(projectRoot, TTS_CUE_CACHE_DIRNAME);
  await fs.mkdir(cueCacheRoot, { recursive: true });
  const cuePaths: string[] = new Array(cues.length);
  const ffmpegPath = await fs.access('/usr/bin/ffmpeg').then(() => '/usr/bin/ffmpeg').catch(() => 'ffmpeg');
  let completedCueCount = 0;
  const processCue = async (i: number) => {
    const cue = cues[i];
    const identity = buildCueCacheIdentity(cue);
    const key = toCueCacheKey(identity);
    const folderKey: CueCacheFolderKey = { voice, removeLineBreaks };
    const { cacheDir, audioPath, tmpAudioPath, metaPath } = buildCueCachePaths(projectRoot, folderKey, key, TTS_CUE_OUTPUT_EXT);
    await fs.mkdir(cacheDir, { recursive: true });
    const meta = await readCueCacheMeta(metaPath);
    const entry = meta?.entries[key];
    const reusable = await fileExists(audioPath) && !!entry;
    let sourceCuePath = audioPath;
    let sourceDuration = 0;
    let sourceSampleRate = 0;
    if (reusable) {
      const durationFromMeta = Number(entry.durationSeconds);
      if (Number.isFinite(durationFromMeta) && durationFromMeta > 0) {
        sourceDuration = durationFromMeta;
      } else {
        const duration = await runFfprobe(audioPath).catch(() => 0);
        sourceDuration = duration;
      }
      sourceSampleRate = TTS_INTERNAL_SAMPLE_RATE;
      options?.onLog?.(`CACHE HIT (tts cue raw ${i + 1}/${cues.length}): ${path.relative(projectRoot, audioPath)}\n`);
    } else {
      const args = [
        '--text',
        cue.text,
        '--voice',
        voice,
        '--write-media',
        tmpAudioPath
      ];
      const commandLine = [EDGE_TTS_CMD, ...args].map(formatArg).join(' ');
      options?.onLog?.(`COMMAND (tts cue raw ${i + 1}/${cues.length}): ${commandLine}\n`);
      if (options?.signal?.aborted) throw new Error(CANCELLED_ERROR_MESSAGE);
      await runEdgeTtsWithRetry(EDGE_TTS_CMD, args, options?.onLog, `tts cue ${i + 1}/${cues.length}`, options?.signal);
      const normalizedPath = `${tmpAudioPath}.norm.wav`;
      try {
        const normalizeArgs = [
          '-y',
          '-i',
          tmpAudioPath,
          '-vn',
          '-af',
          'dynaudnorm=f=500:g=31:p=0.95:m=5',
          '-ar',
          String(TTS_INTERNAL_SAMPLE_RATE),
          '-ac',
          String(TTS_INTERNAL_CHANNELS),
          '-c:a',
          'pcm_s16le',
          normalizedPath
        ];
        const normalizeCommand = [ffmpegPath, ...normalizeArgs].map(formatArg).join(' ');
        options?.onLog?.(`COMMAND (ffmpeg cue normalize ${i + 1}/${cues.length}): ${normalizeCommand}\n`);
        if (options?.signal?.aborted) throw new Error(CANCELLED_ERROR_MESSAGE);
        await new Promise<void>((resolve, reject) => {
          if (options?.signal?.aborted) { reject(new Error(CANCELLED_ERROR_MESSAGE)); return; }
          const proc = spawn(ffmpegPath, normalizeArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
          let stderr = '';
          const handleAbort = () => { proc.kill('SIGTERM'); };
          options?.signal?.addEventListener('abort', handleAbort);
          proc.stderr.on('data', data => {
            stderr += data.toString();
          });
          proc.on('error', reject);
          proc.on('close', code => {
            options?.signal?.removeEventListener('abort', handleAbort);
            if (options?.signal?.aborted) { reject(new Error(CANCELLED_ERROR_MESSAGE)); return; }
            if (code === 0) resolve();
            else reject(new Error(stderr.trim() || `ffmpeg (cue normalize) exited with code ${code}`));
          });
        });
        await fs.rename(normalizedPath, audioPath);
      } finally {
        await fs.rm(tmpAudioPath, { force: true }).catch(() => null);
        await fs.rm(normalizedPath, { force: true }).catch(() => null);
      }
      sourceDuration = await runFfprobe(audioPath).catch(() => 0);
      sourceSampleRate = TTS_INTERNAL_SAMPLE_RATE;
      await upsertCueCacheEntry(metaPath, folderKey, key, {
        createdAt: new Date().toISOString(),
        durationSeconds: sourceDuration
      });
    }

    const cueFxFilter = buildCueFxFilter(fxRate, fxPitch, sourceSampleRate);

    if (!cueFxFilter) {
      cuePaths[i] = sourceCuePath;
      audioDurations[i] = sourceDuration;
      completedCueCount += 1;
      options?.onProgress?.(completedCueCount, cues.length);
      return;
    }

    const rawFolderHash = toCueFolderKey(folderKey);
    const fxFolderKey: CueFxCacheFolderKey = {
      rawFolderHash,
      rate: roundFactor(fxRate),
      pitch: roundFactor(fxPitch),
      outputExt: TTS_CUE_OUTPUT_EXT
    };
    const fxIdentity: CueFxCacheIdentity = { baseCueKey: key };
    const fxKey = toCueFxCacheKey(fxIdentity);
    const fxPaths = buildCueFxCachePaths(projectRoot, rawFolderHash, fxFolderKey, fxKey, TTS_CUE_OUTPUT_EXT);
    await fs.mkdir(fxPaths.cacheDir, { recursive: true });
    const fxMeta = await readCueFxCacheMeta(fxPaths.metaPath);
    const fxEntry = fxMeta?.entries[fxKey];
    const fxReusable = await fileExists(fxPaths.audioPath) && !!fxEntry;

    if (fxReusable) {
      cuePaths[i] = fxPaths.audioPath;
      const durationFromMeta = Number(fxEntry.durationSeconds);
      if (Number.isFinite(durationFromMeta) && durationFromMeta > 0) {
        audioDurations[i] = durationFromMeta;
      } else {
        const duration = await runFfprobe(fxPaths.audioPath).catch(() => 0);
        audioDurations[i] = duration;
      }
      options?.onLog?.(`CACHE HIT (tts cue fx ${i + 1}/${cues.length}): ${path.relative(projectRoot, fxPaths.audioPath)}\n`);
      completedCueCount += 1;
      options?.onProgress?.(completedCueCount, cues.length);
      return;
    }

    const fxArgs = [
      '-y',
      '-i',
      sourceCuePath,
      '-vn',
      '-filter:a',
      cueFxFilter,
      '-ar',
      String(TTS_INTERNAL_SAMPLE_RATE),
      '-ac',
      String(TTS_INTERNAL_CHANNELS),
      '-c:a',
      'pcm_s16le',
      fxPaths.tmpAudioPath
    ];
    const fxCommand = [ffmpegPath, ...fxArgs].map(formatArg).join(' ');
    options?.onLog?.(`COMMAND (ffmpeg cue fx ${i + 1}/${cues.length}): ${fxCommand}\n`);
    if (options?.signal?.aborted) throw new Error(CANCELLED_ERROR_MESSAGE);
    await new Promise<void>((resolve, reject) => {
      if (options?.signal?.aborted) { reject(new Error(CANCELLED_ERROR_MESSAGE)); return; }
      const proc = spawn(ffmpegPath, fxArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
      let stderr = '';
      const handleAbort = () => { proc.kill('SIGTERM'); };
      options?.signal?.addEventListener('abort', handleAbort);
      proc.stderr.on('data', data => {
        stderr += data.toString();
      });
      proc.on('error', reject);
      proc.on('close', code => {
        options?.signal?.removeEventListener('abort', handleAbort);
        if (options?.signal?.aborted) { reject(new Error(CANCELLED_ERROR_MESSAGE)); return; }
        if (code === 0) resolve();
        else reject(new Error(stderr.trim() || `ffmpeg (cue fx) exited with code ${code}`));
      });
    });
    await fs.rename(fxPaths.tmpAudioPath, fxPaths.audioPath);
    const fxDuration = await runFfprobe(fxPaths.audioPath).catch(() => 0);
    await upsertCueFxCacheEntry(fxPaths.metaPath, fxFolderKey, fxKey, {
      createdAt: new Date().toISOString(),
      durationSeconds: fxDuration
    });
    cuePaths[i] = fxPaths.audioPath;
    audioDurations[i] = fxDuration;
    completedCueCount += 1;
    options?.onProgress?.(completedCueCount, cues.length);
  };

  const workerCount = Math.min(TTS_CUE_CONCURRENCY, cues.length);
  const workers = Array.from({ length: workerCount }, (_entry, workerIndex) => (async () => {
    for (let i = workerIndex; i < cues.length; i += workerCount) {
      await processCue(i);
    }
  })());
  await Promise.all(workers);

  if (cuePaths.some(entry => !entry)) {
    throw new Error('Some TTS cues were not processed');
  }

  const usableCueIndices = cues.flatMap((cue, index) => {
    const cueDuration = Math.max(0, cueDurations[index] ?? (cue.end - cue.start));
    const audioDuration = Math.max(0, audioDurations[index] ?? cueDuration);
    const effectiveDuration = overlapMode === 'truncate' ? Math.min(audioDuration, cueDuration) : audioDuration;
    return effectiveDuration > MIX_TIMING_EPSILON ? [index] : [];
  });
  if (!usableCueIndices.length) {
    throw new Error('No usable cue audio to mix');
  }
  const cueEffectiveDurations = cues.map((cue, index) => {
    const cueDuration = Math.max(0, cueDurations[index] ?? (cue.end - cue.start));
    const audioDuration = Math.max(0, audioDurations[index] ?? cueDuration);
    return overlapMode === 'truncate' ? Math.min(audioDuration, cueDuration) : audioDuration;
  });
  const cueStartSamples = cues.map(cue => Math.max(0, Math.round(cue.start * TTS_INTERNAL_SAMPLE_RATE)));
  const cueEffectiveDurationSamples = cueEffectiveDurations.map(duration =>
    Math.max(0, Math.round(duration * TTS_INTERNAL_SAMPLE_RATE))
  );
  const timelineEndSamples = usableCueIndices.reduce((acc, cueIndex) => {
    const cueEndSample = cueStartSamples[cueIndex] + Math.max(0, cueEffectiveDurationSamples[cueIndex] ?? 0);
    return Math.max(acc, cueEndSample);
  }, 0);
  const debugLog = (message: string) => {
    if (!TTS_DEBUG_TIMING) return;
    options?.onLog?.(`[TTS_DEBUG] ${message}\n`);
  };
  if (TTS_DEBUG_TIMING) {
    const pick = Array.from(new Set([
      usableCueIndices[0],
      usableCueIndices[Math.floor(usableCueIndices.length / 2)],
      usableCueIndices[usableCueIndices.length - 1]
    ].filter((entry): entry is number => Number.isFinite(entry))));
    debugLog(
      `timeline samples: sampleRate=${TTS_INTERNAL_SAMPLE_RATE}, cues=${cues.length}, usableCues=${usableCueIndices.length}, timelineEndSamples=${timelineEndSamples}, timelineEndSeconds=${(timelineEndSamples / TTS_INTERNAL_SAMPLE_RATE).toFixed(6)}`
    );
    pick.forEach(cueIndex => {
      const cue = cues[cueIndex];
      const startSample = cueStartSamples[cueIndex];
      const durationSample = cueEffectiveDurationSamples[cueIndex];
      debugLog(
        `cue#${cueIndex + 1}: start=${cue.start.toFixed(3)}s(${startSample}), end=${cue.end.toFixed(3)}s, effectiveSamples=${durationSample}, textLen=${cue.text.length}`
      );
    });
  }
  if (timelineEndSamples <= 0) {
    throw new Error('No usable cue audio to mix');
  }
  const segmentLengthSamples = Math.max(1, Math.round(TTS_MIX_SEGMENT_SECONDS * TTS_INTERNAL_SAMPLE_RATE));
  const segmentCount = Math.max(1, Math.ceil(timelineEndSamples / segmentLengthSamples));
  const segmentDir = path.join(
    cueCacheRoot,
    `mix-segments-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  );
  await fs.mkdir(segmentDir, { recursive: true });
  const segmentPaths: string[] = [];
  const segmentDurationsSeconds: number[] = [];
  try {
    for (let segmentIndex = 0; segmentIndex < segmentCount; segmentIndex += 1) {
      const t0Sample = segmentIndex * segmentLengthSamples;
      const t1Sample = Math.min(timelineEndSamples, t0Sample + segmentLengthSamples);
      const segmentDurationSamples = Math.max(1, t1Sample - t0Sample);
      const segmentPath = path.join(segmentDir, `segment-${String(segmentIndex).padStart(4, '0')}.wav`);
      const cuesInSegment = usableCueIndices.filter(cueIndex => {
        const cueStartSample = cueStartSamples[cueIndex];
        const cueEndSample = cueStartSample + Math.max(0, cueEffectiveDurationSamples[cueIndex] ?? 0);
        return cueEndSample > t0Sample && cueStartSample < t1Sample;
      });

      const inputArgs: string[] = [
        '-f',
        'lavfi',
        '-i',
        `anullsrc=r=${TTS_INTERNAL_SAMPLE_RATE}:cl=mono`
      ];
      const filterChains: string[] = [
        `[0:a]atrim=start_sample=0:end_sample=${segmentDurationSamples},asetpts=PTS-STARTPTS[base]`
      ];
      const mixInputs: string[] = ['[base]'];
      let inputIndex = 1;

      usableCueIndices.forEach(cueIndex => {
        const effectiveDurationSamples = Math.max(0, cueEffectiveDurationSamples[cueIndex] ?? 0);
        if (effectiveDurationSamples <= 0) return;
        const cueStartSample = cueStartSamples[cueIndex];
        const cueEndSample = cueStartSample + effectiveDurationSamples;
        if (cueEndSample <= t0Sample || cueStartSample >= t1Sample) return;

        const sourceTrimStartSamples = Math.max(0, t0Sample - cueStartSample);
        const playStartSample = Math.max(cueStartSample, t0Sample);
        const playEndSample = Math.min(cueEndSample, t1Sample);
        const playDurationSamples = Math.max(0, playEndSample - playStartSample);
        if (playDurationSamples <= 0) return;

        const delaySamples = Math.max(0, playStartSample - t0Sample);
        const trimEndSample = sourceTrimStartSamples + playDurationSamples;
        inputArgs.push('-i', cuePaths[cueIndex]);
        filterChains.push(
          `[${inputIndex}:a]atrim=start_sample=${sourceTrimStartSamples}:end_sample=${trimEndSample},asetpts=PTS-STARTPTS,adelay=${delaySamples}S|${delaySamples}S,aresample=${TTS_INTERNAL_SAMPLE_RATE},apad=whole_len=${segmentDurationSamples}[a${inputIndex}]`
        );
        mixInputs.push(`[a${inputIndex}]`);
        inputIndex += 1;
      });

      const nInputs = mixInputs.length;
      const filter = [
        ...filterChains,
        `${mixInputs.join('')}amix=inputs=${nInputs}:duration=longest:dropout_transition=0[mix_raw]`,
        `[mix_raw]volume=${nInputs.toFixed(4)},alimiter=limit=0.97[out]`
      ].join(';');
      const filterScriptPath = path.join(
        cueCacheRoot,
        `mix-filter-segment-${segmentIndex + 1}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.ffgraph`
      );
      await fs.writeFile(filterScriptPath, filter, 'utf-8');
      const ffmpegArgs = [
        '-y',
        ...inputArgs,
        '-filter_complex_script',
        filterScriptPath,
        '-map',
        '[out]',
        '-c:a',
        'pcm_s16le',
        '-ar',
        String(TTS_INTERNAL_SAMPLE_RATE),
        '-ac',
        String(TTS_INTERNAL_CHANNELS),
        segmentPath
      ];
      const ffmpegCommand = [ffmpegPath, ...ffmpegArgs].map(formatArg).join(' ');
      options?.onLog?.(`COMMAND (ffmpeg mix segment ${segmentIndex + 1}/${segmentCount}): ${ffmpegCommand}\n`);
      if (options?.signal?.aborted) throw new Error(CANCELLED_ERROR_MESSAGE);
      try {
        await new Promise<void>((resolve, reject) => {
          if (options?.signal?.aborted) { reject(new Error(CANCELLED_ERROR_MESSAGE)); return; }
          const proc = spawn(ffmpegPath, ffmpegArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
          let stderr = '';
          const handleAbort = () => { proc.kill('SIGTERM'); };
          options?.signal?.addEventListener('abort', handleAbort);
          proc.stderr.on('data', data => {
            stderr += data.toString();
          });
          proc.on('error', reject);
          proc.on('close', code => {
            options?.signal?.removeEventListener('abort', handleAbort);
            if (options?.signal?.aborted) { reject(new Error(CANCELLED_ERROR_MESSAGE)); return; }
            if (code === 0) resolve();
            else reject(new Error(stderr.trim() || `ffmpeg exited with code ${code}`));
          });
        });
        if (TTS_DEBUG_TIMING) {
          const actualDuration = await runFfprobe(segmentPath).catch(() => 0);
          debugLog(
            `segment#${segmentIndex + 1}/${segmentCount}: t0=${t0Sample}, t1=${t1Sample}, expected=${(segmentDurationSamples / TTS_INTERNAL_SAMPLE_RATE).toFixed(6)}s, actual=${actualDuration.toFixed(6)}s, cues=${cuesInSegment.length}`
          );
        }
      } finally {
        await fs.rm(filterScriptPath, { force: true }).catch(() => null);
      }
      segmentPaths.push(segmentPath);
      segmentDurationsSeconds.push(segmentDurationSamples / TTS_INTERNAL_SAMPLE_RATE);
    }

    const concatListPath = path.join(segmentDir, 'concat.txt');
    const concatLines = segmentPaths.flatMap((segmentPath, index) => {
      const duration = segmentDurationsSeconds[index] ?? 0;
      return [
        `file '${escapeConcatFilePath(segmentPath)}'`,
        `duration ${duration.toFixed(6)}`
      ];
    });
    await fs.writeFile(concatListPath, `${concatLines.join('\n')}\n`, 'utf-8');
    const concatArgs = [
      '-y',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      concatListPath,
      '-c:a',
      'libmp3lame',
      '-b:a',
      `${TTS_MP3_BITRATE_KBPS}k`,
      '-ar',
      String(TTS_INTERNAL_SAMPLE_RATE),
      '-ac',
      String(TTS_INTERNAL_CHANNELS),
      outputPath
    ];
    const concatCommand = [ffmpegPath, ...concatArgs].map(formatArg).join(' ');
    options?.onLog?.(`COMMAND (ffmpeg concat tts segments): ${concatCommand}\n`);
    if (options?.signal?.aborted) throw new Error(CANCELLED_ERROR_MESSAGE);
    await new Promise<void>((resolve, reject) => {
      if (options?.signal?.aborted) { reject(new Error(CANCELLED_ERROR_MESSAGE)); return; }
      const proc = spawn(ffmpegPath, concatArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
      let stderr = '';
      const handleAbort = () => { proc.kill('SIGTERM'); };
      options?.signal?.addEventListener('abort', handleAbort);
      proc.stderr.on('data', data => {
        stderr += data.toString();
      });
      proc.on('error', reject);
      proc.on('close', code => {
        options?.signal?.removeEventListener('abort', handleAbort);
        if (options?.signal?.aborted) { reject(new Error(CANCELLED_ERROR_MESSAGE)); return; }
        if (code === 0) resolve();
        else reject(new Error(stderr.trim() || `ffmpeg exited with code ${code}`));
      });
    });
    if (TTS_DEBUG_TIMING) {
      const expectedDuration = segmentDurationsSeconds.reduce((acc, value) => acc + value, 0);
      const actualDuration = await runFfprobe(outputPath).catch(() => 0);
      const streamInfo = await runFfprobeStreamSamples(outputPath).catch(() => ({ durationTs: 0, sampleRate: 0, timeBase: '0/1' }));
      const expectedSamples = Math.round(expectedDuration * TTS_INTERNAL_SAMPLE_RATE);
      const [tbNumRaw, tbDenRaw] = streamInfo.timeBase.split('/');
      const tbNum = Number.parseInt(tbNumRaw ?? '', 10);
      const tbDen = Number.parseInt(tbDenRaw ?? '', 10);
      const durationFromTsSeconds = tbDen > 0
        ? streamInfo.durationTs * (Number.isFinite(tbNum) ? tbNum : 0) / tbDen
        : 0;
      const streamSamples = Math.round(durationFromTsSeconds * Math.max(1, streamInfo.sampleRate || TTS_INTERNAL_SAMPLE_RATE));
      debugLog(
        `concat final: segments=${segmentPaths.length}, expected=${expectedDuration.toFixed(6)}s, actual=${actualDuration.toFixed(6)}s, diff=${(actualDuration - expectedDuration).toFixed(6)}s`
      );
      debugLog(
        `concat final stream: expectedSamples@${TTS_INTERNAL_SAMPLE_RATE}=${expectedSamples}, durationTs=${streamInfo.durationTs}, timeBase=${streamInfo.timeBase}, streamSampleRate=${streamInfo.sampleRate}, streamSamples=${streamSamples}, sampleDiff=${streamSamples - expectedSamples}`
      );
    }
  } finally {
    await fs.rm(segmentDir, { recursive: true, force: true }).catch(() => null);
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
    outputSignature,
    voice,
    rate: ttsSettings.rate,
    pitch: ttsSettings.pitch,
    overlapSeconds,
    overlapMode,
    removeLineBreaks
  };
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

    if (folderFiles.length > 0) {
      const projectMeta = await readProjectMeta(folderPath);
      folders.push({
        name: entry.name,
        path: folderPath,
        files: folderFiles,
        status: projectMeta.status ?? 'todo',
      });
    }
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

app.put('/api/vault/project/status', async (req, res) => {
  const projectNameRaw = typeof req.body?.projectName === 'string' ? req.body.projectName.trim() : '';
  const statusRaw = typeof req.body?.status === 'string' ? req.body.status.trim() : '';
  const validStatuses = ['todo', 'in progress', 'done', 'closed'];

  if (!projectNameRaw) {
    res.status(400).json({ error: 'Missing projectName' });
    return;
  }
  if (!validStatuses.includes(statusRaw)) {
    res.status(400).json({ error: 'Invalid status' });
    return;
  }

  const safeProjectName = sanitizeProjectName(projectNameRaw);
  if (!safeProjectName || safeProjectName !== projectNameRaw) {
    res.status(400).json({ error: 'Invalid project name' });
    return;
  }

  const folderPath = path.join(MEDIA_VAULT_ROOT, safeProjectName);
  const rootPath = path.resolve(MEDIA_VAULT_ROOT);
  const resolvedFolderPath = path.resolve(folderPath);
  if (!resolvedFolderPath.startsWith(`${rootPath}${path.sep}`)) {
    res.status(400).json({ error: 'Invalid project path' });
    return;
  }

  try {
    const stats = await fs.stat(resolvedFolderPath);
    if (!stats.isDirectory()) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
  } catch {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  try {
    const meta = await readProjectMeta(resolvedFolderPath);
    meta.status = statusRaw;
    await writeProjectMeta(resolvedFolderPath, meta);
    res.json({ success: true, status: statusRaw });
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

app.delete('/api/vault/file', async (req, res) => {
  const relativePathRaw = typeof req.body?.relativePath === 'string' ? req.body.relativePath.trim() : '';
  if (!relativePathRaw) {
    res.status(400).json({ error: 'Missing relativePath' });
    return;
  }
  const normalized = relativePathRaw.replace(/\\/g, '/');
  const fullPath = safeResolvePath(normalized);
  if (!fullPath) {
    res.status(400).json({ error: 'Invalid file path' });
    return;
  }
  let stats: { isFile: () => boolean };
  try {
    stats = await fs.stat(fullPath);
  } catch {
    res.status(404).json({ error: 'File not found' });
    return;
  }
  if (!stats.isFile()) {
    res.status(400).json({ error: 'Target is not a file' });
    return;
  }
  try {
    await fs.rm(fullPath, { force: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to delete file';
    res.status(500).json({ error: message });
    return;
  }

  const projectName = normalized.split('/')[0];
  if (projectName) {
    const projectRoot = path.join(MEDIA_VAULT_ROOT, projectName);
    const writeMetaFile = async (filename: 'uvr.json' | 'tts.json', data: Record<string, VaultFileDTO['uvr'] | VaultFileDTO['tts']>) => {
      const metaDir = path.join(projectRoot, '.mediaforge');
      const metaFile = path.join(metaDir, filename);
      await fs.mkdir(metaDir, { recursive: true });
      await fs.writeFile(metaFile, JSON.stringify(data, null, 2), 'utf-8');
    };
    try {
      const [uvrMeta, ttsMeta] = await Promise.all([
        readProjectUvrMeta(projectRoot),
        readProjectTtsMeta(projectRoot)
      ]);
      let uvrChanged = false;
      let ttsChanged = false;

      if (uvrMeta[normalized]) {
        delete uvrMeta[normalized];
        uvrChanged = true;
      }
      Object.keys(uvrMeta).forEach(key => {
        const entry = uvrMeta[key];
        if (!entry?.outputs?.length) return;
        const nextOutputs = entry.outputs.filter(output => output !== normalized);
        if (nextOutputs.length !== entry.outputs.length) {
          uvrMeta[key] = { ...entry, outputs: nextOutputs };
          uvrChanged = true;
        }
      });

      if (ttsMeta[normalized]) {
        delete ttsMeta[normalized];
        ttsChanged = true;
      }
      Object.keys(ttsMeta).forEach(key => {
        const entry = ttsMeta[key];
        const nextOutputs = entry?.outputs?.filter(output => output !== normalized) ?? [];
        const outputRemoved = (entry?.outputs?.length ?? 0) !== nextOutputs.length;
        const nextOutputDetails = { ...(entry?.outputDetails ?? {}) };
        const hadDetail = Object.prototype.hasOwnProperty.call(nextOutputDetails, normalized);
        if (hadDetail) delete nextOutputDetails[normalized];
        if (outputRemoved || hadDetail) {
          ttsMeta[key] = { ...entry, outputs: nextOutputs, outputDetails: nextOutputDetails };
          ttsChanged = true;
        }
      });

      if (uvrChanged) {
        await writeMetaFile('uvr.json', uvrMeta);
      }
      if (ttsChanged) {
        await writeMetaFile('tts.json', ttsMeta);
      }
    } catch {
      // Ignore metadata cleanup failures; file deletion succeeded.
    }
  }

  res.json({ ok: true, relativePath: normalized });
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

app.get('/api/auth/me', (req, res) => {
  const session = (req as any).authUser as AuthSession | undefined;
  if (!session) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }
  return res.json({
    ok: true,
    user: { id: session.userId, username: session.username, createdAt: session.createdAt }
  });
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

app.get('/api/jobs', async (req, res) => {
  // Pagination support
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
  const search = (req.query.search as string || '').trim().toLowerCase();
  const statusFilter = (req.query.status as string || '').trim();
  const pipelineFilter = (req.query.pipeline as string || '').trim();
  const fileFilter = (req.query.file as string || '').trim();

  // Filter jobs by search keyword
  let filteredJobs = jobs;
  if (search) {
    filteredJobs = filteredJobs.filter(job =>
      job.name?.toLowerCase().includes(search) ||
      job.projectName?.toLowerCase().includes(search) ||
      job.fileName?.toLowerCase().includes(search)
    );
  }

  // Filter jobs by status
  if (statusFilter) {
    const allowedStatuses = statusFilter.split(',').filter(Boolean);
    if (allowedStatuses.length > 0) {
      filteredJobs = filteredJobs.filter(job => allowedStatuses.includes(job.status));
    }
  }

  // Filter jobs by file path (matches inputRelativePath or translate.subtitleFile)
  if (fileFilter) {
    filteredJobs = filteredJobs.filter(job =>
      (job as any).inputRelativePath === fileFilter ||
      job.params?.translate?.subtitleFile === fileFilter ||
      job.params?.inputRelativePath === fileFilter
    );
  }

  // Filter jobs by pipeline type (check if any task type matches)
  if (pipelineFilter) {
    const allowedTypes = pipelineFilter.split(',').filter(Boolean);
    if (allowedTypes.length > 0) {
      filteredJobs = filteredJobs.filter(job => 
        job.tasks?.some(task => {
          // For 'download', match both 'download' and all sub-types (download_subs, download_video, etc.)
          return allowedTypes.some(allowed => 
            task.type === allowed || 
            (allowed === 'download' && task.type.startsWith('download_'))
          );
        })
      );
    }
  }
  
  const offset = (page - 1) * limit;
  const total = filteredJobs.length;
  const totalPages = Math.ceil(total / limit) || 1;
  const pagedJobs = filteredJobs.slice(offset, offset + limit);

  // Return summary-only (without params, tasks details)
  const jobSummaries = pagedJobs.map(job => {
    const { fullPath, filename } = getJobLogPath(job);
    let logFile = existsSync(fullPath) ? filename : null;
    
    // Fallback to YYYY-MM structure if not found in YYYY-MM-DD
    if (!logFile) {
      const date = new Date(job.createdAt);
      const monthDir = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const monthPath = path.join(JOB_LOGS_DIR, monthDir, filename);
      if (existsSync(monthPath)) logFile = filename;
    }

    const truncatedError = job.error && job.error.length > 200 
      ? job.error.slice(0, 200) + '...(truncated)'
      : job.error;
    return {
      id: job.id,
      name: job.name,
      projectName: job.projectName,
      fileName: job.fileName,
      fileSize: job.fileSize,
      status: job.status,
      progress: job.progress,
      eta: job.eta,
      tasks: job.tasks,
      taskCount: job.tasks.length,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      durationMs: job.durationMs,
      error: truncatedError,
      logFile,
      params: job.params
    };
  });
  res.json({ jobs: jobSummaries, total, page, limit, totalPages, now: new Date().toISOString() });
});

// Get server statistics for dashboard metrics (system health + job stats)
// Uses cache with 5-second minimum interval to prevent excessive calculations
app.get('/api/stats', async (req, res) => {
  const now = Date.now();
  
  // Check if cache is still valid (within 5 seconds)
  if (statsCache && (now - statsCache.timestamp) < STATS_CACHE_MIN_INTERVAL_MS) {
    // Return cached data but update the 'now' field to current time
    // This gives clients accurate timestamp while avoiding recalculation
    res.json({
      ...statsCache.data,
      now: new Date().toISOString()
    });
    return;
  }
  
  // Cache is stale or doesn't exist, recalculate
  const currentTime = new Date();
  
  // 1. System Metrics: Real CPU and RAM usage
  const cpuUsage = getCpuUsage();
  const memoryUsage = getMemoryUsage();
  const cpuCount = getCpuCount();
  
  // 2. Active Workload: Count jobs by status
  const activeJobs = jobs.filter(job => job.status === 'processing');
  const queuedJobs = jobs.filter(job => job.status === 'queued');
  
  // 3. Processing Efficiency: Average duration of completed jobs
  const completedJobs = jobs.filter(job => job.status === 'completed' && job.durationMs);
  const avgDurationMs = completedJobs.length > 0
    ? completedJobs.reduce((acc, job) => acc + (job.durationMs || 0), 0) / completedJobs.length
    : 0;
  
  const statsData = {
    now: currentTime.toISOString(),
    systemHealth: {
      cpu: {
        usage: cpuUsage,
        cores: cpuCount
      },
      memory: {
        usedPercent: memoryUsage.usedPercent,
        usedGB: memoryUsage.usedGB,
        totalGB: memoryUsage.totalGB
      }
    },
    efficiency: {
      avgDurationMs
    },
    workload: {
      activeJobs: activeJobs.length,
      queuedJobs: queuedJobs.length
    }
  };
  
  // Update cache
  statsCache = {
    data: statsData,
    timestamp: now
  };
  
  res.json(statsData);
});

// Get full job details by ID
app.get('/api/jobs/:id', async (req, res) => {
  const { id } = req.params;
  const job = getJobById(id);
  
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  const { fullPath, filename } = getJobLogPath(job);
  let logFile = existsSync(fullPath) ? filename : null;

  // Fallback to YYYY-MM structure if not found in YYYY-MM-DD
  if (!logFile) {
    const date = new Date(job.createdAt);
    const monthDir = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const monthPath = path.join(JOB_LOGS_DIR, monthDir, filename);
    if (existsSync(monthPath)) logFile = filename;
  }

  const truncatedError = job.error && job.error.length > 500 
    ? job.error.slice(0, 500) + '...(truncated, see log file for full error)'
    : job.error;

  res.json({
    id: job.id,
    name: job.name,
    projectName: job.projectName,
    fileName: job.fileName,
    fileSize: job.fileSize,
    status: job.status,
    progress: job.progress,
    eta: job.eta,
    tasks: job.tasks,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    // Include processed/total from first translate task if available
    processed: job.tasks?.find((t: any) => t.type === 'translate')?.processed,
    total: job.tasks?.find((t: any) => t.type === 'translate')?.total,
    finishedAt: job.finishedAt,
    durationMs: job.durationMs,
    error: truncatedError,
    logFile,
    params: job.params
  });
});

app.get('/api/jobs/:id/log', async (req, res) => {
  const { id } = req.params;
  const job = getJobById(id);
  
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  const { fullPath, filename } = getJobLogPath(job);
  
  if (!existsSync(fullPath)) {
    // Try YYYY-MM structure fallback
    const date = new Date(job.createdAt);
    const monthDir = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const monthPath = path.join(JOB_LOGS_DIR, monthDir, filename);
    if (existsSync(monthPath)) {
      res.type('text/plain');
      return createReadStream(monthPath).pipe(res);
    }

    // If structured file doesn't exist, try legacy flat path as fallback
    const legacyPath = path.join(JOB_LOGS_DIR, `${id}.log`);
    if (existsSync(legacyPath)) {
      res.type('text/plain');
      return createReadStream(legacyPath).pipe(res);
    }

    // If still no file, try memory/DB
    if (job.log) {
      return res.type('text/plain').send(job.log);
    }
    return res.status(404).json({ error: 'Log file not found' });
  }

  res.type('text/plain');
  const stream = createReadStream(fullPath);
  stream.pipe(res);
});

app.get('/api/render-templates', async (_req, res) => {
  try {
    const result = db.exec('SELECT id, name, config_json, updated_at FROM render_templates ORDER BY updated_at DESC');
    const rows = result[0]?.values ?? [];
    const templates = rows.map((row: any[]) => {
      const [id, name, configJson, updatedAt] = row;
      let config: any = null;
      try {
        config = JSON.parse(String(configJson));
      } catch {
        config = null;
      }
      return {
        id: String(id),
        name: String(name),
        updatedAt,
        config
      };
    }).filter((entry: any) => entry.config);
    res.json({ templates });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load templates';
    res.status(500).json({ error: message });
  }
});

app.post('/api/render-templates', async (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const config = typeof req.body?.config === 'object' && req.body.config ? req.body.config : null;
  const id = Number.isFinite(Number(req.body?.id)) ? Number(req.body.id) : null;
  if (!name || !config) {
    res.status(400).json({ error: 'Missing name or config' });
    return;
  }
  try {
    const updatedAt = new Date().toISOString();
    if (id) {
      db.run(
        `UPDATE render_templates
         SET name = ?, config_json = ?, updated_at = ?
         WHERE id = ?`,
        [name, JSON.stringify(config), updatedAt, id]
      );
      await persistDb();
      res.json({ template: { id: String(id), name, updatedAt, config } });
      return;
    }
    db.run(
      `INSERT INTO render_templates (name, config_json, updated_at)
       VALUES (?, ?, ?)`,
      [name, JSON.stringify(config), updatedAt]
    );
    await persistDb();
    const idRow = db.exec('SELECT last_insert_rowid() as id');
    const nextId = idRow[0]?.values?.[0]?.[0] ?? null;
    res.json({ template: { id: String(nextId), name, updatedAt, config } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to save template';
    res.status(500).json({ error: message });
  }
});

app.delete('/api/render-templates/:id', async (req, res) => {
  const id = Number(req.params?.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: 'Missing id' });
    return;
  }
  try {
    db.run('DELETE FROM render_templates WHERE id = ?', [id]);
    await persistDb();
    res.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to delete template';
    res.status(500).json({ error: message });
  }
});

app.get('/api/task-templates', async (_req, res) => {
  try {
    const result = db.exec(
      'SELECT id, name, task_type, params_json, updated_at FROM task_templates ORDER BY updated_at DESC'
    );
    const rows = result[0]?.values ?? [];
    const templates = rows.map((row: any[]) => {
      const [id, name, taskType, paramsJson, updatedAt] = row;
      let params: any = null;
      try {
        params = JSON.parse(String(paramsJson));
      } catch {
        params = null;
      }
      return {
        id: String(id),
        name: String(name),
        taskType: String(taskType),
        updatedAt,
        params
      };
    }).filter((entry: any) => entry.params && typeof entry.params === 'object');
    res.json({ templates });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load task templates';
    res.status(500).json({ error: message });
  }
});

app.post('/api/task-templates', async (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const taskType = typeof req.body?.taskType === 'string' ? req.body.taskType.trim() : '';
  const params = typeof req.body?.params === 'object' && req.body.params ? req.body.params : null;
  const id = Number.isFinite(Number(req.body?.id)) ? Number(req.body.id) : null;
  if (!name || !params) {
    res.status(400).json({ error: 'Missing name or params' });
    return;
  }
  if (taskType !== 'download' && taskType !== 'uvr' && taskType !== 'tts') {
    res.status(400).json({ error: 'Invalid task type' });
    return;
  }
  try {
    const updatedAt = new Date().toISOString();
    if (id) {
      db.run(
        `UPDATE task_templates
         SET name = ?, task_type = ?, params_json = ?, updated_at = ?
         WHERE id = ?`,
        [name, taskType, JSON.stringify(params), updatedAt, id]
      );
      await persistDb();
      res.json({ template: { id: String(id), name, taskType, updatedAt, params } });
      return;
    }
    db.run(
      `INSERT INTO task_templates (name, task_type, params_json, updated_at)
       VALUES (?, ?, ?, ?)`,
      [name, taskType, JSON.stringify(params), updatedAt]
    );
    await persistDb();
    const idRow = db.exec('SELECT last_insert_rowid() as id');
    const nextId = idRow[0]?.values?.[0]?.[0] ?? null;
    res.json({ template: { id: String(nextId), name, taskType, updatedAt, params } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to save task template';
    res.status(500).json({ error: message });
  }
});

app.delete('/api/task-templates/:id', async (req, res) => {
  const id = Number(req.params?.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: 'Missing id' });
    return;
  }
  try {
    db.run('DELETE FROM task_templates WHERE id = ?', [id]);
    await persistDb();
    res.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to delete task template';
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
  if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled' || job.status === 'stopping') {
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
    appendJobLog(job, `=== JOB CANCELLED (queued) ===\n`);
    scheduleJobPersist(job);
    res.json({ ok: true });
    return;
  }
  job.status = 'stopping';
  job.eta = undefined;
  const controller = (job as any).__abortController as AbortController | undefined;
  controller?.abort();
  const proc = (job as any).__activeProcess as ReturnType<typeof spawn> | undefined;
  proc?.kill('SIGTERM');
  appendJobLog(job, 'Cancel requested. Stopping process...');
  scheduleJobPersist(job);
  res.json({ ok: true });
});

app.post('/api/jobs/:id/retry', async (req, res) => {
  const job = getJobById(req.params.id);
  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }
  if (job.status !== 'failed' && job.status !== 'cancelled') {
    res.status(400).json({ error: 'Only failed or cancelled jobs can be retried' });
    return;
  }

  // Restore internal params from job.params before resetting
  const jobParams = job.params ?? {};
  
  // Restore translate params
  if (jobParams.translate) {
    const t = jobParams.translate;
    if (t.subtitleFile) (job as any).__translateSubtitleFile = t.subtitleFile;
    if (t.preset) (job as any).__translatePreset = t.preset;
    if (t.targetIds) (job as any).__translateTargetIds = t.targetIds;
  }

  // Restore optimize params
  if (jobParams.optimize) {
    const o = jobParams.optimize;
    if (o.subtitleFile) (job as any).__optimizeSubtitleFile = o.subtitleFile;
    if (o.preset) (job as any).__optimizePreset = o.preset;
    if (o.targetIds) (job as any).__optimizeTargetIds = o.targetIds;
    if (o.targetIssues) (job as any).__optimizeTargetIssues = o.targetIssues;
  }

  // Restore render params
  if (jobParams.render?.configV2) {
    (job as any).__renderConfigV2 = jobParams.render.configV2;
  }
  
  // Restore TTS params
  if (jobParams.tts) {
    if (jobParams.tts.voice) (job as any).__ttsVoice = jobParams.tts.voice;
    if (jobParams.tts.rate !== undefined) (job as any).__ttsRate = jobParams.tts.rate;
    if (jobParams.tts.pitch !== undefined) (job as any).__ttsPitch = jobParams.tts.pitch;
    if (jobParams.tts.overlapMode) (job as any).__ttsOverlapMode = jobParams.tts.overlapMode;
    if (jobParams.tts.removeLineBreaks) (job as any).__ttsRemoveLineBreaks = jobParams.tts.removeLineBreaks;
  }
  
  // Restore UVR params
  if (jobParams.uvr) {
    if (jobParams.uvr.backend) (job as any).__backend = jobParams.uvr.backend;
    if (jobParams.uvr.model) (job as any).__model = jobParams.uvr.model;
    if (jobParams.uvr.outputFormat) (job as any).__outputFormat = jobParams.uvr.outputFormat;
  }
  
  // Restore download params
  if (jobParams.download) {
    if (jobParams.download.url) (job as any).__downloadUrl = jobParams.download.url;
    if (jobParams.download.mode) (job as any).__downloadMode = jobParams.download.mode;
    if (jobParams.download.noPlaylist !== undefined) (job as any).__downloadNoPlaylist = jobParams.download.noPlaylist;
    if (jobParams.download.subLangs) (job as any).__downloadSubLangs = jobParams.download.subLangs;
  }
  
  // Restore project paths
  if (jobParams.inputRelativePath) {
    (job as any).__inputRelativePath = jobParams.inputRelativePath;
    const projectName = jobParams.projectName || job.projectName;
    if (projectName) {
      const projectRoot = path.join(MEDIA_VAULT_ROOT, projectName);
      (job as any).__projectRoot = projectRoot;
      (job as any).__projectRelativePath = projectName;
      (job as any).__outputDir = path.join(MEDIA_VAULT_ROOT, projectName, UVR_OUTPUT_DIRNAME);
      // Restore download directories for download jobs
      (job as any).__downloadSourceDir = path.join(projectRoot, 'source');
      (job as any).__downloadRuntimeDir = path.join(projectRoot, '.mediaforge', 'download');
      // Restore UVR runtime directory for UVR jobs
      (job as any).__uvrRuntimeDir = path.join(projectRoot, '.mediaforge', 'uvr');
    }
  }

  // Reset job state
  job.status = 'queued';
  job.progress = 0;
  job.error = undefined;
  job.finishedAt = undefined;
  job.durationMs = undefined;
  job.startedAt = undefined;
  (job as any).__cancelRequested = undefined;
  (job as any).__abortController = undefined;
  (job as any).__activeProcess = undefined;

  // Reset task states
  job.tasks.forEach(task => {
    task.status = 'pending';
    task.progress = 0;
    (task as any).processed = undefined;
    (task as any).total = undefined;
  });

  appendJobLog(job, `=== JOB RETRIED ===\nRe-queued for execution\n`);
  scheduleJobPersist(job);

  // Determine queue based on job type
  const hasDownload = job.tasks.some(t => t.type.startsWith('download'));
  if (hasDownload) {
    downloadQueue.push(job.id);
    setImmediate(processNextDownload);
  } else {
    jobQueue.push(job.id);
    setImmediate(processNextJob);
  }

  res.json({ ok: true, id: job.id });
});

app.post('/api/render-v2/check-status', async (req, res) => {
  const config = req.body?.config as RenderConfigV2;
  const projectName = typeof req.body?.projectName === 'string' ? req.body.projectName.trim() : '';
  if (!config) return res.status(400).json({ error: 'Missing config' });
  try {
    const { signature } = await buildRenderV2Signature(config, MEDIA_VAULT_ROOT, RENDER_V2_SEGMENT_SECONDS);
    let hasCache = false;

    if (projectName) {
      const projectRoot = path.join(MEDIA_VAULT_ROOT, sanitizeProjectName(projectName) || '');
      const cacheRoot = path.join(projectRoot, RENDER_V2_CACHE_DIRNAME, signature);
      try {
        const stats = await fs.stat(cacheRoot);
        if (stats.isDirectory()) {
          hasCache = true;
        }
      } catch {
        // no cache
      }
    }

    // Tìm job gần nhất có cùng signature
    let match: JobRecord | undefined;
    for (const j of jobs) {
      const jRenderParams = (j.params as any)?.render;
      if (!jRenderParams) continue;

      // 1. Kiểm tra signature đã lưu (tối ưu)
      if (jRenderParams.signature === signature) {
        match = j;
        break;
      }

      // 2. Fallback: So sánh cấu hình (phòng trường hợp job cũ chưa có signature trong params)
      const jConfig = jRenderParams.configV2;
      if (jConfig) {
        const { signature: computedSig } = await buildRenderV2Signature(jConfig, MEDIA_VAULT_ROOT, RENDER_V2_SEGMENT_SECONDS);
        if (computedSig === signature) {
          match = j;
          break;
        }
      }
    }

    if (!match) return res.json({ signature, status: 'none', hasCache });
    const isFinished = match.status === 'completed';
    return res.json({ signature, status: isFinished ? 'completed' : 'unfinished', jobId: match.id, hasCache });
  } catch (error) {
    res.status(500).json({ error: 'Internal error' });
  }
});

app.post('/api/jobs/run', async (req, res) => {
  const pipelineIdRaw = req.body?.pipelineId;
  const pipelineId = typeof pipelineIdRaw === 'string' ? pipelineIdRaw : (Number.isFinite(Number(pipelineIdRaw)) ? Number(pipelineIdRaw) : null);
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
  const continueIfExists = req.body?.continueIfExists === true;
  const ttsVoice = typeof req.body?.voice === 'string' ? req.body.voice.trim() : '';
  const ttsRate = typeof req.body?.rate === 'number' ? req.body.rate : undefined;
  const ttsPitch = typeof req.body?.pitch === 'number' ? req.body.pitch : undefined;
  const requestedTtsSettings = normalizeTtsOutputSettings({
    voice: ttsVoice || undefined,
    rate: ttsRate,
    pitch: ttsPitch,
    overlapMode: ttsOverlapMode,
    removeLineBreaks: ttsRemoveLineBreaks
  });
  const forceNew = req.body?.forceNew === true;
  const inputPaths = Array.isArray(req.body?.inputPaths)
    ? req.body.inputPaths.filter((value: unknown) => typeof value === 'string' && value.trim().length > 0)
    : undefined;
  const renderConfigV2 = req.body?.renderConfigV2 as RenderConfigV2 | undefined;
  const renderInputPaths = Array.isArray(req.body?.renderInputPaths)
    ? req.body.renderInputPaths.filter((value: unknown) => typeof value === 'string' && value.trim().length > 0)
    : undefined;
  const renderVideoPath = typeof req.body?.videoPath === 'string' ? req.body.videoPath : undefined;
  const renderAudioPath = typeof req.body?.audioPath === 'string' ? req.body.audioPath : undefined;
  const renderSubtitlePath = typeof req.body?.subtitlePath === 'string' ? req.body.subtitlePath : undefined;
  const renderPreviewSecondsRaw = typeof req.body?.renderPreviewSeconds === 'number' ? req.body.renderPreviewSeconds : undefined;
  const renderPreviewSeconds = renderPreviewSecondsRaw !== undefined && Number.isFinite(renderPreviewSecondsRaw) && renderPreviewSecondsRaw > 0
    ? Math.min(3600, Math.round(renderPreviewSecondsRaw * 1000) / 1000)
    : undefined;

  const translateNode = req.body?.graph?.nodes?.find((n: any) => n.type === 'translate');
  const translateSubtitleFile = typeof req.body?.subtitleFile === 'string'
    ? req.body.subtitleFile
    : typeof translateNode?.params?.subtitleFile === 'string'
      ? translateNode.params.subtitleFile
      : undefined;
  const translatePreset = req.body?.preset || translateNode?.params?.preset;
  const translateTargetIds = req.body?.targetIds || translateNode?.params?.targetIds;

  // Optimize params (can be separate or use same as translate)
  const optimizeNode = req.body?.graph?.nodes?.find((n: any) => n.type === 'optimize');
  const optimizeSubtitleFile = typeof req.body?.optimizeSubtitleFile === 'string'
    ? req.body.optimizeSubtitleFile
    : typeof optimizeNode?.params?.subtitleFile === 'string'
      ? optimizeNode.params.subtitleFile
      : translateSubtitleFile; // Default to same file as translate
  const optimizePreset = req.body?.optimizePreset || optimizeNode?.params?.preset || translatePreset; // Default to same preset
  const optimizeTargetIds = req.body?.optimizeTargetIds || optimizeNode?.params?.targetIds;
  const optimizeTargetIssues = req.body?.optimizeTargetIssues || optimizeNode?.params?.targetIssues;

  if (LOG_RENDER_V2_DEBUG && renderConfigV2) {
    console.log('RENDER_V2_DEBUG jobs/run received renderConfigV2', JSON.stringify({
      renderPreviewSeconds: renderPreviewSeconds ?? null,
      renderInputPaths: renderInputPaths ?? null,
      config: summarizeRenderConfigForDebug(renderConfigV2)
    }));
  }

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

    if (renderPreviewSeconds) {
      pipelineName = `${pipelineName} (Preview ${renderPreviewSeconds}s)`;
    }

    const tasks = buildTasksFromGraph(graph);
    if (!tasks.length) {
      res.status(400).json({ error: 'Pipeline has no tasks' });
      return;
    }

    const hasDownload = tasks.some(task => task.type === 'download' || task.type.startsWith('download_'));
    const hasUvr = tasks.some(task => task.type === 'uvr');
    const hasTts = tasks.some(task => task.type === 'tts');
    const hasTranslate = tasks.some(task => task.type === 'translate');
    const hasOptimize = tasks.some(task => task.type === 'optimize');
    const hasRender = tasks.some(task => task.type === 'render');
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
      const mediaforgeDir = path.join(projectRoot, '.mediaforge');
      const downloadRuntimeDir = path.join(mediaforgeDir, 'download');
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
        
        // Check download state for resumable downloads
        const existingState = await readDownloadState(downloadRuntimeDir);
        const hasExistingDownloadState = existingState !== null;
        
        // Check if download is fully complete (both subs and media completed and files exist)
        let isDownloadFullyComplete = false;
        if (hasExistingDownloadState && existingState) {
          const subsComplete = existingState.subsCompleted && 
            existingState.subsFiles.length > 0 && 
            await subsExistInSource(sourceDir, existingState.subsFiles);
          const mediaComplete = existingState.mediaCompleted && 
            existingState.mediaFile && 
            await fileExistsInSource(sourceDir, existingState.mediaFile);
          
          // For 'all' mode: both subs and media must be complete
          // For 'subs' mode: only subs must be complete
          // For 'media' mode: only media must be complete
          if (downloadMode === 'all') {
            isDownloadFullyComplete = subsComplete && mediaComplete;
          } else if (downloadMode === 'subs') {
            isDownloadFullyComplete = subsComplete;
          } else if (downloadMode === 'media') {
            isDownloadFullyComplete = mediaComplete;
          }
        }
        
        // If download is fully complete, treat as existing project
        if (isDownloadFullyComplete) {
          if (!continueIfExists) {
            res.status(409).json({ error: 'Download already completed. Project outputs already exist.', kind: 'download' });
            return;
          }
        } else {
          // Download is not complete - check if there are other outputs (UVR, etc.)
          const hasUvrOutputs = await hasFiles(outputDir);
          if (hasUvrOutputs && !continueIfExists) {
            res.status(409).json({ error: 'Project has existing outputs (UVR, etc.).', kind: 'download' });
            return;
          }
        }
      }
      await fs.mkdir(sourceDir, { recursive: true });
      await fs.mkdir(downloadRuntimeDir, { recursive: true });
      await fs.mkdir(outputDir, { recursive: true });
      let cookiesFile: string | null = null;
      if (downloadCookiesContent) {
        const filename = sanitizeFileName(downloadCookiesFileName || 'cookies.txt');
        cookiesFile = path.join(downloadRuntimeDir, filename);
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

      const renderPayload: Record<string, any> = {};
      if (renderConfigV2) renderPayload.configV2 = renderConfigV2;
      if (renderInputPaths?.length) renderPayload.inputPaths = renderInputPaths;
      if (renderVideoPath) renderPayload.videoPath = renderVideoPath;
      if (renderAudioPath) renderPayload.audioPath = renderAudioPath;
      if (renderSubtitlePath) renderPayload.subtitlePath = renderSubtitlePath;

      const translatePayload: Record<string, any> = {};
      if (translateSubtitleFile) translatePayload.subtitleFile = translateSubtitleFile;
      if (translatePreset) translatePayload.preset = translatePreset;
      if (translateTargetIds) translatePayload.targetIds = translateTargetIds;

      const optimizePayload: Record<string, any> = {};
      if (optimizeSubtitleFile) optimizePayload.subtitleFile = optimizeSubtitleFile;
      if (optimizePreset) optimizePayload.preset = optimizePreset;
      if (optimizeTargetIds) optimizePayload.targetIds = optimizeTargetIds;
      if (optimizeTargetIssues) optimizePayload.targetIssues = optimizeTargetIssues;

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
          pipelineId: pipelineId,
          pipelineName,
          projectName: safeProjectName,
          download: {
            url: downloadUrl,
            mode: downloadMode,
            noPlaylist: downloadNoPlaylist,
            subLangs: downloadSubLangs
          },
          uvr: hasUvr ? {
            backend,
            model,
            outputFormat
          } : undefined,
          tts: hasTts ? {
            voice: ttsVoice || undefined,
            rate: ttsRate,
            pitch: ttsPitch,
            overlapMode: ttsOverlapMode,
            removeLineBreaks: ttsRemoveLineBreaks
          } : undefined,
          translate: hasTranslate && Object.keys(translatePayload).length > 0 ? translatePayload : undefined,
          optimize: hasOptimize && Object.keys(optimizePayload).length > 0 ? optimizePayload : undefined,
          render: hasRender && Object.keys(renderPayload).length > 0 ? renderPayload : undefined
        }
      };
      if (renderPreviewSeconds && job.params.render) {
        job.params.render.previewSeconds = renderPreviewSeconds;
      }

      (job as any).__downloadUrl = downloadUrl;
      (job as any).__downloadSourceDir = sourceDir;
      (job as any).__downloadRuntimeDir = downloadRuntimeDir;
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
      (job as any).__forceRenderV2New = forceNew;
      (job as any).__ttsRemoveLineBreaks = ttsRemoveLineBreaks;
      if (renderConfigV2) (job as any).__renderConfigV2 = renderConfigV2;
      if (translateSubtitleFile) (job as any).__translateSubtitleFile = translateSubtitleFile;
      if (translatePreset) (job as any).__translatePreset = translatePreset;
      if (optimizeSubtitleFile) (job as any).__optimizeSubtitleFile = optimizeSubtitleFile;
      if (optimizePreset) (job as any).__optimizePreset = optimizePreset;
      if (ttsVoice) (job as any).__ttsVoice = ttsVoice;
      if (ttsRate !== undefined) (job as any).__ttsRate = ttsRate;
      if (ttsPitch !== undefined) (job as any).__ttsPitch = ttsPitch;
    } else {
      if (!inputPath) {
        res.status(400).json({ error: 'Missing inputPath' });
        return;
      }
      const fullPath = safeResolvePath(inputPath);
      if (!fullPath) {
        res.status(400).json({ error: 'Invalid inputPath' });
        return;
      }

      const stats = await fs.stat(fullPath);
      const fileName = path.basename(fullPath);
      const fileSize = formatBytes(stats.size);
      const projectName = inputPath.split(/[\\/]/)[0];
      const projectRoot = path.join(MEDIA_VAULT_ROOT, projectName);
      const mediaforgeDir = path.join(projectRoot, '.mediaforge');
      const uvrRuntimeDir = path.join(mediaforgeDir, 'uvr');
      const outputDir = path.join(projectRoot, UVR_OUTPUT_DIRNAME);
      await fs.mkdir(uvrRuntimeDir, { recursive: true });
      await fs.mkdir(outputDir, { recursive: true });

      // Check for existing outputs if not continuing
      if (!continueIfExists) {
        const existing = await fs.readdir(outputDir).catch(() => []);
        const baseName = path.parse(fullPath).name.toLowerCase();
        const hasTts = tasks.some(task => task.type === 'tts');
        if (hasTts) {
          const { outputName: ttsName } = buildTtsOutputName(fullPath, requestedTtsSettings);
          const ttsPath = path.join(outputDir, ttsName);
          const ttsExists = await fs.stat(ttsPath).then(stat => stat.isFile()).catch(() => false);
          if (ttsExists) {
            res.status(409).json({ error: 'TTS output already exists.', kind: 'tts', path: path.relative(MEDIA_VAULT_ROOT, ttsPath) });
            return;
          }
        }
      }

      const renderPayload: Record<string, any> = {};
      if (renderInputPaths?.length) renderPayload.inputPaths = renderInputPaths;
      if (renderVideoPath) renderPayload.videoPath = renderVideoPath;
      if (renderAudioPath) renderPayload.audioPath = renderAudioPath;
      if (renderSubtitlePath) renderPayload.subtitlePath = renderSubtitlePath;
      if (renderConfigV2) {
        const { signature } = await buildRenderV2Signature(renderConfigV2, MEDIA_VAULT_ROOT, RENDER_V2_SEGMENT_SECONDS);
        renderPayload.configV2 = renderConfigV2;
        renderPayload.signature = signature;
      }

      const translatePayload: Record<string, any> = {};
      if (req.body.translate) {
        Object.assign(translatePayload, req.body.translate);
      }
      if (translateSubtitleFile) translatePayload.subtitleFile = translateSubtitleFile;
      if (translatePreset) translatePayload.preset = translatePreset;
      if (translateTargetIds) translatePayload.targetIds = translateTargetIds;

      const optimizePayload: Record<string, any> = {};
      if (optimizeSubtitleFile) optimizePayload.subtitleFile = optimizeSubtitleFile;
      if (optimizePreset) optimizePayload.preset = optimizePreset;
      if (optimizeTargetIds) optimizePayload.targetIds = optimizeTargetIds;
      if (optimizeTargetIssues) optimizePayload.targetIssues = optimizeTargetIssues;

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
          pipelineId: pipelineId,
          pipelineName,
          projectName,
          inputRelativePath: inputPath,
          inputPaths: inputPaths && inputPaths.length > 0 ? inputPaths : undefined,
          uvr: hasUvr ? {
            backend,
            model,
            outputFormat
          } : undefined,
          tts: hasTts ? {
            voice: ttsVoice || undefined,
            rate: ttsRate,
            pitch: ttsPitch,
            overlapMode: ttsOverlapMode,
            removeLineBreaks: ttsRemoveLineBreaks
          } : undefined,
          translate: hasTranslate && Object.keys(translatePayload).length > 0 ? translatePayload : undefined,
          optimize: hasOptimize && Object.keys(optimizePayload).length > 0 ? optimizePayload : undefined,
          render: hasRender && Object.keys(renderPayload).length > 0 ? renderPayload : undefined
        }
      };
      if (renderPreviewSeconds && job.params.render) {
        job.params.render.previewSeconds = renderPreviewSeconds;
      }

      (job as any).__inputPath = fullPath;
      (job as any).__inputRelativePath = inputPath;
      (job as any).__projectRoot = projectRoot;
      (job as any).__outputDir = outputDir;
      (job as any).__uvrRuntimeDir = uvrRuntimeDir;
      (job as any).__model = model;
      (job as any).__outputFormat = outputFormat;
      (job as any).__backend = backend;
      (job as any).__ttsOverlapMode = ttsOverlapMode;
      (job as any).__forceRenderV2New = forceNew;
      (job as any).__ttsRemoveLineBreaks = ttsRemoveLineBreaks;
      if (renderConfigV2) (job as any).__renderConfigV2 = renderConfigV2;
      
      // Map translation params from the consolidated payload
      if (translatePayload.subtitleFile) (job as any).__translateSubtitleFile = translatePayload.subtitleFile;
      if (translatePayload.preset) (job as any).__translatePreset = translatePayload.preset;
      if (translatePayload.targetIds) (job as any).__translateTargetIds = translatePayload.targetIds;
      // Map optimize params
      if (optimizePayload.subtitleFile) (job as any).__optimizeSubtitleFile = optimizePayload.subtitleFile;
      if (optimizePayload.preset) (job as any).__optimizePreset = optimizePayload.preset;
      if (optimizePayload.targetIds) (job as any).__optimizeTargetIds = optimizePayload.targetIds;
      if (optimizePayload.targetIssues) (job as any).__optimizeTargetIssues = optimizePayload.targetIssues;
      if (ttsVoice) (job as any).__ttsVoice = ttsVoice;
      if (ttsRate !== undefined) (job as any).__ttsRate = ttsRate;
      if (ttsPitch !== undefined) (job as any).__ttsPitch = ttsPitch;
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
  downloadDir: string,
  sourceDir: string,
  cookiesFile?: string,
  noPlaylist = true,
  subLangs?: string,
  downloadMode: 'all' | 'subs' | 'media' = 'all',
  onData?: (chunk: string) => void,
  options?: { signal?: AbortSignal; onStart?: (proc: ReturnType<typeof spawn>) => void }
) => {
  const normalizedLangs = subLangs?.trim();
  const wantsSubs = Boolean(normalizedLangs);
  
  // Load or create download state
  let state = await readDownloadState(downloadDir);
  const isNewState = !state || state.url !== url || state.downloadMode !== downloadMode;
  if (isNewState) {
    state = {
      url,
      downloadMode,
      subLangs: normalizedLangs,
      subsCompleted: false,
      subsFiles: [],
      mediaCompleted: false,
      lastUpdated: new Date().toISOString()
    };
    await writeDownloadState(downloadDir, state);
  }

  const baseArgs = [
    ...(noPlaylist ? ['--no-playlist'] : []),
    '--no-warnings',
    '--newline',
    ...(cookiesFile ? ['--cookies', cookiesFile] : []),
    '-o', path.join(downloadDir, '%(id)s %(title).60s.%(ext)s'),
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
          // Only use stderr for error message, not full output (log is stored separately)
          const errorMsg = error.trim() || `yt-dlp exited with code ${code}`;
          reject(new Error(errorMsg));
          return;
        }
        resolve(combined);
      });
    });
  };

  const listFiles = async () => {
    const entries = await fs.readdir(downloadDir, { withFileTypes: true });
    return entries.filter(entry => entry.isFile() && entry.name !== DOWNLOAD_STATE_FILE).map(entry => entry.name);
  };

  const isSubtitleFile = (filename: string) => {
    const ext = path.extname(filename).toLowerCase();
    return SUB_EXT.has(ext);
  };

  const isVideoFile = (filename: string) => {
    const ext = path.extname(filename).toLowerCase();
    return VIDEO_EXT.has(ext);
  };

  let subsLog = '';
  let subsFiles: string[] = [];
  
  // Phase 1: Download subtitles
  // Skip if: subsCompleted is true AND all subs files exist in sourceDir
  const shouldSkipSubs = downloadMode !== 'media' && 
    state.subsCompleted && 
    state.subsFiles.length > 0 && 
    await subsExistInSource(sourceDir, state.subsFiles);
  
  if (downloadMode !== 'media') {
    if (shouldSkipSubs) {
      onData?.(`[SKIP] Subtitles already completed and files exist in source directory\n`);
      subsFiles = state.subsFiles;
    } else {
      const beforeSubs = new Set<string>(await listFiles());
      const subsArgs = [
        ...(wantsSubs ? ['--write-subs', '--sub-langs', normalizedLangs!] : ['--write-subs', '--write-auto-subs']),
        '--sub-format', 'srt',
        '--convert-subs', 'srt',
        '--skip-download',
        ...baseArgs
      ];
      subsLog = await runWithArgs(subsArgs, 'subs-only');
      const afterSubs = await listFiles();
      const newSubsFiles = afterSubs.filter(name => !beforeSubs.has(name) && isSubtitleFile(name));
      
      // Move subtitle files to sourceDir on success
      if (newSubsFiles.length > 0) {
        const moved = await moveFilesToSource(downloadDir, sourceDir, newSubsFiles);
        if (moved.length > 0) {
          state.subsCompleted = true;
          state.subsFiles = moved;
          await writeDownloadState(downloadDir, state);
          onData?.(`[MOVE] Moved ${moved.length} subtitle file(s) to source directory\n`);
        }
      }
      subsFiles = newSubsFiles;
    }
  }

  let mediaLog = '';
  let mediaFiles: string[] = [];
  
  // Phase 2-4: Download video, audio, and merge
  // Skip if: mediaCompleted is true AND media file exists in sourceDir
  const shouldSkipMedia = downloadMode !== 'subs' && 
    state.mediaCompleted && 
    state.mediaFile && 
    await fileExistsInSource(sourceDir, state.mediaFile);
  
  if (downloadMode !== 'subs') {
    if (shouldSkipMedia) {
      onData?.(`[SKIP] Media already completed and file exists in source directory\n`);
      mediaFiles = state.mediaFile ? [state.mediaFile] : [];
    } else {
      const beforeMedia = new Set<string>(await listFiles());
      const mediaArgs = [
        ...baseArgs
      ];
      mediaLog = await runWithArgs(mediaArgs, 'media');
      const afterMedia = await listFiles();
      const newMediaFiles = afterMedia.filter(name => !beforeMedia.has(name));
      
      // Find the final merged video file (largest video file after merge)
      // yt-dlp merges video+audio into a single video file
      const videoFiles = newMediaFiles.filter(isVideoFile);
      if (videoFiles.length > 0) {
        // Find the largest video file (likely the merged output)
        let largestVideo = videoFiles[0];
        let largestSize = 0;
        for (const vf of videoFiles) {
          try {
            const stat = await fs.stat(path.join(downloadDir, vf));
            if (stat.size > largestSize) {
              largestSize = stat.size;
              largestVideo = vf;
            }
          } catch {}
        }
        
        // Move the merged video to sourceDir
        const moved = await moveFilesToSource(downloadDir, sourceDir, [largestVideo]);
        if (moved.length > 0) {
          state.mediaCompleted = true;
          state.mediaFile = largestVideo;
          await writeDownloadState(downloadDir, state);
          onData?.(`[MOVE] Moved merged video to source directory: ${largestVideo}\n`);
        }
      }
      mediaFiles = newMediaFiles;
    }
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
    '--output-name',
    '[VR]{suffix}_{orig_base}.{ext}',
    '--max-chunk-seconds',
    String(UVR_MAX_CHUNK_SECONDS),
    '--both',
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
    proc.on('close', (code, signal) => {
      options?.signal?.removeEventListener('abort', handleAbort);
      if (options?.signal?.aborted) {
        reject(new Error(CANCELLED_ERROR_MESSAGE));
        return;
      }
      const combined = [output.trim(), error.trim()].filter(Boolean).join('\n');
      if (code !== 0 || signal) {
        const exitInfo = signal ? `killed by signal ${signal}` : `exited with code ${code}`;
        // Truncate log to last 2000 chars to avoid huge error messages
        const truncatedLog = combined.length > 2000 ? '...\n' + combined.slice(-2000) : combined;
        reject(new Error(truncatedLog ? `${truncatedLog}\n\n[Process ${exitInfo}]` : `uvr_cli ${exitInfo}`));
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

  const fullPath = safeResolvePath(inputPath);
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

app.get('/api/vault/stream', async (req, res) => {
  const relPath = typeof req.query.path === 'string' ? req.query.path : '';
  const preview = req.query.preview === '1';
  if (!relPath) {
    res.status(400).json({ error: 'Missing path' });
    return;
  }

  const fullPath = safeResolvePath(relPath);
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

  const fullPath = safeResolvePath(relPath);
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

app.post('/api/vault/subtitle/save', async (req, res) => {
  const relativePathRaw = typeof req.body?.relativePath === 'string' ? req.body.relativePath.trim() : '';
  const contentRaw = typeof req.body?.content === 'string' ? req.body.content : '';

  if (!relativePathRaw) {
    res.status(400).json({ error: 'Missing relativePath' });
    return;
  }

  if (!contentRaw) {
    res.status(400).json({ error: 'Missing content' });
    return;
  }

  // Ensure path ends with .sktproject
  let savePath = relativePathRaw;
  if (!savePath.toLowerCase().endsWith('.sktproject')) {
    savePath = savePath.replace(/\.[^/.]+$/, '') + '.sktproject';
  }

  const fullPath = safeResolvePath(savePath);
  if (!fullPath) {
    res.status(400).json({ error: 'Invalid path' });
    return;
  }

  try {
    // Ensure directory exists
    const dir = path.dirname(fullPath);
    await fs.mkdir(dir, { recursive: true });

    // Write file
    await fs.writeFile(fullPath, contentRaw, 'utf-8');

    res.json({ success: true, path: savePath });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save file';
    res.status(500).json({ error: message });
  }
});

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

/** Solid black JPEG (320×240) when ffmpeg cannot produce a preview frame. */
const RENDER_PREVIEW_BLACK_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAgAAAQABAAD//gAQTGF2YzU4LjU0LjEwMAD/2wBDAAg+Pkk+SVVVVVVVVWRdZGhoaGRkZGRoaGhwcHCDg4NwcHBoaHBwfHyDg4+Tj4eHg4eTk5ubm7q6srLZ2eD/////xABLAAEBAAAAAAAAAAAAAAAAAAAACAEBAAAAAAAAAAAAAAAAAAAAABABAAAAAAAAAAAAAAAAAAAAABEBAAAAAAAAAAAAAAAAAAAAAP/AABEIAPABQAMBIgACEQADEQD/2gAMAwEAAhEDEQA/AJ/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB//9k=',
  'base64'
);

app.get('/api/vault/thumb', async (req, res) => {
  const relPath = typeof req.query.path === 'string' ? req.query.path : '';
  if (!relPath) {
    res.status(400).json({ error: 'Missing path' });
    return;
  }

  const fullPath = safeResolvePath(relPath);
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

app.post('/api/render-preview-v2', async (req, res) => {
  const config = req.body?.config as RenderConfigV2 | undefined;
  const at = typeof req.body?.at === 'number' ? req.body.at : 0;
  if (!config || config.version !== '2') {
    res.status(400).json({ error: 'Missing render config v2' });
    return;
  }
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'render-preview-v2-'));
  const outputPath = path.join(tmpDir, 'frame.jpg');
  let previewBuf: Buffer = RENDER_PREVIEW_BLACK_JPEG;
  let previewError: string | null = null;
  try {
    if (LOG_RENDER_V2_DEBUG) {
      console.log('RENDER_V2_DEBUG preview request', JSON.stringify({
        at,
        config: summarizeRenderConfigForDebug(config)
      }));
    }
    const baseOutputStart = Number.isFinite(config.timeline.start) ? Math.max(0, Number(config.timeline.start)) : 0;
    const timelineDuration = Number.isFinite(config.timeline.duration) ? Math.max(0, Number(config.timeline.duration)) : 0;
    const framerate = Number.isFinite(config.timeline.framerate) && Number(config.timeline.framerate) > 0
      ? Number(config.timeline.framerate)
      : 30;
    const frameDuration = 1 / framerate;
    let atSeconds = Number.isFinite(at) ? Math.max(0, at) : 0;
    if (timelineDuration > 0) {
      atSeconds = Math.min(atSeconds, Math.max(0, timelineDuration - frameDuration));
    }
    const previewOutputStart = baseOutputStart + atSeconds;
    if (LOG_RENDER_V2_DEBUG) {
      console.log('RENDER_V2_DEBUG preview window', JSON.stringify({
        baseOutputStart,
        timelineDuration,
        framerate,
        frameDuration,
        atSeconds,
        previewOutputStart
      }));
    }
    const graph = await buildRenderV2FilterGraph(config, tmpDir, MEDIA_VAULT_ROOT, {
      includeAudio: false,
      outputStart: previewOutputStart,
      outputDuration: frameDuration,
      allowShortDuration: true,
      sampleAt: previewOutputStart,
      debugEnabled: LOG_RENDER_V2_DEBUG,
      debugLabel: 'preview'
    });
    const ffmpegPath = await getFfmpegPath();
    const args: string[] = ['-y'];
    const inputArgs: string[] = [];
    graph.inputEntries.forEach(entry => inputArgs.push(...entry.args));
    args.push(...inputArgs);
    args.push(
      '-filter_complex',
      graph.filterComplex,
      '-map',
      graph.videoLabel,
      '-frames:v',
      '1',
      '-q:v',
      '3',
      outputPath
    );
    if (LOG_RENDER_PREVIEW_FFMPEG_COMMAND) {
      const commandLine = [ffmpegPath, ...args].map(formatArg).join(' ');
      console.log(`COMMAND (render preview v2): ${commandLine}`);
    }
    await new Promise<void>((resolve, reject) => {
      const proc = spawn(ffmpegPath, args, { stdio: ['ignore', 'ignore', 'pipe'] });
      let stderr = '';
      proc.stderr.on('data', chunk => {
        stderr += chunk.toString();
      });
      proc.on('error', reject);
      proc.on('close', code => {
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg exited with code ${code}${stderr ? `: ${stderr.trim()}` : ''}`));
      });
    });
    previewBuf = await fs.readFile(outputPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Render preview v2 failed';
    console.error('render-preview-v2: failed', message);
    previewError = message;
    previewBuf = RENDER_PREVIEW_BLACK_JPEG;
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => null);
  }

  res.setHeader('Content-Type', 'image/jpeg');
  res.setHeader('Cache-Control', 'no-store');
  if (previewError) {
    const safe = previewError.replace(/[\r\n]/g, ' ').slice(0, 500);
    res.setHeader('X-Render-Preview-Error', safe);
  }
  res.send(previewBuf);
});

// Concurrency Settings API
app.get('/api/settings/concurrency', async (_req, res) => {
  try {
    const config = configManager.get();
    res.json(config);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load concurrency config' });
  }
});

app.put('/api/settings/concurrency', async (req, res) => {
  try {
    const newConfig = req.body as Partial<SystemConfig>;
    const updated = await configManager.update(newConfig);
    
    // Update resource manager at runtime
    try {
      const rm = getResourceManager();
      rm.updateConfig(updated);
    } catch {
      // Resource manager not initialized yet
    }
    
    systemConfig = updated;
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Failed to save system config' });
  }
});

app.post('/api/settings/concurrency/reset', async (_req, res) => {
  try {
    const config = await configManager.reset();
    
    try {
      const rm = getResourceManager();
      rm.updateConfig(config);
    } catch {
      // Resource manager not initialized yet
    }
    
    systemConfig = config;
    res.json(config);
  } catch (err) {
    res.status(500).json({ error: 'Failed to reset system config' });
  }
});

app.get('/api/settings/concurrency/status', (_req, res) => {
  try {
    const rm = getResourceManager();
    res.json(rm.getStatus());
  } catch {
    res.json({ totalRunning: 0, byResource: {}, byType: {} });
  }
});

// OpenRouter Models API
import { getOpenRouterModels, getOpenRouterModelInfo, OpenRouterModelInfo } from './openrouter-provider.js';

app.get('/api/openrouter/models', async (_req, res) => {
  try {
    const config = configManager.get();
    const apiKey = config.ai?.openrouterApiKey;
    
    if (!apiKey) {
      res.status(400).json({ error: 'OpenRouter API key not configured' });
      return;
    }
    
    const models = await getOpenRouterModels(apiKey);
    res.json(models);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error('Get OpenRouter Models Error:', errMsg);
    res.status(500).json({ error: errMsg || 'Failed to fetch models' });
  }
});

app.get('/api/openrouter/models/:id', async (req, res) => {
  try {
    const config = configManager.get();
    const apiKey = config.ai?.openrouterApiKey;
    
    if (!apiKey) {
      res.status(400).json({ error: 'OpenRouter API key not configured' });
      return;
    }
    
    const modelId = decodeURIComponent(req.params.id);
    const modelInfo = await getOpenRouterModelInfo(modelId, apiKey);
    
    if (!modelInfo) {
      res.status(404).json({ error: 'Model not found' });
      return;
    }
    
    res.json(modelInfo);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error('Get OpenRouter Model Info Error:', errMsg);
    res.status(500).json({ error: errMsg || 'Failed to fetch model info' });
  }
});

app.get('/api/openrouter/current-model', async (_req, res) => {
  try {
    const config = configManager.get();
    const apiKey = config.ai?.openrouterApiKey;
    const modelId = config.ai?.openrouterModel || 'openrouter/auto';
    
    if (!apiKey) {
      res.status(400).json({ error: 'OpenRouter API key not configured' });
      return;
    }
    
    const modelInfo = await getOpenRouterModelInfo(modelId, apiKey);
    
    if (!modelInfo) {
      res.status(404).json({ error: 'Current model not found in models list', modelId });
      return;
    }
    
    res.json(modelInfo);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error('Get Current Model Info Error:', errMsg);
    res.status(500).json({ error: errMsg || 'Failed to fetch current model info' });
  }
});

import { callAi } from './ai-provider.js';
import * as SubtitleAI from './subtitle-ai.js';

// Subtitle AI API
app.post('/api/subtitle/ai/translate', async (req, res) => {
  try {
    const result = await SubtitleAI.translateBatch(req.body);
    res.json(result);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const errStack = err instanceof Error ? err.stack : undefined;
    console.error('Translate Batch Error:', errMsg);
    if (errStack) console.error('Stack:', errStack);
    res.status(500).json({ error: errMsg || 'Translation failed' });
  }
});

app.post('/api/subtitle/ai/optimize', async (req, res) => {
  try {
    const result = await SubtitleAI.aiFixSegments(req.body);
    res.json(result);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const errStack = err instanceof Error ? err.stack : undefined;
    console.error('Optimize Error:', errMsg);
    if (errStack) console.error('Stack:', errStack);
    res.status(500).json({ error: errMsg || 'Optimization failed' });
  }
});

app.post('/api/subtitle/ai/analyze-style', async (req, res) => {
  try {
    const result = await SubtitleAI.analyzeTranslationStyle(req.body);
    res.json(result);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const errStack = err instanceof Error ? err.stack : undefined;
    console.error('Analyze Style Error:', errMsg);
    if (errStack) console.error('Stack:', errStack);
    res.status(500).json({ error: errMsg || 'Analysis failed' });
  }
});

app.post('/api/subtitle/ai/call', async (req, res) => {
  try {
    const params = req.body;
    const result = await callAi(params);
    res.json(result);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const errStack = err instanceof Error ? err.stack : undefined;
    console.error('AI Call Error:', errMsg);
    if (errStack) console.error('Stack:', errStack);
    res.status(500).json({ error: errMsg || 'AI call failed' });
  }
});

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.listen(PORT, () => {
  console.log(`Media backend running on http://localhost:${PORT}`);
});
