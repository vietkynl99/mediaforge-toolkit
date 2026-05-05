/**
 * Database Module - Initialization, persistence, and migrations
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import initSqlJs from 'sql.js';

// Database instance
let db: any;
let persistDbTimer: NodeJS.Timeout | null = null;

export const getDb = () => db;

export const persistDb = async () => {
  if (!db) return;
  const data = db.export();
  const dbPath = path.join(process.cwd(), 'server', 'data', 'main_db.sqlite');
  await fs.writeFile(dbPath, Buffer.from(data));
};

export const schedulePersistDb = () => {
  if (persistDbTimer) return;
  persistDbTimer = setTimeout(() => {
    persistDbTimer = null;
    persistDb().catch(() => null);
  }, 500);
};

/**
 * Initialize database with tables and migrations
 */
export const initDatabase = async () => {
  const dbPath = path.join(process.cwd(), 'server', 'data', 'main_db.sqlite');
  const dbDir = path.dirname(dbPath);
  await fs.mkdir(dbDir, { recursive: true });

  const SQL = await initSqlJs({
    locateFile: (file) => path.join(process.cwd(), 'node_modules', 'sql.js', 'dist', file)
  });

  try {
    const fileBuffer = await fs.readFile(dbPath);
    db = new SQL.Database(new Uint8Array(fileBuffer));
  } catch {
    db = new SQL.Database();
  }

  // Clean expired sessions
  try {
    db.run('DELETE FROM sessions WHERE expires_at <= ?', [Date.now()]);
  } catch {
    // ignore
  }

  // Create tables
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

  // Create indexes
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

  // Migration: add params_json column if not exists
  try {
    db.run('ALTER TABLE jobs ADD COLUMN params_json TEXT');
  } catch {
    // ignore if already exists
  }

  // Migration: remove log column from jobs table
  const jobsTableInfo = db.exec("PRAGMA table_info('jobs')");
  const jobsColumns = (jobsTableInfo[0]?.values ?? []).map((row: any[]) => String(row[1]));
  const hasLogColumn = jobsColumns.includes('log');

  if (hasLogColumn) {
    db.run(
      `CREATE TABLE IF NOT EXISTS jobs_new (
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
        params_json TEXT
      )`
    );
    try {
      db.run(
        `INSERT INTO jobs_new (id, name, project_name, file_name, file_size, status, progress,
          tasks_json, created_at, started_at, finished_at, duration_ms, error, params_json)
         SELECT id, name, project_name, file_name, file_size, status, progress,
          tasks_json, created_at, started_at, finished_at, duration_ms, error, params_json
         FROM jobs`
      );
    } catch {
      // ignore if table is empty or other error
    }
    db.run('DROP TABLE jobs');
    db.run('ALTER TABLE jobs_new RENAME TO jobs');
  }

  // Create render_templates table
  db.run(
    `CREATE TABLE IF NOT EXISTS render_templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        config_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`
  );

  // Create task_templates table
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
    db.run('CREATE INDEX IF NOT EXISTS idx_task_templates_task_type ON task_templates (task_type)');
  } catch {
    // ignore
  }

  // Drop old file_uvr table if exists
  db.run('DROP TABLE IF EXISTS file_uvr');

  return db;
};
