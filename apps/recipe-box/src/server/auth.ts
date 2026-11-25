import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { db, toPublicUser, type PublicUser, type UserRole } from './db.ts';

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days
const SESSION_SECRET = process.env.SESSION_SECRET?.trim() || crypto.randomBytes(32).toString('hex');

export interface AuthenticatedRequest extends Request {
  user?: PublicUser;
  sessionId?: string;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derivedKey}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) {
    return false;
  }
  const [salt, keyHex] = parts;
  if (!salt || !keyHex) {
    return false;
  }
  const keyBuffer = Buffer.from(keyHex, 'hex');
  const derivedBuffer = crypto.scryptSync(password, salt, 64);
  if (keyBuffer.length !== derivedBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(keyBuffer, derivedBuffer);
}

function signSessionId(sessionId: string): string {
  const signature = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(sessionId)
    .digest('base64url');
  return `${sessionId}.${signature}`;
}

function verifySignedToken(token: string): string | null {
  const dotIndex = token.indexOf('.');
  if (dotIndex <= 0) {
    return null;
  }
  const sessionId = token.slice(0, dotIndex);
  const providedSig = token.slice(dotIndex + 1);
  if (!sessionId || !providedSig) {
    return null;
  }
  const expectedSig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(sessionId)
    .digest('base64url');

  const providedBuf = Buffer.from(providedSig);
  const expectedBuf = Buffer.from(expectedSig);
  if (providedBuf.length !== expectedBuf.length) {
    return null;
  }
  if (!crypto.timingSafeEqual(providedBuf, expectedBuf)) {
    return null;
  }
  return sessionId;
}

export function createSession(userId: number): string {
  const sessionId = crypto.randomBytes(24).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();

  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(new Date().toISOString());
  db.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)').run(
    sessionId,
    userId,
    expiresAt
  );

  return signSessionId(sessionId);
}

export function revokeSession(sessionId: string): void {
  db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }

  const token = authHeader.slice('Bearer '.length).trim();
  const sessionId = verifySignedToken(token);
  if (!sessionId) {
    res.status(401).json({ error: 'Invalid or expired session.' });
    return;
  }

  const row = db
    .prepare(
      `SELECT s.id AS session_id, s.expires_at, u.id, u.email, u.role, u.created_at
       FROM sessions s
       INNER JOIN users u ON u.id = s.user_id
       WHERE s.id = ?`
    )
    .get(sessionId) as
    | {
        session_id: string;
        expires_at: string;
        id: number;
        email: string;
        role: UserRole;
        created_at: string;
      }
    | undefined;

  if (!row) {
    res.status(401).json({ error: 'Session not found. Please log in again.' });
    return;
  }

  if (new Date(row.expires_at).getTime() <= Date.now()) {
    revokeSession(sessionId);
    res.status(401).json({ error: 'Session expired. Please log in again.' });
    return;
  }

  req.user = toPublicUser(row);
  req.sessionId = row.session_id;
  next();
}

export function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }
  if (req.user.role !== 'admin') {
    res.status(403).json({ error: 'Admin access required.' });
    return;
  }
  next();
}
