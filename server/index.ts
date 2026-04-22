import 'dotenv/config';
import express from 'express';
import fs from 'fs/promises';
import { createReadStream, readFileSync } from 'fs';
import { spawn } from 'child_process';
import crypto from 'crypto';
import os from 'os';
import path from 'path';
import initSqlJs from 'sql.js';
import { MEDIA_VAULT_ROOT, KNOWN_SUBDIRS, OUTPUT_DIR_NAMES, THUMB_CACHE_DIR, UVR_CLI_PATH, UVR_OUTPUT_DIRNAME } from './constants.js';
import { ttsRouter } from './tts.js';
import { buildAssDocument, parseAssRenderStyle, writeStyledAssFile } from './subtitleAss.js';

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

type RenderConfigV2 = {
  version: '2';
  timeline: {
    resolution: string;
    framerate: number;
    duration?: number;
    start?: number;
    backgroundColor?: string;
    trackLabels?: Record<string, string>;
    imageMatchDuration?: Record<string, boolean>;
  };
  renderOptions?: {
    codec?: 'h264' | 'h265';
    preset?: string;
    crf?: number;
    gop?: number;
    tune?: string;
  };
  inputsMap: Record<string, string>;
  items: RenderItemV2[];
  effects?: RenderEffectV2[];
};

type RenderItemV2 = {
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
  effects?: RenderEffectV2[];
};

type RenderEffectV2 = {
  type: string;
  params?: Record<string, unknown>;
};

type ProjectConfig = {
  renderV2?: {
    ffmpegThreads?: number;
  };
};

const VIDEO_EXT = new Set(['.mp4', '.mkv', '.mov', '.avi', '.webm', '.m4v']);
const AUDIO_EXT = new Set(['.wav', '.mp3', '.aac', '.flac', '.ogg', '.m4a']);
const SUB_EXT = new Set(['.srt', '.vtt', '.ass', '.ssa', '.sub']);
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.tif', '.tiff']);
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
const EDGE_TTS_MAX_RETRIES = Number(process.env.EDGE_TTS_MAX_RETRIES ?? 10);
const EDGE_TTS_RETRY_DELAY_MS = 1000;
const DEFAULT_TTS_VOICE = 'vi-VN-HoaiMyNeural';
const DEFAULT_TTS_OUTPUT_EXT = 'mp3';
const TTS_CUE_OUTPUT_EXT = 'wav';
const TTS_INTERNAL_SAMPLE_RATE = 24000;
const TTS_INTERNAL_CHANNELS = 1;
const TTS_PITCH_BASE_HZ = 200;
const TTS_CUE_CACHE_DIRNAME = '.mediaforge/tts-cue-cache';
const TTS_CUE_CONCURRENCY = Math.max(
  1,
  Math.min(
    8,
    Number.isFinite(Number(process.env.TTS_CUE_CONCURRENCY))
      ? Number(process.env.TTS_CUE_CONCURRENCY)
      : 3
  )
);
const TTS_MIX_SEGMENT_SECONDS = Math.max(
  120,
  Math.min(
    300,
    Number.isFinite(Number(process.env.TTS_MIX_SEGMENT_SECONDS))
      ? Number(process.env.TTS_MIX_SEGMENT_SECONDS)
      : 180
  )
);
const TTS_MP3_BITRATE_KBPS = Math.max(
  64,
  Math.min(
    320,
    Number.isFinite(Number(process.env.TTS_MP3_BITRATE_KBPS))
      ? Number(process.env.TTS_MP3_BITRATE_KBPS)
      : 128
  )
);
const TTS_DEBUG_TIMING =
  ['1', 'true', 'yes', 'on'].includes((process.env.TTS_DEBUG_TIMING ?? '').toLowerCase());
const RENDER_V2_CACHE_DIRNAME = '.mediaforge/render-v2-cache';
const RENDER_V2_SEGMENT_SECONDS = Math.max(
  5,
  Number.isFinite(Number(process.env.RENDER_V2_SEGMENT_SECONDS))
    ? Number(process.env.RENDER_V2_SEGMENT_SECONDS)
    : 60
);
const RENDER_V2_FFMPEG_THREADS = (() => {
  const valueFromConfig = Number(PROJECT_CONFIG.renderV2?.ffmpegThreads);
  const valueFromEnv = Number(process.env.RENDER_V2_FFMPEG_THREADS);
  const value = Number.isFinite(valueFromConfig) ? valueFromConfig : valueFromEnv;
  if (!Number.isFinite(value)) return null;
  const normalized = Math.floor(value);
  return normalized >= 1 ? normalized : null;
})();
const FONT_LIST_CACHE_MS = 5 * 60 * 1000;
const AUTH_SESSION_COOKIE = 'mf_session';
const AUTH_SESSION_TTL_DAYS = Number(process.env.AUTH_SESSION_TTL_DAYS ?? 7);
const AUTH_SESSION_TTL_MS = Math.max(1, AUTH_SESSION_TTL_DAYS) * 24 * 60 * 60 * 1000;

const app = express();
const PORT = Number(process.env.VAULT_PORT ?? 3001);
const REGISTER_MODE =
  ['1', 'true', 'yes', 'on'].includes((process.env.REGISTER_MODE ?? '').toLowerCase());
app.use(express.json({ limit: '2mb' }));

type AuthSession = {
  id: string;
  userId: number;
  username: string;
  createdAt: string;
  expiresAt: number;
};

const sessions = new Map<string, AuthSession>();

const parseCookies = (header: string | undefined) => {
  const out: Record<string, string> = {};
  if (!header) return out;
  header.split(';').forEach(part => {
    const [rawKey, ...rest] = part.trim().split('=');
    if (!rawKey) return;
    const value = rest.join('=');
    try {
      out[rawKey] = decodeURIComponent(value);
    } catch {
      out[rawKey] = value;
    }
  });
  return out;
};

const getSessionFromRequest = (req: express.Request) => {
  const cookies = parseCookies(req.headers.cookie);
  const sessionId = cookies[AUTH_SESSION_COOKIE];
  if (!sessionId) return null;
  const now = Date.now();
  const cached = sessions.get(sessionId);
  if (cached) {
    if (cached.expiresAt <= now) {
      sessions.delete(sessionId);
      try {
        db.run('DELETE FROM sessions WHERE id = ?', [sessionId]);
        schedulePersistDb();
      } catch {
        // ignore
      }
      return null;
    }
    return cached;
  }
  try {
    const result = db.exec(
      'SELECT id, user_id, username, created_at, expires_at FROM sessions WHERE id = ? LIMIT 1',
      [sessionId]
    );
    const row = result[0]?.values?.[0];
    if (!row) return null;
    const [id, userId, username, createdAt, expiresAt] = row as [string, number, string, string, number];
    if (!expiresAt || Number(expiresAt) <= now) {
      db.run('DELETE FROM sessions WHERE id = ?', [sessionId]);
      schedulePersistDb();
      return null;
    }
    const session: AuthSession = {
      id,
      userId,
      username,
      createdAt,
      expiresAt: Number(expiresAt)
    };
    sessions.set(sessionId, session);
    return session;
  } catch {
    return null;
  }
};

const setSessionCookie = (res: express.Response, sessionId: string) => {
  res.cookie(AUTH_SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: AUTH_SESSION_TTL_MS,
    path: '/'
  });
};

const clearSessionCookie = (res: express.Response) => {
  res.clearCookie(AUTH_SESSION_COOKIE, { path: '/' });
};

app.use('/api', (req, res, next) => {
  const path = req.path || '';
  if (
    path === '/auth/login' ||
    path === '/auth/register' ||
    path === '/auth/config' ||
    path === '/auth/logout'
  ) {
    return next();
  }
  const session = getSessionFromRequest(req);
  if (!session) {
    const cookies = parseCookies(req.headers.cookie);
    if (cookies[AUTH_SESSION_COOKIE]) {
      clearSessionCookie(res);
    }
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }
  (req as any).authUser = session;
  return next();
});

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

const dbPath = path.join(process.cwd(), 'server', 'data', 'main_db.sqlite');
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

