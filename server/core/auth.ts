/**
 * Authentication Module - Session management, password hashing, middleware
 */

import * as express from 'express';
import * as crypto from 'crypto';
import { getDb, schedulePersistDb } from './db.js';

// Types
export type AuthSession = {
  id: string;
  userId: number;
  username: string;
  createdAt: string;
  expiresAt: number;
};

// Configuration
const AUTH_SESSION_COOKIE = 'mf_session';
const AUTH_SESSION_TTL_DAYS = Number(process.env.AUTH_SESSION_TTL_DAYS ?? 7);
const AUTH_SESSION_TTL_MS = Math.max(1, AUTH_SESSION_TTL_DAYS) * 24 * 60 * 60 * 1000;
const AUTH_PBKDF2_ITERATIONS = Number(process.env.AUTH_PBKDF2_ITERATIONS ?? 150000);
const AUTH_PBKDF2_DIGEST = 'sha256';
const AUTH_PBKDF2_KEYLEN = 32;

// Session cache
const sessions = new Map<string, AuthSession>();

// Cookie parsing
export const parseCookies = (header: string | undefined) => {
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

// Session management
export const getSessionFromRequest = (req: express.Request) => {
  const cookies = parseCookies(req.headers.cookie);
  const sessionId = cookies[AUTH_SESSION_COOKIE];
  if (!sessionId) return null;
  const now = Date.now();
  const cached = sessions.get(sessionId);
  if (cached) {
    if (cached.expiresAt <= now) {
      sessions.delete(sessionId);
      try {
        const db = getDb();
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
    const db = getDb();
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

export const setSessionCookie = (res: express.Response, sessionId: string) => {
  res.cookie(AUTH_SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: AUTH_SESSION_TTL_MS,
    path: '/'
  });
};

export const clearSessionCookie = (res: express.Response) => {
  res.clearCookie(AUTH_SESSION_COOKIE, { path: '/' });
};

// Password management
export const normalizeUsername = (value: string) => value.trim();
export const isValidUsername = (value: string) => /^\S{3,64}$/.test(value);
export const isValidPassword = (value: string) => value.length >= 6 && value.length <= 128;

export const hashPassword = (password: string) => {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto
    .pbkdf2Sync(password, salt, AUTH_PBKDF2_ITERATIONS, AUTH_PBKDF2_KEYLEN, AUTH_PBKDF2_DIGEST)
    .toString('hex');
  return `pbkdf2$${AUTH_PBKDF2_ITERATIONS}$${salt}$${hash}`;
};

export const verifyPassword = (password: string, stored: string) => {
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

// Auth middleware
export const authMiddleware = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const path = req.path || '';
  if (
    path === '/auth/login' ||
    path === '/auth/register' ||
    path === '/auth/config' ||
    path === '/auth/status' ||
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
};

// Auth routes factory
export const createAuthRouter = (registerMode: boolean) => {
  const router = express.Router();

  router.get('/auth/config', (_req, res) => {
    res.json({ registerMode });
  });

  router.get('/auth/status', (req, res) => {
    const session = getSessionFromRequest(req);
    if (!session) {
      res.status(401).json({ ok: false });
      return;
    }
    res.json({ ok: true, user: { username: session.username, isAdmin: false } });
  });

  router.post('/auth/login', async (req, res) => {
    const usernameRaw = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
    const passwordRaw = typeof req.body?.password === 'string' ? req.body.password : '';

    if (!usernameRaw || !passwordRaw) {
      res.status(400).json({ ok: false, error: 'Missing username or password' });
      return;
    }

    const username = normalizeUsername(usernameRaw);
    if (!isValidUsername(username)) {
      res.status(400).json({ ok: false, error: 'Invalid username' });
      return;
    }

    try {
      const db = getDb();
      const result = db.exec(
        'SELECT id, password_hash FROM users WHERE username = ? LIMIT 1',
        [username]
      );
      const row = result[0]?.values?.[0];
      if (!row) {
        res.status(401).json({ ok: false, error: 'Invalid credentials' });
        return;
      }
      const [userId, passwordHash] = row as [number, string];
      if (!verifyPassword(passwordRaw, passwordHash)) {
        res.status(401).json({ ok: false, error: 'Invalid credentials' });
        return;
      }

      const sessionId = crypto.randomBytes(32).toString('hex');
      const createdAt = new Date().toISOString();
      const expiresAt = Date.now() + AUTH_SESSION_TTL_MS;

      db.run(
        'INSERT INTO sessions (id, user_id, username, created_at, expires_at) VALUES (?, ?, ?, ?, ?)',
        [sessionId, userId, username, createdAt, expiresAt]
      );
      schedulePersistDb();

      const session: AuthSession = { id: sessionId, userId, username, createdAt, expiresAt };
      sessions.set(sessionId, session);
      setSessionCookie(res, sessionId);
      res.json({ ok: true, user: { username, isAdmin: false } });
    } catch (err) {
      res.status(500).json({ ok: false, error: 'Login failed' });
    }
  });

  router.post('/auth/register', async (req, res) => {
    if (!registerMode) {
      res.status(403).json({ ok: false, error: 'Registration is disabled' });
      return;
    }

    const usernameRaw = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
    const passwordRaw = typeof req.body?.password === 'string' ? req.body.password : '';

    if (!usernameRaw || !passwordRaw) {
      res.status(400).json({ ok: false, error: 'Missing username or password' });
      return;
    }

    const username = normalizeUsername(usernameRaw);
    if (!isValidUsername(username)) {
      res.status(400).json({ ok: false, error: 'Username must be 3-64 non-whitespace characters' });
      return;
    }
    if (!isValidPassword(passwordRaw)) {
      res.status(400).json({ ok: false, error: 'Password must be 6-128 characters' });
      return;
    }

    try {
      const db = getDb();
      const passwordHash = hashPassword(passwordRaw);
      const createdAt = new Date().toISOString();
      db.run(
        'INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)',
        [username, passwordHash, createdAt]
      );
      schedulePersistDb();
      res.json({ ok: true });
    } catch (err: any) {
      console.error('[auth] Registration error:', err);
      if (err?.message?.includes('UNIQUE constraint')) {
        res.status(409).json({ ok: false, error: 'Username already exists' });
        return;
      }
      res.status(500).json({ ok: false, error: 'Registration failed' });
    }
  });

  router.post('/auth/logout', (req, res) => {
    const cookies = parseCookies(req.headers.cookie);
    const sessionId = cookies[AUTH_SESSION_COOKIE];
    if (sessionId) {
      sessions.delete(sessionId);
      try {
        const db = getDb();
        db.run('DELETE FROM sessions WHERE id = ?', [sessionId]);
        schedulePersistDb();
      } catch {
        // ignore
      }
    }
    clearSessionCookie(res);
    res.json({ ok: true });
  });

  return router;
};