try {
  db.run('DELETE FROM sessions WHERE expires_at <= ?', [Date.now()]);
} catch {
  // ignore
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

db.run(
  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`
);

db.run(
  `CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    username TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  )`
);

try {
  db.run('CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions (expires_at)');
} catch {
  // ignore
}

try {
  db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users (username)');
} catch {
  // ignore
}

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

db.run(
  `CREATE TABLE IF NOT EXISTS render_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      config_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`
);

db.run(
  `CREATE TABLE IF NOT EXISTS task_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      task_type TEXT NOT NULL,
      params_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`
);

try {
  db.run('CREATE INDEX IF NOT EXISTS idx_param_presets_task_type ON param_presets (task_type)');
} catch {
  // ignore
}

try {
  db.run('CREATE INDEX IF NOT EXISTS idx_task_templates_task_type ON task_templates (task_type)');
} catch {
  // ignore
}

const resetParamPresetsTable = () => {
  db.run('DROP TABLE IF EXISTS param_presets');
  db.run(
    `CREATE TABLE IF NOT EXISTS param_presets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_type TEXT NOT NULL,
      params_json TEXT NOT NULL,
      label TEXT,
      updated_at TEXT NOT NULL
    )`
  );
  try {
    db.run('CREATE INDEX IF NOT EXISTS idx_param_presets_task_type ON param_presets (task_type)');
  } catch {
    // ignore
  }
};

db.run('DROP TABLE IF EXISTS file_uvr');

const persistDb = async () => {
  const data = db.export();
  await fs.writeFile(dbPath, Buffer.from(data));
};

const AUTH_PBKDF2_ITERATIONS = Number(process.env.AUTH_PBKDF2_ITERATIONS ?? 150000);
const AUTH_PBKDF2_DIGEST = 'sha256';
const AUTH_PBKDF2_KEYLEN = 32;

const normalizeUsername = (value: string) => value.trim();

const isValidUsername = (value: string) => /^\S{3,64}$/.test(value);

const isValidPassword = (value: string) => value.length >= 6 && value.length <= 128;

const hashPassword = (password: string) => {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto
    .pbkdf2Sync(password, salt, AUTH_PBKDF2_ITERATIONS, AUTH_PBKDF2_KEYLEN, AUTH_PBKDF2_DIGEST)
    .toString('hex');
  return `pbkdf2$${AUTH_PBKDF2_ITERATIONS}$${salt}$${hash}`;
};

const verifyPassword = (password: string, stored: string) => {
  const parts = stored.split('$');
  if (parts.length !== 4) return false;
  const [scheme, iterRaw, salt, hash] = parts;
  if (scheme !== 'pbkdf2') return false;
  const iterations = Number(iterRaw);
  if (!Number.isFinite(iterations) || iterations <= 0) return false;
  const derived = crypto
    .pbkdf2Sync(password, salt, iterations, AUTH_PBKDF2_KEYLEN, AUTH_PBKDF2_DIGEST)
    .toString('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(derived, 'hex'));
  } catch {
    return false;
  }
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

const stripAnsiCodes = (text: string) => text.replace(/\u001b\[[0-9;]*[A-Za-z]/g, '');

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
    .map(line => (line ? `[${timestamp}] ${line}` : line))
    .join('\n');
  job.log = compactJobLogProgressLines(`${job.log ?? ''}${prefixed}`);
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
          volume: payload.volume,
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
        volume: payload.volume,
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
  stt: 'Speech-to-Text',
  translate: 'Translation',
  edit: 'Subtitle Edit',
  burn: 'Subtitle Burn',
  render: 'Render'
};

const sanitizeProjectName = (value: string) =>
  value.replace(/[\\/]/g, ' ').replace(/\.\./g, ' ').trim();

const sanitizeFileName = (value: string) => {
  const base = path.basename(value || 'cookies.txt');
  const cleaned = base.replace(/[^\w.\-() ]+/g, '_').trim();
  return cleaned || 'cookies.txt';
};

const parseResolution = (value: string | undefined | null, fallback = { w: 1920, h: 1080 }) => {
  if (!value) return fallback;
  const match = String(value).trim().match(/(\d+)\s*[x×]\s*(\d+)/i);
  if (!match) return fallback;
  const w = Number(match[1]);
  const h = Number(match[2]);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return fallback;
  return { w: Math.round(w), h: Math.round(h) };
};

const resolveRenderInputPath = (ref: string | undefined, inputsMap: Record<string, string>) => {
  if (!ref) return null;
  const cleaned = ref.replace(/^\s*\{\{/, '').replace(/\}\}\s*$/, '').trim();
  const rel = inputsMap[cleaned] ?? inputsMap[ref] ?? '';
  if (!rel) return null;
  return resolveSafePath(rel);
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

const formatArg = (value: string) => (/[^\w@%+=:,./-]/.test(value) ? JSON.stringify(value) : value);
const LOG_RENDER_PREVIEW_FFMPEG_COMMAND = false;
const LOG_RENDER_V2_DEBUG =
  ['1', 'true', 'yes', 'on'].includes((process.env.LOG_RENDER_V2_DEBUG ?? '').toLowerCase());
const BLUR_FEATHER_MAX = 10;
const STATIC_MASK_LOOP_FILTER = 'loop=loop=-1:size=1:start=0,setpts=N/FRAME_RATE/TB';

const summarizeRenderConfigForDebug = (config: RenderConfigV2) => ({
  timeline: {
    start: Number.isFinite(config.timeline?.start) ? Number(config.timeline.start) : 0,
    duration: Number.isFinite(config.timeline?.duration) ? Number(config.timeline.duration) : null,
    framerate: Number.isFinite(config.timeline?.framerate) ? Number(config.timeline.framerate) : null,
    resolution: config.timeline?.resolution ?? null
  },
  items: (config.items ?? []).map(item => ({
    id: item.id,
    type: item.type,
    timeline: item.timeline ?? null,
    text: item.type === 'text'
      ? {
        start: Number.isFinite(item.text?.start) ? Number(item.text?.start) : null,
        end: Number.isFinite(item.text?.end) ? Number(item.text?.end) : null,
        matchDuration: item.text?.matchDuration ?? null
      }
      : undefined
  }))
});

const normalizeFfmpegColor = (value: string) => {
  const trimmed = value.trim();
  if (trimmed.startsWith('#') && /^#[0-9a-fA-F]{6,8}$/.test(trimmed)) {
    return `0x${trimmed.slice(1)}`;
  }
  return trimmed;
};

const ensureCircleMaskPgm = async (tmpDir: string) => {
  const size = 256;
  const maskPath = path.join(tmpDir, `circle-mask-${size}.pgm`);
  try {
    await fs.access(maskPath);
    return maskPath;
  } catch {
    const radius = size / 2;
    const cx = (size - 1) / 2;
    const cy = (size - 1) / 2;
    const pixels = Buffer.alloc(size * size);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const dx = x - cx;
        const dy = y - cy;
        const inside = (dx * dx + dy * dy) <= (radius * radius);
        pixels[y * size + x] = inside ? 255 : 0;
      }
    }
    const header = Buffer.from(`P5\n${size} ${size}\n255\n`, 'ascii');
    await fs.writeFile(maskPath, Buffer.concat([header, pixels]));
    return maskPath;
  }
};

const ensureFeatherMaskPgm = async (tmpDir: string, featherPct: number) => {
  const f = Math.max(0, Math.min(BLUR_FEATHER_MAX, Math.round(featherPct)));
  const size = 256;
  const maskPath = path.join(tmpDir, `feather-mask-${f}-${size}.pgm`);
  try {
    await fs.access(maskPath);
    return maskPath;
  } catch {
    const edge = f <= 0 ? 0 : (f / 100) * (size / 2);
    const pixels = Buffer.alloc(size * size);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const d = Math.min(x, y, size - 1 - x, size - 1 - y);
        const alpha = edge <= 0 ? 255 : Math.max(0, Math.min(255, Math.round((d / edge) * 255)));
        pixels[y * size + x] = alpha;
      }
    }
    const header = Buffer.from(`P5\n${size} ${size}\n255\n`, 'ascii');
    await fs.writeFile(maskPath, Buffer.concat([header, pixels]));
    return maskPath;
  }
};

const buildRenderV2FilterGraph = async (
  config: RenderConfigV2,
  tmpDir: string,
  options?: {
    includeAudio?: boolean;
    outputStart?: number;
    outputDuration?: number;
    allowShortDuration?: boolean;
    sampleAt?: number;
    debugEnabled?: boolean;
    debugLabel?: string;
  }
) => {
  const debugEnabled = options?.debugEnabled === true;
  const debugLabel = options?.debugLabel ? ` ${options.debugLabel}` : '';
  const INPUT_SEEK_PREROLL_SECONDS = 1;
  const includeAudio = options?.includeAudio !== false;
  const { w: outW, h: outH } = parseResolution(config.timeline.resolution);
  const framerate = Number.isFinite(config.timeline.framerate) ? config.timeline.framerate : 30;
  const background = normalizeFfmpegColor(config.timeline.backgroundColor || '#000000');
  const configOutputStart = Number.isFinite(config.timeline.start) ? Math.max(0, Number(config.timeline.start)) : 0;
  const outputStart = Number.isFinite(options?.outputStart) ? Math.max(0, Number(options?.outputStart)) : configOutputStart;

  const visualItems = config.items.filter(item => item.type === 'video' || item.type === 'image');
  const audioItems = config.items.filter(item => item.type === 'audio');
  const subtitleItems = config.items.filter(item => item.type === 'subtitle');
  const textItems = config.items.filter(item => item.type === 'text');

  const sourceItems = includeAudio
    ? [...visualItems, ...audioItems, ...subtitleItems]
    : [...visualItems, ...subtitleItems];
  const inputs: Array<{ path: string; type: RenderItemV2['type']; item: RenderItemV2; duration?: number }> = [];
  for (const item of sourceItems) {
    const pathFromRef = resolveRenderInputPath(item.source?.ref, config.inputsMap);
    const sourcePath = pathFromRef ?? (item.source?.path ? resolveSafePath(item.source.path) : null);
    if (!sourcePath) continue;
    let duration: number | undefined;
    if (item.type === 'video' || item.type === 'audio' || item.type === 'subtitle') {
      const stats = await fs.stat(sourcePath);
      duration = await getDurationSeconds(sourcePath, item.type, stats);
    }
    inputs.push({ path: sourcePath, type: item.type, item, duration });
  }

  const computedMediaTimelineDuration = inputs.reduce((max, entry) => {
    if (entry.type !== 'video' && entry.type !== 'audio') return max;
    if (!(typeof entry.duration === 'number' && Number.isFinite(entry.duration) && entry.duration > 0)) return max;
    const trimStart = Math.max(0, entry.item.timeline?.trimStart ?? 0);
    const trimEnd = Math.max(0, entry.item.timeline?.trimEnd ?? 0);
    const effective = Math.max(0.1, entry.duration - trimStart - trimEnd);
    return Math.max(max, effective);
  }, 0);
  const resolvedTimelineDuration = Number.isFinite(config.timeline.duration) && Number(config.timeline.duration) > 0
    ? Number(config.timeline.duration)
    : computedMediaTimelineDuration;
  const isImageMatchDuration = (entry: { item: RenderItemV2 }) => {
    const ref = entry.item.source?.ref ?? '';
    return Boolean(ref && config.timeline?.imageMatchDuration?.[ref]);
  };

  const defaultDuration = 5;
  const rawItemTiming = inputs.map(entry => {
    const startRaw = Math.max(0, entry.item.timeline?.start ?? 0);
    const trimStartRaw = Math.max(0, entry.item.timeline?.trimStart ?? 0);
    const trimEndRaw = Math.max(0, entry.item.timeline?.trimEnd ?? 0);
    const hasExplicitDuration = (
      (typeof entry.duration === 'number' && Number.isFinite(entry.duration) && entry.duration > 0) ||
      Number.isFinite(entry.item.timeline?.duration)
    );
    const baseDuration = entry.duration && entry.duration > 0
      ? Math.max(0.1, entry.duration - trimStartRaw - trimEndRaw)
      : defaultDuration;
    const matchedImageDuration = entry.type === 'image' && isImageMatchDuration(entry) && resolvedTimelineDuration > 0
      ? resolvedTimelineDuration
      : null;
    const durationRaw = typeof matchedImageDuration === 'number'
      ? matchedImageDuration
      : Number.isFinite(entry.item.timeline?.duration)
      ? Math.max(0.1, Number(entry.item.timeline?.duration))
      : baseDuration;
    const endRaw = startRaw + durationRaw;
    return {
      entry,
      startRaw,
      durationRaw,
      trimStartRaw,
      endRaw,
      hasExplicitDuration: hasExplicitDuration || typeof matchedImageDuration === 'number'
    };
  });
  if (debugEnabled) {
    console.log(`RENDER_V2_DEBUG raw timing${debugLabel}`, JSON.stringify(rawItemTiming.map(t => ({
      id: t.entry.item?.id,
      type: t.entry.type,
      startRaw: t.startRaw,
      durationRaw: t.durationRaw,
      endRaw: t.endRaw,
      trimStartRaw: t.trimStartRaw,
      hasExplicitDuration: t.hasExplicitDuration
    }))));
  }

  const outputDurationFromItems = rawItemTiming.reduce((max, t) => Math.max(max, t.endRaw - outputStart), 0);
  const minOutputDuration = options?.allowShortDuration ? 0.001 : 0.1;
  const trimThreshold = options?.allowShortDuration ? 0.001 : 0.1;
  const sampleAt = Number.isFinite(options?.sampleAt) ? Math.max(0, Number(options?.sampleAt)) : null;
  const outputDurationRaw = Number.isFinite(options?.outputDuration)
    ? Number(options?.outputDuration)
    : (Number.isFinite(config.timeline.duration)
      ? Number(config.timeline.duration)
      : outputDurationFromItems);
  const outputDuration = Math.max(minOutputDuration, outputDurationRaw);

  const inputArgs: string[] = [];
  const inputEntries: Array<{
    type: RenderItemV2['type'];
    args: string[];
    item: RenderItemV2;
    timing?: { start: number; duration: number; trimStart: number };
  }> = [];

  const finalItemTiming: Array<{ entry: any; start: number; duration: number; trimStart: number }> = [];

  inputs.forEach((entry, idx) => {
    const args: string[] = [];
    const rawT = rawItemTiming[idx];
    let start = 0;
    let duration = 0;
    let trimStart = 0;
    if (sampleAt !== null) {
      // When source duration is unknown (ffprobe/parse failure), don't drop the item only because
      // of a fallback duration estimate. Keep it active after its start in preview sampling mode.
      if (rawT.hasExplicitDuration) {
        if (rawT.startRaw > sampleAt || rawT.endRaw <= sampleAt) return;
      } else if (rawT.startRaw > sampleAt) {
        return;
      }
      start = 0;
      duration = Math.max(trimThreshold, outputDuration);
      trimStart = entry.type === 'image'
        ? rawT.trimStartRaw
        : rawT.trimStartRaw + Math.max(0, sampleAt - rawT.startRaw);
    } else {
      if (rawT.endRaw <= outputStart || rawT.startRaw >= outputStart + outputDuration) {
        return;
      }
      start = Math.max(0, rawT.startRaw - outputStart);
      const end = Math.min(outputDuration, rawT.endRaw - outputStart);
      duration = Math.max(0.01, end - start);
      trimStart = entry.type === 'image'
        ? rawT.trimStartRaw
        : rawT.trimStartRaw + Math.max(0, outputStart - rawT.startRaw);
    }

    let inputSeek = 0;
    if ((entry.type === 'video' || entry.type === 'audio') && trimStart > 0) {
      inputSeek = Math.max(0, trimStart - INPUT_SEEK_PREROLL_SECONDS);
      trimStart = Math.max(0, trimStart - inputSeek);
    }

    const timing = { entry, start, duration, trimStart };
    finalItemTiming.push(timing);

    if (entry.type === 'image') {
      args.push('-loop', '1', '-t', String(duration + start));
    }
    if (inputSeek > 0) {
      args.push('-ss', String(inputSeek));
    }
    args.push('-i', entry.path);
    inputArgs.push(...args);
    inputEntries.push({
      type: entry.type,
      args,
      item: entry.item,
      timing
    });
  });

  const filters: string[] = [];
  filters.push(`color=c=${background}:s=${outW}x${outH}:d=${outputDuration}[base]`);

  let currentVideo = '[base]';
  let visualIndex = 0;
  let circleMaskPath: string | null = null;
  const sortedVisual = [...visualItems].sort((a, b) => (a.layer ?? 0) - (b.layer ?? 0));
  for (const item of sortedVisual) {
    const timing = finalItemTiming.find(t => t.entry.item === item);
    if (!timing) continue;

    const inputIndex = inputEntries.findIndex(e => e.item === item);
    if (inputIndex < 0) continue;

    const label = `[v${visualIndex}]`;
    const start = timing?.start ?? 0;
    const duration = timing?.duration ?? outputDuration;
    const end = Math.max(start + 0.01, start + duration);
    const scale = item.transform?.scale ?? 1;
    const rotation = item.transform?.rotation ?? 0;
    const opacity = Math.max(0, Math.min(100, item.transform?.opacity ?? 100)) / 100;
    const posX = item.transform?.x ?? 50;
    const posY = item.transform?.y ?? 50;
    const fit = item.transform?.fit ?? 'contain';
    const crop = item.transform?.crop;
    const xExpr = `(main_w-overlay_w)*${posX}/100`;
    const yExpr = `(main_h-overlay_h)*${posY}/100`;

    let chain = `[${inputIndex}:v]`;
    const addFilter = (filter: string) => {
      chain += chain.endsWith(']') ? filter : `,${filter}`;
    };
    const trimStart = timing?.trimStart ?? 0;
    const trimEndValue = trimStart + duration;
    if (trimStart > 0 || duration > trimThreshold) {
      addFilter(`trim=start=${trimStart}:end=${trimEndValue}`);
    }
    addFilter('setpts=PTS-STARTPTS');
    if (crop) {
      const cw = Math.max(0.1, Math.min(100, crop.w));
      const ch = Math.max(0.1, Math.min(100, crop.h));
      const cx = Math.max(0, Math.min(100, crop.x));
      const cy = Math.max(0, Math.min(100, crop.y));
      addFilter(
        `crop=iw*${(cw / 100).toFixed(4)}:ih*${(ch / 100).toFixed(4)}:iw*${(cx / 100).toFixed(4)}:ih*${(cy / 100).toFixed(4)}`
      );
    }
    if (fit === 'stretch') {
      addFilter(`scale=${outW}:${outH}`);
    } else if (fit === 'cover') {
      addFilter(`scale=${outW}:${outH}:force_original_aspect_ratio=increase`);
    } else {
      addFilter(`scale=${outW}:${outH}:force_original_aspect_ratio=decrease`);
    }
    if (scale !== 1) {
      addFilter(`scale=iw*${scale}:ih*${scale}`);
    }
    if (rotation !== 0) {
      const radians = (rotation * Math.PI) / 180;
      addFilter(`rotate=${radians}:fillcolor=none`);
    }
    addFilter('format=rgba');
    if (item.mask && (item.mask.type === 'rect' || item.mask.type === 'circle')) {
      const mx = Math.max(0, Math.min(100, Number(item.mask.x ?? 0)));
      const my = Math.max(0, Math.min(100, Number(item.mask.y ?? 0)));
      const mw = Math.max(0.1, Math.min(100, Number(item.mask.w ?? 100)));
      const mh = Math.max(0.1, Math.min(100, Number(item.mask.h ?? 100)));
      const splitLabelA = `[vms${visualIndex}a]`;
      const splitLabelB = `[vms${visualIndex}b]`;
      const outLabel = `[v${visualIndex}]`;
      const splitChain = chain.endsWith(']')
        ? `${chain}split=2${splitLabelA}${splitLabelB}`
        : `${chain},split=2${splitLabelA}${splitLabelB}`;
      filters.push(splitChain);
      if (item.mask.type === 'rect') {
        const cropLabel = `[vmcrop${visualIndex}]`;
        const clearLabel = `[vmclr${visualIndex}]`;
        const mxNorm = (mx / 100).toFixed(4);
        const myNorm = (my / 100).toFixed(4);
        const mwNorm = (mw / 100).toFixed(4);
        const mhNorm = (mh / 100).toFixed(4);
        filters.push(
          `${splitLabelA}crop=iw*${mwNorm}:ih*${mhNorm}:iw*${mxNorm}:ih*${myNorm}${cropLabel}`
        );
        filters.push(`${splitLabelB}colorchannelmixer=aa=0${clearLabel}`);
        let mergeChain = `${clearLabel}${cropLabel}overlay=x=W*${mxNorm}:y=H*${myNorm}:format=auto`;
        if (opacity < 1) {
          mergeChain += `,colorchannelmixer=aa=${opacity.toFixed(3)}`;
        }
        filters.push(`${mergeChain}${outLabel}`);
      } else {
        if (!circleMaskPath) {
          circleMaskPath = await ensureCircleMaskPgm(tmpDir);
        }
        const cropLabel = `[vmcrop${visualIndex}]`;
        const maskUnitLabel = `[vmmu${visualIndex}]`;
        const maskLabel = `[vmask${visualIndex}]`;
        const cropRefLabel = `[vmcr${visualIndex}]`;
        const maskedCropLabel = `[vmcm${visualIndex}]`;
        const clearLabel = `[vmclr${visualIndex}]`;
        const mxNorm = (mx / 100).toFixed(4);
        const myNorm = (my / 100).toFixed(4);
        const mwNorm = (mw / 100).toFixed(4);
        const mhNorm = (mh / 100).toFixed(4);
        filters.push(
          `${splitLabelA}crop=iw*${mwNorm}:ih*${mhNorm}:iw*${mxNorm}:ih*${myNorm}${cropLabel}`
        );
        filters.push(`movie='${escapeFilterPath(circleMaskPath)}',format=gray,${STATIC_MASK_LOOP_FILTER}${maskUnitLabel}`);
        filters.push(`${maskUnitLabel}${cropLabel}scale2ref${maskLabel}${cropRefLabel}`);
        filters.push(`${cropRefLabel}${maskLabel}alphamerge${maskedCropLabel}`);
        filters.push(`${splitLabelB}colorchannelmixer=aa=0${clearLabel}`);
        let mergeChain = `${clearLabel}${maskedCropLabel}overlay=x=W*${mxNorm}:y=H*${myNorm}:format=auto`;
        if (opacity < 1) {
          mergeChain += `,colorchannelmixer=aa=${opacity.toFixed(3)}`;
        }
        filters.push(`${mergeChain}${outLabel}`);
      }
    } else {
      if (opacity < 1) {
        addFilter(`colorchannelmixer=aa=${opacity.toFixed(3)}`);
      }
      filters.push(`${chain}${label}`);
    }
    const itemBlurEffects = parseBlurRegionEffects(
      Array.isArray(item.effects)
        ? item.effects
          .filter(effect => effect && effect.type === 'blur_region')
          .map(effect => ({ type: 'blur_region', ...((effect.params ?? {}) as Record<string, unknown>) }))
        : []
    );
    let overlayInputLabel = label;
    if (itemBlurEffects.length > 0) {
      let blurCurrentLabel = label;
      for (let effectIndex = 0; effectIndex < itemBlurEffects.length; effectIndex += 1) {
        const effect = itemBlurEffects[effectIndex];
        const x = effect.left;
        const y = effect.top;
        const w = 100 - effect.left - effect.right;
        const h = 100 - effect.top - effect.bottom;
        const sigma = effect.sigma;
        const feather = effect.feather > 0 ? effect.feather : 0;
        const main = `ivm${visualIndex}_${effectIndex}`;
        const tmp = `ivt${visualIndex}_${effectIndex}`;
        const out = `ivo${visualIndex}_${effectIndex}`;
        // Stronger blur for subtitle masking: use gaussian blur instead of boxblur.
        const gblurSigma = Math.max(2, Math.min(96, Number(sigma) * 1.8));
        const gblurSteps = Math.max(1, Math.min(6, Math.round(gblurSigma / 10)));
        const bl = `ivb${visualIndex}_${effectIndex}`;
        filters.push(`${blurCurrentLabel}split=2[${main}][${tmp}]`);
        filters.push(
          `[${tmp}]crop=iw*${w}/100:ih*${h}/100:iw*${x}/100:ih*${y}/100,format=rgba,gblur=sigma=${gblurSigma.toFixed(2)}:steps=${gblurSteps}:planes=0x7,format=rgba[${bl}]`
        );
        if (feather > 0) {
          const maskPath = await ensureFeatherMaskPgm(tmpDir, feather);
          const featherMaskSigma = Math.max(0.8, Math.min(16, feather * 1.2));
          const mu = `ivmu${visualIndex}_${effectIndex}`;
          const mk = `ivmk${visualIndex}_${effectIndex}`;
          const br = `ivbr${visualIndex}_${effectIndex}`;
          const ba = `ivba${visualIndex}_${effectIndex}`;
          filters.push(
            `movie='${escapeFilterPath(maskPath)}',format=gray,gblur=sigma=${featherMaskSigma.toFixed(2)}:steps=2,${STATIC_MASK_LOOP_FILTER}[${mu}]`
          );
          filters.push(`[${mu}][${bl}]scale2ref[${mk}][${br}]`);
          filters.push(`[${br}][${mk}]alphamerge[${ba}]`);
          filters.push(`[${main}][${ba}]overlay=W*${x}/100:H*${y}/100:format=auto[${out}]`);
        } else {
          filters.push(`[${main}][${bl}]overlay=W*${x}/100:H*${y}/100[${out}]`);
        }
        blurCurrentLabel = `[${out}]`;
      }
      overlayInputLabel = blurCurrentLabel;
    }
    const overlayFilter = sampleAt === null
      ? `overlay=x=${xExpr}:y=${yExpr}:enable='between(t,${start},${end})'`
      : `overlay=x=${xExpr}:y=${yExpr}`;
    filters.push(`${currentVideo}${overlayInputLabel}${overlayFilter}[v${visualIndex}o]`);
    currentVideo = `[v${visualIndex}o]`;
    visualIndex += 1;
  }

  for (let idx = 0; idx < subtitleItems.length; idx += 1) {
    const subtitleItem = subtitleItems[idx];
    const timing = finalItemTiming.find(t => t.entry.item === subtitleItem);
    if (!timing) continue;

    const subPath = resolveRenderInputPath(subtitleItem.source?.ref, config.inputsMap)
      ?? (subtitleItem.source?.path ? resolveSafePath(subtitleItem.source.path) : null);
    if (!subPath) continue;
    const start = timing.start;
    const end = start + timing.duration;
    const stylePayload = {
      ...(subtitleItem.subtitleStyle ?? {}),
      playResX: outW,
      playResY: outH,
      shift: -outputStart
    };
    const style = parseAssRenderStyle(stylePayload);
    const assOut = path.join(tmpDir, `render-v2-${idx}.ass`);
    try {
      await writeStyledAssFile(subPath, style, assOut);
      const subFilter = buildSubtitlesVideoFilter(assOut, { w: style.playResX, h: style.playResY });
      const label = `[vsub${idx}]`;
      // Note: subtitles filter already honors subtitle timestamps; avoid enable=... for wider ffmpeg compatibility.
      filters.push(`${currentVideo}${subFilter}${label}`);
      currentVideo = label;
    } catch {
      // ignore subtitle parsing errors
    }
  }

  for (let idx = 0; idx < textItems.length; idx += 1) {
    const textItem = textItems[idx];
    const rawText = typeof textItem.text?.value === 'string' ? textItem.text.value.trim() : '';
    if (!rawText) continue;
    const isTextMatchDuration = String(textItem.text?.matchDuration ?? '0') === '1';

    const itemStartRaw = isTextMatchDuration
      ? 0
      : (Number.isFinite(textItem.text?.start)
        ? Number(textItem.text?.start)
        : (textItem.timeline?.start ?? 0));
    const itemEndRaw = isTextMatchDuration
      ? (resolvedTimelineDuration > 0 ? resolvedTimelineDuration : (itemStartRaw + 5))
      : (Number.isFinite(textItem.text?.end)
        ? Number(textItem.text?.end)
        : (Number.isFinite(textItem.timeline?.duration)
          ? itemStartRaw + Number(textItem.timeline?.duration)
          : itemStartRaw + 5));

    if (itemEndRaw <= outputStart || itemStartRaw >= outputStart + outputDuration) {
      continue;
    }

    const stylePayload = {
      ...(textItem.subtitleStyle ?? {}),
      playResX: outW,
      playResY: outH,
      shift: -outputStart
    };
    const style = parseAssRenderStyle(stylePayload);
    const assOut = path.join(tmpDir, `render-text-${idx}.ass`);
    try {
      const doc = buildAssDocument([{ start: itemStartRaw, end: itemEndRaw, text: rawText }], style);
      await fs.writeFile(assOut, doc, 'utf-8');
      const subFilter = buildSubtitlesVideoFilter(assOut, { w: style.playResX, h: style.playResY });
      const label = `[vtext${idx}]`;
      filters.push(`${currentVideo}${subFilter}${label}`);
      currentVideo = label;
    } catch {
      // ignore text rendering errors
    }
  }

  const audioFilters: string[] = [];
  let audioIndex = 0;
  for (const item of audioItems) {
    if (!includeAudio) break;
    const timing = finalItemTiming.find(t => t.entry.item === item);
    if (!timing) continue;

    const inputIndex = inputEntries.findIndex(e => e.item === item);
    if (inputIndex < 0) continue;
    if (item.audioMix?.mute) continue;

    const label = `[a${audioIndex}]`;
    let chain = `[${inputIndex}:a]`;
    const addFilter = (filter: string) => {
      chain += chain.endsWith(']') ? filter : `,${filter}`;
    };
    const trimStart = timing.trimStart;
    const duration = timing.duration;
    const endValue = trimStart + duration;
    if (trimStart > 0 || duration > trimThreshold) {
      addFilter(`atrim=start=${trimStart}:end=${endValue}`);
    }
    addFilter('asetpts=PTS-STARTPTS');
    const gainDb = item.audioMix?.gainDb ?? 0;
    if (gainDb !== 0) {
      const factor = Math.pow(10, gainDb / 20);
      addFilter(`volume=${factor.toFixed(4)}`);
    }
    const start = timing.start;
    if (start > 0) {
      const ms = Math.round(start * 1000);
      addFilter(`adelay=${ms}|${ms}`);
    }
    const fadeIn = Math.max(0, item.audioMix?.fadeIn ?? 0);
    if (fadeIn > 0) {
      addFilter(`afade=t=in:st=${start}:d=${fadeIn}`);
    }
    const fadeOut = Math.max(0, item.audioMix?.fadeOut ?? 0);
    if (fadeOut > 0) {
      const end = Math.max(start + 0.01, start + duration);
      const fadeOutStart = Math.max(start, end - fadeOut);
      addFilter(`afade=t=out:st=${fadeOutStart}:d=${fadeOut}`);
    }
    audioFilters.push(`${chain}${label}`);
    audioIndex += 1;
  }

  let audioMap: string[] = [];
  if (includeAudio && audioFilters.length > 0) {
    const mixInputs = audioFilters.map((_, idx) => `[a${idx}]`).join('');
    filters.push(...audioFilters);
    filters.push(`${mixInputs}amix=inputs=${audioFilters.length}:duration=longest[aout]`);
    audioMap = ['-map', '[aout]'];
  }

  const filterComplex = filters.filter(f => f && f.trim().length > 0).join(';');
  if (debugEnabled) {
    console.log(`RENDER_V2_DEBUG final timing${debugLabel}`, JSON.stringify(finalItemTiming.map(t => ({
      id: t.entry.item?.id,
      type: t.entry.type,
      start: t.start,
      duration: t.duration,
      trimStart: t.trimStart,
      end: t.start + t.duration
    }))));
  }

  return {
    inputArgs,
    inputEntries,
    filterComplex,
    videoLabel: currentVideo,
    audioMap,
    outputDuration,
    framerate
  };
};

const buildRenderV2FfmpegArgs = async (
  config: RenderConfigV2,
  outputPath: string,
  tmpDir: string,
  options?: {
    outputStart?: number;
    outputDuration?: number;
    allowShortDuration?: boolean;
    debugEnabled?: boolean;
    debugLabel?: string;
  }
) => {
  const graph = await buildRenderV2FilterGraph(config, tmpDir, options);
  const renderOptions = config.renderOptions ?? {};
  const threadCount = RENDER_V2_FFMPEG_THREADS;
  const codec = renderOptions.codec === 'h265' ? 'libx265' : 'libx264';
  const preset = typeof renderOptions.preset === 'string' && renderOptions.preset.trim()
    ? renderOptions.preset.trim()
    : 'fast';
  const crf = Number.isFinite(renderOptions.crf) ? Number(renderOptions.crf) : 21;
  const tune = typeof renderOptions.tune === 'string' && renderOptions.tune.trim()
    ? renderOptions.tune.trim()
    : '';
  let gop = Number.isFinite(renderOptions.gop) ? Number(renderOptions.gop) : 0;
  if (!Number.isFinite(gop) || gop <= 0) {
    const fr = Number(graph.framerate);
    if (Number.isFinite(fr) && fr > 0) gop = Math.round(fr * 2);
  }
  const args = [
    '-y',
    ...graph.inputArgs,
    '-filter_complex',
    graph.filterComplex,
    '-map',
    graph.videoLabel,
    ...graph.audioMap,
    '-c:v',
    codec,
    '-preset',
    preset,
    '-crf',
    String(crf),
    ...(tune ? ['-tune', tune] : []),
    ...(gop && gop > 0 ? ['-g', String(Math.round(gop))] : []),
    ...(threadCount ? ['-threads', String(threadCount)] : []),
    '-r',
    String(graph.framerate),
    '-t',
    String(graph.outputDuration),
    '-pix_fmt',
    'yuv420p',
    outputPath
  ];

  return { args, outputDuration: graph.outputDuration };
};

const parseFfmpegProgressSeconds = (text: string) => {
  const match = text.match(/time=\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  const s = Number(match[3]);
  if (!Number.isFinite(h) || !Number.isFinite(m) || !Number.isFinite(s)) return null;
  return h * 3600 + m * 60 + s;
};

const runFfmpegLoggedCommand = async (
  ffmpegPath: string,
  args: string[],
  label: string,
  onLog?: (chunk: string) => void,
  onSpawn?: (proc: ReturnType<typeof spawn>) => void,
  onProgressSeconds?: (seconds: number) => void
) => {
  const commandLine = [ffmpegPath, ...args].map(formatArg).join(' ');
  onLog?.(`COMMAND (${label}): ${commandLine}\n`);
  let lastProgressSeconds = 0;
  await new Promise<void>((resolve, reject) => {
    const proc = spawn(ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    onSpawn?.(proc);
    proc.stdout.on('data', data => onLog?.(data.toString()));
    proc.stderr.on('data', data => {
      const text = data.toString();
      onLog?.(text);
      if (!onProgressSeconds) return;
      const seconds = parseFfmpegProgressSeconds(text);
      if (seconds === null) return;
      if (seconds <= lastProgressSeconds) return;
      lastProgressSeconds = seconds;
      onProgressSeconds(seconds);
    });
    proc.on('error', reject);
    proc.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}`));
    });
  });
};

const buildRenderInputFingerprints = async (config: RenderConfigV2) => {
  const sourceItems = config.items.filter(item => (
    item.type === 'video'
    || item.type === 'audio'
    || item.type === 'image'
    || item.type === 'subtitle'
  ));
  const fingerprints: Array<{ resolvedPath: string; size: number; mtimeMs: number }> = [];
  const missing: string[] = [];
  const seen = new Set<string>();
  for (const item of sourceItems) {
    const pathFromRef = resolveRenderInputPath(item.source?.ref, config.inputsMap);
    const sourcePath = pathFromRef ?? (item.source?.path ? resolveSafePath(item.source.path) : null);
    if (!sourcePath) {
      missing.push(`${item.id}:${item.source?.ref ?? item.source?.path ?? ''}`);
      continue;
    }
    if (seen.has(sourcePath)) continue;
    seen.add(sourcePath);
    try {
      const stats = await fs.stat(sourcePath);
      fingerprints.push({
        resolvedPath: sourcePath,
        size: Number(stats.size),
        mtimeMs: Math.round(Number(stats.mtimeMs))
      });
    } catch {
      missing.push(`${item.id}:${sourcePath}`);
    }
  }
  fingerprints.sort((a, b) => a.resolvedPath.localeCompare(b.resolvedPath));
  missing.sort((a, b) => a.localeCompare(b));
  return { fingerprints, missing };
};

const buildRenderV2Signature = async (config: RenderConfigV2) => {
  const inputFingerprints = await buildRenderInputFingerprints(config);
  const payload = {
    version: 1,
    segmentSeconds: RENDER_V2_SEGMENT_SECONDS,
    inputs: inputFingerprints,
    config
  };
  const signature = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 20);
  return { signature, payload };
};

const isReusableRenderSegment = async (segmentPath: string, expectedDuration: number) => {
  try {
    const stats = await fs.stat(segmentPath);
    if (!stats.isFile() || stats.size <= 0) return false;
    const duration = await runFfprobe(segmentPath).catch(() => 0);
    if (!Number.isFinite(duration) || duration <= 0) return false;
    const tolerance = Math.max(0.5, expectedDuration * 0.03);
    return Math.abs(duration - expectedDuration) <= tolerance;
  } catch {
    return false;
  }
};

const escapeConcatFilePath = (value: string) => value.replace(/'/g, `'\\''`);

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
  const outputName = `render-${formatRenderTimestamp(new Date())}.mp4`;
  const outputPath = path.join(outputDir, outputName);
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'render-v2-'));
  try {
    const ffmpegPath = await getFfmpegPath();
    const { outputDuration } = await buildRenderV2FfmpegArgs(config, outputPath, tmpDir, {
      debugEnabled: LOG_RENDER_V2_DEBUG,
      debugLabel: 'render-total'
    });
    const totalSeconds = Number.isFinite(outputDuration) && outputDuration > 0 ? outputDuration : 0;
    if (totalSeconds <= 0) {
      throw new Error('Render has no output duration');
    }
    const { signature, payload } = await buildRenderV2Signature(config);
    const segmentSeconds = Math.min(payload.segmentSeconds, Math.max(1, totalSeconds));
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
        signature,
        ...payload
      }, null, 2),
      'utf-8'
    ).catch(() => null);

    const segmentCount = Math.max(1, Math.ceil(totalSeconds / segmentSeconds));
    let completedSeconds = 0;
    for (let segmentIndex = 0; segmentIndex < segmentCount; segmentIndex += 1) {
      const startSeconds = segmentIndex * segmentSeconds;
      const expectedDuration = Math.max(0.001, Math.min(segmentSeconds, totalSeconds - startSeconds));
      const segmentName = `seg-${String(segmentIndex).padStart(5, '0')}.mp4`;
      const segmentPath = path.join(segmentsDir, segmentName);
      // Keep ".mp4" extension on temporary segment files so older ffmpeg builds
      // can infer output format without requiring an explicit "-f mp4".
      const partialSegmentPath = `${segmentPath.replace(/\.mp4$/i, '')}.part.mp4`;
      const reusable = await isReusableRenderSegment(segmentPath, expectedDuration);
      if (reusable) {
        completedSeconds = Math.min(totalSeconds, startSeconds + expectedDuration);
        onLog?.(`CACHE HIT (render segment ${segmentIndex + 1}/${segmentCount}): ${path.relative(projectRoot, segmentPath)}\n`);
        onProgress?.(completedSeconds, totalSeconds);
        continue;
      }
      await fs.rm(partialSegmentPath, { force: true }).catch(() => null);
      const { args } = await buildRenderV2FfmpegArgs(
        config,
        partialSegmentPath,
        tmpDir,
        {
          outputStart: startSeconds,
          outputDuration: expectedDuration,
          allowShortDuration: true,
          debugEnabled: LOG_RENDER_V2_DEBUG,
          debugLabel: `render-segment-${segmentIndex + 1}`
        }
      );
      await runFfmpegLoggedCommand(
        ffmpegPath,
        args,
        `render v2 segment ${segmentIndex + 1}/${segmentCount}`,
        onLog,
        onSpawn,
        seconds => {
          if (!onProgress) return;
          const bounded = Math.min(expectedDuration, Math.max(0, seconds));
          onProgress(Math.min(totalSeconds, startSeconds + bounded), totalSeconds);
        }
      );
      await fs.rename(partialSegmentPath, segmentPath);
      completedSeconds = Math.min(totalSeconds, startSeconds + expectedDuration);
      onProgress?.(completedSeconds, totalSeconds);
    }

    const concatListPath = path.join(cacheRoot, 'concat.txt');
    const concatLines: string[] = [];
    for (let segmentIndex = 0; segmentIndex < segmentCount; segmentIndex += 1) {
      const segmentName = `seg-${String(segmentIndex).padStart(5, '0')}.mp4`;
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
    const renderTask = job.tasks.find(task => task.type === 'render');
    if (renderTask) {
      const rawConfig = (job as any).__renderConfigV2 ?? (job.params as any)?.render?.configV2;
      const config = resolveRenderConfigV2(rawConfig);
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
    scheduleJobPersist(job);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Job failed';
    if ((job as any).__cancelRequested || message === CANCELLED_ERROR_MESSAGE) {
      job.status = 'cancelled';
      job.error = CANCELLED_ERROR_MESSAGE;
      job.eta = undefined;
      (job as any).__activeProcess = undefined;
      appendJobLog(job, CANCELLED_ERROR_MESSAGE);
    } else {
      job.status = 'failed';
      job.error = message;
      job.eta = undefined;
      (job as any).__activeProcess = undefined;
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

const normalizeTtsOutputSettings = (options?: {
  voice?: string;
  rate?: number;
  pitch?: number;
  volume?: number;
  overlapMode?: 'overlap' | 'truncate';
  removeLineBreaks?: boolean;
}): TtsOutputSettings => ({
  voice: options?.voice?.trim() || DEFAULT_TTS_VOICE,
  rate: typeof options?.rate === 'number' && Number.isFinite(options.rate) ? options.rate : undefined,
  pitch: typeof options?.pitch === 'number' && Number.isFinite(options.pitch) ? options.pitch : undefined,
  volume: typeof options?.volume === 'number' && Number.isFinite(options.volume) ? options.volume : undefined,
  overlapMode: options?.overlapMode === 'overlap' ? 'overlap' : 'truncate',
  removeLineBreaks: options?.removeLineBreaks !== false
});

const buildTtsOutputSignature = (settings: TtsOutputSettings) => {
  const payload = {
    voice: settings.voice,
    rate: settings.rate ?? null,
    pitch: settings.pitch ?? null,
    volume: settings.volume ?? null,
    overlapMode: settings.overlapMode,
    removeLineBreaks: settings.removeLineBreaks
  };
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 10);
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

const runFfprobeSampleRateWithBin = (bin: string, input: string) => new Promise<number>((resolve, reject) => {
  const args = [
    '-v', 'error',
    '-select_streams', 'a:0',
    '-show_entries', 'stream=sample_rate',
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
    const value = Number.parseInt(output.trim(), 10);
    resolve(Number.isFinite(value) ? value : 0);
  });
});

const runFfprobeStreamSamplesWithBin = (bin: string, input: string) => new Promise<{ durationTs: number; sampleRate: number; timeBase: string }>((resolve, reject) => {
  const args = [
    '-v', 'error',
    '-select_streams', 'a:0',
    '-show_entries', 'stream=duration_ts,sample_rate,time_base',
    '-of', 'default=noprint_wrappers=1:nokey=0',
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
    const values = new Map<string, string>();
    output.split(/\r?\n/).forEach(raw => {
      const line = raw.trim();
      if (!line) return;
      const idx = line.indexOf('=');
      if (idx <= 0) return;
      values.set(line.slice(0, idx), line.slice(idx + 1));
    });
    const sampleRate = Number.parseInt(values.get('sample_rate') ?? '', 10);
    const durationTs = Number.parseInt(values.get('duration_ts') ?? '', 10);
    const timeBase = values.get('time_base') ?? '0/1';
    resolve({
      durationTs: Number.isFinite(durationTs) ? durationTs : 0,
      sampleRate: Number.isFinite(sampleRate) ? sampleRate : 0,
      timeBase
    });
  });
});

const runFfprobeStartTimeWithBin = (bin: string, input: string) => new Promise<number>((resolve, reject) => {
  const args = [
    '-v', 'error',
    '-show_entries', 'format=start_time',
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
  outputSignature: string;
  voice: string;
  rate?: number;
  pitch?: number;
  volume?: number;
  overlapSeconds: number;
  overlapMode: 'overlap' | 'truncate';
  removeLineBreaks: boolean;
};

type TtsOutputSettings = {
  voice: string;
  rate?: number;
  pitch?: number;
  volume?: number;
  overlapMode: 'overlap' | 'truncate';
  removeLineBreaks: boolean;
};

type CueCacheIdentity = {
  sourceRelativePath: string;
  cueIndex: number;
  cueStartMs: number;
  cueEndMs: number;
  cueText: string;
  voice: string;
  volume: string | null;
  removeLineBreaks: boolean;
  outputExt: string;
  engineCommand: string;
};

type CueCacheMeta = {
  createdAt: string;
  audioPath: string;
  durationSeconds: number;
  sampleRateHz: number;
  identity: CueCacheIdentity;
};

type CueFxCacheIdentity = {
  baseCueKey: string;
  cueIndex: number;
  rate: number;
  pitch: number;
  outputExt: string;
  engine: 'ffmpeg';
};

type CueFxCacheMeta = {
  createdAt: string;
  audioPath: string;
  durationSeconds: number;
  identity: CueFxCacheIdentity;
  filter: string;
};

const fileExists = async (fullPath: string) =>
  fs.access(fullPath).then(() => true).catch(() => false);

const toCueCacheKey = (identity: CueCacheIdentity) =>
  crypto.createHash('sha256').update(JSON.stringify(identity)).digest('hex').slice(0, 24);

const buildCueCacheIdentity = (
  sourceRelativePath: string,
  cue: SubtitleCue,
  cueIndex: number,
  voice: string,
  volume: string | undefined,
  removeLineBreaks: boolean,
  outputExt: string,
  engineCommand: string
): CueCacheIdentity => ({
  sourceRelativePath,
  cueIndex,
  cueStartMs: Math.max(0, Math.round(cue.start * 1000)),
  cueEndMs: Math.max(0, Math.round(cue.end * 1000)),
  cueText: cue.text,
  voice,
  volume: volume ?? null,
  removeLineBreaks,
  outputExt,
  engineCommand,
});

const buildCueCachePaths = (projectRoot: string, cueIndex: number, key: string, outputExt: string) => {
  const cacheDir = path.join(projectRoot, TTS_CUE_CACHE_DIRNAME);
  const stem = `cue-${String(cueIndex + 1).padStart(4, '0')}-${key}`;
  return {
    cacheDir,
    audioPath: path.join(cacheDir, `${stem}.${outputExt}`),
    metaPath: path.join(cacheDir, `${stem}.json`)
  };
};

const readCueCacheMeta = async (metaPath: string): Promise<CueCacheMeta | null> => {
  try {
    const raw = await fs.readFile(metaPath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.identity) return null;
    return parsed as CueCacheMeta;
  } catch {
    return null;
  }
};

const sameCueIdentity = (left: CueCacheIdentity, right: CueCacheIdentity) =>
  left.sourceRelativePath === right.sourceRelativePath &&
  left.cueIndex === right.cueIndex &&
  left.cueStartMs === right.cueStartMs &&
  left.cueEndMs === right.cueEndMs &&
  left.cueText === right.cueText &&
  left.voice === right.voice &&
  left.volume === right.volume &&
  left.removeLineBreaks === right.removeLineBreaks &&
  left.outputExt === right.outputExt &&
  left.engineCommand === right.engineCommand;

const sanitizeRateFactor = (value?: number) => {
  if (value === undefined || value === null || !Number.isFinite(value) || value <= 0) return 1;
  return value;
};

const sanitizePitchSemitones = (value?: number) => {
  if (value === undefined || value === null || !Number.isFinite(value)) return 0;
  return value;
};

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

const buildCueFxCachePaths = (projectRoot: string, cueIndex: number, key: string, outputExt: string) => {
  const cacheDir = path.join(projectRoot, TTS_CUE_CACHE_DIRNAME);
  const stem = `cue-${String(cueIndex + 1).padStart(4, '0')}-fx-${key}`;
  return {
    cacheDir,
    audioPath: path.join(cacheDir, `${stem}.${outputExt}`),
    metaPath: path.join(cacheDir, `${stem}.json`)
  };
};

const readCueFxMeta = async (metaPath: string): Promise<CueFxCacheMeta | null> => {
  try {
    const raw = await fs.readFile(metaPath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.identity) return null;
    return parsed as CueFxCacheMeta;
  } catch {
    return null;
  }
};

const sameCueFxIdentity = (left: CueFxCacheIdentity, right: CueFxCacheIdentity) =>
  left.baseCueKey === right.baseCueKey &&
  left.cueIndex === right.cueIndex &&
  Math.abs(left.rate - right.rate) < 0.000001 &&
  Math.abs(left.pitch - right.pitch) < 0.000001 &&
  left.outputExt === right.outputExt &&
  left.engine === right.engine;

const shouldRetryEdgeTtsError = (message: string) => {
  return /429|rate limit|throttl|temporar|try again|server is busy|NoAudioReceived/i.test(message);
};

const runEdgeTtsWithRetry = async (
  command: string,
  args: string[],
  onLog?: (chunk: string) => void,
  contextLabel?: string
) => {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= EDGE_TTS_MAX_RETRIES; attempt += 1) {
    const attemptLabel = contextLabel ? `${contextLabel} attempt ${attempt}/${EDGE_TTS_MAX_RETRIES}` : `attempt ${attempt}/${EDGE_TTS_MAX_RETRIES}`;
    onLog?.(`EDGE-TTS ${attemptLabel}: ${[command, ...args].join(' ')}
`);
    try {
      await new Promise<void>((resolve, reject) => {
        const proc = spawn(command, args);
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
      onLog?.(`EDGE-TTS ${attemptLabel} succeeded\n`);
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      lastError = error instanceof Error ? error : new Error(message);
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
  const ttsSettings = normalizeTtsOutputSettings(options);
  const removeLineBreaks = ttsSettings.removeLineBreaks;
  const raw = await fs.readFile(inputFullPath, 'utf-8');
  const cues = ext === '.ass' || ext === '.ssa'
    ? parseAssCues(raw, removeLineBreaks)
    : parseSrtVttCues(raw, removeLineBreaks);
  if (!cues.length) {
    throw new Error('Subtitle file has no usable cues');
  }
  const cueDurations = cues.map(cue => Math.max(0, cue.end - cue.start));
  const audioDurations: number[] = [];
  await fs.mkdir(outputDir, { recursive: true });
  const { outputName, outputSignature } = buildTtsOutputName(inputFullPath, ttsSettings);
  const outputPath = path.join(outputDir, outputName);
  const voice = ttsSettings.voice;
  const volume = formatTtsVolume(ttsSettings.volume);
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
    const identity = buildCueCacheIdentity(
      sourceRelativePath,
      cue,
      i,
      voice,
      volume,
      removeLineBreaks,
      TTS_CUE_OUTPUT_EXT,
      EDGE_TTS_CMD
    );
    const key = toCueCacheKey(identity);
    const { cacheDir, audioPath, metaPath } = buildCueCachePaths(projectRoot, i, key, TTS_CUE_OUTPUT_EXT);
    await fs.mkdir(cacheDir, { recursive: true });
    const existingMeta = await readCueCacheMeta(metaPath);
    const reusable = await fileExists(audioPath) && !!existingMeta && sameCueIdentity(existingMeta.identity, identity);
    let sourceCuePath = audioPath;
    let sourceDuration = 0;
    let sourceSampleRate = 0;
    if (reusable) {
      const durationFromMeta = Number(existingMeta.durationSeconds);
      if (Number.isFinite(durationFromMeta) && durationFromMeta > 0) {
        sourceDuration = durationFromMeta;
      } else {
        const duration = await runFfprobe(audioPath).catch(() => 0);
        sourceDuration = duration;
      }
      const sampleRateFromMeta = Number((existingMeta as any).sampleRateHz);
      if (Number.isFinite(sampleRateFromMeta) && sampleRateFromMeta > 0) {
        sourceSampleRate = sampleRateFromMeta;
      } else {
        sourceSampleRate = await runFfprobeSampleRate(audioPath).catch(() => 0);
      }
      options?.onLog?.(`CACHE HIT (tts cue raw ${i + 1}/${cues.length}): ${path.relative(projectRoot, audioPath)}\n`);
    } else {
      const args = [
        '--text',
        cue.text,
        '--voice',
        voice,
        '--write-media',
        audioPath,
        ...withFlagValue('--volume', volume)
      ];
      const commandLine = [EDGE_TTS_CMD, ...args].map(formatArg).join(' ');
      options?.onLog?.(`COMMAND (tts cue raw ${i + 1}/${cues.length}): ${commandLine}\n`);
      await runEdgeTtsWithRetry(EDGE_TTS_CMD, args, options?.onLog, `tts cue ${i + 1}/${cues.length}`);
      const normalizedPath = `${audioPath}.norm.wav`;
      try {
        const normalizeArgs = [
          '-y',
          '-i',
          audioPath,
          '-vn',
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
        await new Promise<void>((resolve, reject) => {
          const proc = spawn(ffmpegPath, normalizeArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
          let stderr = '';
          proc.stderr.on('data', data => {
            stderr += data.toString();
          });
          proc.on('error', reject);
          proc.on('close', code => {
            if (code === 0) resolve();
            else reject(new Error(stderr.trim() || `ffmpeg (cue normalize) exited with code ${code}`));
          });
        });
        await fs.rename(normalizedPath, audioPath);
      } finally {
        await fs.rm(normalizedPath, { force: true }).catch(() => null);
      }
      sourceDuration = await runFfprobe(audioPath).catch(() => 0);
      sourceSampleRate = await runFfprobeSampleRate(audioPath).catch(() => 0);
      const meta: CueCacheMeta = {
        createdAt: new Date().toISOString(),
        audioPath: path.relative(projectRoot, audioPath),
        durationSeconds: sourceDuration,
        sampleRateHz: sourceSampleRate,
        identity
      };
      await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
    }

    if (!sourceSampleRate || sourceSampleRate <= 0) {
      sourceSampleRate = TTS_INTERNAL_SAMPLE_RATE;
    }
    const cueFxFilter = buildCueFxFilter(fxRate, fxPitch, sourceSampleRate);

    if (!cueFxFilter) {
      cuePaths[i] = sourceCuePath;
      audioDurations[i] = sourceDuration;
      completedCueCount += 1;
      options?.onProgress?.(completedCueCount, cues.length);
      return;
    }

    const fxIdentity: CueFxCacheIdentity = {
      baseCueKey: key,
      cueIndex: i,
      rate: roundFactor(fxRate),
      pitch: roundFactor(fxPitch),
      outputExt: TTS_CUE_OUTPUT_EXT,
      engine: 'ffmpeg'
    };
    const fxKey = crypto.createHash('sha256').update(JSON.stringify(fxIdentity)).digest('hex').slice(0, 24);
    const fxPaths = buildCueFxCachePaths(projectRoot, i, fxKey, TTS_CUE_OUTPUT_EXT);
    await fs.mkdir(fxPaths.cacheDir, { recursive: true });
    const fxMeta = await readCueFxMeta(fxPaths.metaPath);
    const fxReusable = await fileExists(fxPaths.audioPath)
      && !!fxMeta
      && sameCueFxIdentity(fxMeta.identity, fxIdentity)
      && fxMeta.filter === cueFxFilter;

    if (fxReusable) {
      cuePaths[i] = fxPaths.audioPath;
      const durationFromMeta = Number(fxMeta.durationSeconds);
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
      fxPaths.audioPath
    ];
    const fxCommand = [ffmpegPath, ...fxArgs].map(formatArg).join(' ');
    options?.onLog?.(`COMMAND (ffmpeg cue fx ${i + 1}/${cues.length}): ${fxCommand}\n`);
    await new Promise<void>((resolve, reject) => {
      const proc = spawn(ffmpegPath, fxArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
      let stderr = '';
      proc.stderr.on('data', data => {
        stderr += data.toString();
      });
      proc.on('error', reject);
      proc.on('close', code => {
        if (code === 0) resolve();
        else reject(new Error(stderr.trim() || `ffmpeg (cue fx) exited with code ${code}`));
      });
    });
    const fxDuration = await runFfprobe(fxPaths.audioPath).catch(() => 0);
    const fxMetaPayload: CueFxCacheMeta = {
      createdAt: new Date().toISOString(),
      audioPath: path.relative(projectRoot, fxPaths.audioPath),
      durationSeconds: fxDuration,
      identity: fxIdentity,
      filter: cueFxFilter
    };
    await fs.writeFile(fxPaths.metaPath, JSON.stringify(fxMetaPayload, null, 2), 'utf-8');
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
          `[${inputIndex}:a]atrim=start_sample=${sourceTrimStartSamples}:end_sample=${trimEndSample},asetpts=PTS-STARTPTS,adelay=${delaySamples}S|${delaySamples}S,aresample=${TTS_INTERNAL_SAMPLE_RATE}[a${inputIndex}]`
        );
        mixInputs.push(`[a${inputIndex}]`);
        inputIndex += 1;
      });

      const filter = [
        ...filterChains,
        `${mixInputs.join('')}amix=inputs=${mixInputs.length}:duration=longest:dropout_transition=0[mix_raw]`,
        `[mix_raw]volume=${mixInputs.length.toFixed(4)},alimiter=limit=0.97[out]`
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
      try {
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
    await new Promise<void>((resolve, reject) => {
      const proc = spawn(ffmpegPath, concatArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
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
    volume: ttsSettings.volume,
    overlapSeconds,
    overlapMode,
    removeLineBreaks
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

const runFfprobeSampleRate = async (input: string) => {
  try {
    return await runFfprobeSampleRateWithBin(process.env.FFPROBE_PATH ?? 'ffprobe', input);
  } catch (error) {
    if (error instanceof Error && error.message.includes('ENOENT')) {
      return await runFfprobeSampleRateWithBin('/usr/bin/ffprobe', input);
    }
    throw error;
  }
};

const runFfprobeStreamSamples = async (input: string) => {
  try {
    return await runFfprobeStreamSamplesWithBin(process.env.FFPROBE_PATH ?? 'ffprobe', input);
  } catch (error) {
    if (error instanceof Error && error.message.includes('ENOENT')) {
      return await runFfprobeStreamSamplesWithBin('/usr/bin/ffprobe', input);
    }
    throw error;
  }
};

const runFfprobeStartTime = async (input: string) => {
  try {
    return await runFfprobeStartTimeWithBin(process.env.FFPROBE_PATH ?? 'ffprobe', input);
  } catch (error) {
    if (error instanceof Error && error.message.includes('ENOENT')) {
      return await runFfprobeStartTimeWithBin('/usr/bin/ffprobe', input);
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
        && type !== 'image'
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
      const details = meta.outputDetails?.[outputPath];
      outputMap.set(outputPath, {
        ...meta,
        processedAt: details?.processedAt || meta.processedAt,
        voice: details?.voice ?? meta.voice,
        rate: details?.rate ?? meta.rate,
        pitch: details?.pitch ?? meta.pitch,
        volume: details?.volume ?? meta.volume,
        overlapSeconds: details?.overlapSeconds ?? meta.overlapSeconds,
        overlapMode: details?.overlapMode ?? meta.overlapMode,
        removeLineBreaks: details?.removeLineBreaks ?? meta.removeLineBreaks,
        outputSignature: details?.outputSignature ?? meta.outputSignature,
        role: 'output',
        sourceRelativePath
      });
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

app.delete('/api/vault/file', async (req, res) => {
  const relativePathRaw = typeof req.body?.relativePath === 'string' ? req.body.relativePath.trim() : '';
  if (!relativePathRaw) {
    res.status(400).json({ error: 'Missing relativePath' });
    return;
  }
  const normalized = relativePathRaw.replace(/\\/g, '/');
  const fullPath = resolveSafePath(normalized);
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

app.post('/api/auth/register', async (req, res) => {
  if (!REGISTER_MODE) {
    return res.status(403).json({ ok: false, error: 'Register disabled' });
  }
  const rawUsername = typeof req.body?.username === 'string' ? req.body.username : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const username = normalizeUsername(rawUsername);
  if (!isValidUsername(username)) {
    return res.status(400).json({ ok: false, error: 'Invalid username' });
  }
  if (!isValidPassword(password)) {
    return res.status(400).json({ ok: false, error: 'Invalid password' });
  }

  const existing = db.exec('SELECT id FROM users WHERE username = ? LIMIT 1', [username]);
  if (existing[0]?.values?.length) {
    return res.status(409).json({ ok: false, error: 'Username already exists' });
  }

  const createdAt = new Date().toISOString();
  const passwordHash = hashPassword(password);
  db.run('INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)', [
    username,
    passwordHash,
    createdAt
  ]);
  const idRow = db.exec('SELECT last_insert_rowid() as id');
  const id = idRow[0]?.values?.[0]?.[0] ?? null;
  await persistDb();
  return res.json({ ok: true, user: { id, username, createdAt } });
});

app.get('/api/auth/config', (_req, res) => {
  res.json({ registerEnabled: REGISTER_MODE });
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

app.post('/api/auth/logout', (req, res) => {
  const cookies = parseCookies(req.headers.cookie);
  const sessionId = cookies[AUTH_SESSION_COOKIE];
  if (sessionId) {
    sessions.delete(sessionId);
    try {
      db.run('DELETE FROM sessions WHERE id = ?', [sessionId]);
      schedulePersistDb();
    } catch {
      // ignore
    }
  }
  clearSessionCookie(res);
  return res.json({ ok: true });
});

app.post('/api/auth/login', (req, res) => {
  const rawUsername = typeof req.body?.username === 'string' ? req.body.username : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const username = normalizeUsername(rawUsername);
  if (!isValidUsername(username) || !password) {
    return res.status(400).json({ ok: false, error: 'Invalid credentials' });
  }

  const result = db.exec(
    'SELECT id, username, password_hash, created_at FROM users WHERE username = ? LIMIT 1',
    [username]
  );
  const row = result[0]?.values?.[0];
  if (!row) {
    return res.status(401).json({ ok: false, error: 'Invalid credentials' });
  }
  const [id, dbUsername, passwordHash, createdAt] = row as [number, string, string, string];
  if (!verifyPassword(password, passwordHash)) {
    return res.status(401).json({ ok: false, error: 'Invalid credentials' });
  }
  const sessionId = crypto.randomBytes(24).toString('hex');
  const createdAtIso = new Date().toISOString();
  const session = {
    id: sessionId,
    userId: id,
    username: dbUsername,
    createdAt,
    expiresAt: Date.now() + AUTH_SESSION_TTL_MS
  } as AuthSession;
  sessions.set(sessionId, session);
  try {
    db.run(
      'INSERT OR REPLACE INTO sessions (id, user_id, username, created_at, expires_at) VALUES (?, ?, ?, ?, ?)',
      [sessionId, id, dbUsername, createdAt, session.expiresAt]
    );
    schedulePersistDb();
  } catch {
    // ignore
  }
  setSessionCookie(res, sessionId);
  return res.json({ ok: true, user: { id, username: dbUsername, createdAt } });
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
  res.json({ jobs, now: new Date().toISOString() });
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

app.post('/api/param-presets/reset', async (_req, res) => {
  try {
    resetParamPresetsTable();
    await persistDb();
    res.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to reset presets';
    res.status(500).json({ error: message });
  }
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

app.post('/api/render-v2/check-status', async (req, res) => {
  const config = req.body?.config as RenderConfigV2;
  if (!config) return res.status(400).json({ error: 'Missing config' });
  try {
    const { signature } = await buildRenderV2Signature(config);

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
        const { signature: computedSig } = await buildRenderV2Signature(jConfig);
        if (computedSig === signature) {
          match = j;
          break;
        }
      }
    }

    if (!match) return res.json({ signature, status: 'none' });
    const isFinished = match.status === 'completed';
    return res.json({ signature, status: isFinished ? 'completed' : 'unfinished', jobId: match.id });
  } catch (error) {
    res.status(500).json({ error: 'Internal error' });
  }
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
  const requestedTtsSettings = normalizeTtsOutputSettings({
    voice: ttsVoice || undefined,
    rate: ttsRate,
    pitch: ttsPitch,
    volume: ttsVolume,
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
        const alreadyHasOutputs = await hasFiles(sourceDir) || await hasFiles(outputDir);
        if (alreadyHasOutputs && !overwrite) {
          res.status(409).json({ error: 'Project outputs already exist.', kind: 'download' });
          return;
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
          },
          render: Object.keys(renderPayload).length > 0 ? renderPayload : undefined
        }
      };
      if (renderPreviewSeconds && job.params.render) {
        job.params.render.previewSeconds = renderPreviewSeconds;
      }

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
      (job as any).__forceRenderV2New = forceNew;
      (job as any).__ttsRemoveLineBreaks = ttsRemoveLineBreaks;
      if (renderConfigV2) (job as any).__renderConfigV2 = renderConfigV2;
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
          const { outputName: ttsName } = buildTtsOutputName(fullPath, requestedTtsSettings);
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

      const renderPayload: Record<string, any> = {};
      if (renderInputPaths?.length) renderPayload.inputPaths = renderInputPaths;
      if (renderVideoPath) renderPayload.videoPath = renderVideoPath;
      if (renderAudioPath) renderPayload.audioPath = renderAudioPath;
      if (renderSubtitlePath) renderPayload.subtitlePath = renderSubtitlePath;
      if (renderConfigV2) {
        const { signature } = await buildRenderV2Signature(renderConfigV2);
        renderPayload.configV2 = renderConfigV2;
        renderPayload.signature = signature;
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
          inputPaths: inputPaths && inputPaths.length > 0 ? inputPaths : undefined,
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
          },
          render: Object.keys(renderPayload).length > 0 ? renderPayload : undefined
        }
      };
      if (renderPreviewSeconds && job.params.render) {
        job.params.render.previewSeconds = renderPreviewSeconds;
      }

      (job as any).__inputPath = fullPath;
      (job as any).__inputRelativePath = inputPath;
      (job as any).__projectRoot = projectRoot;
      (job as any).__outputDir = outputDir;
      (job as any).__model = model;
      (job as any).__outputFormat = outputFormat;
      (job as any).__backend = backend;
      (job as any).__ttsOverlapMode = ttsOverlapMode;
      (job as any).__forceRenderV2New = forceNew;
      (job as any).__ttsRemoveLineBreaks = ttsRemoveLineBreaks;
      if (renderConfigV2) (job as any).__renderConfigV2 = renderConfigV2;
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
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.bmp': 'image/bmp',
    '.tif': 'image/tiff',
    '.tiff': 'image/tiff',
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
  /** 0 = hard edge; 1–10 = feather width as % of half the shorter crop side. */
  feather: number;
};

const clampRender = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

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
    const graph = await buildRenderV2FilterGraph(config, tmpDir, {
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

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.listen(PORT, () => {
  console.log(`Media backend running on http://localhost:${PORT}`);
});
