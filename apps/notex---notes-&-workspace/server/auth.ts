import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import type { Request, Response, NextFunction } from 'express';
import { getUserById } from './db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'notex-dev-secret-key-9981249-jwt';
const TOKEN_EXPIRY = '7d';

export interface AuthUserPayload {
  id: number;
  email: string;
  role: string;
  name: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUserPayload;
    }
  }
}

export function hashPassword(plainText: string): string {
  const salt = bcrypt.genSaltSync(10);
  return bcrypt.hashSync(plainText, salt);
}

export function comparePassword(plainText: string, hash: string): boolean {
  return bcrypt.compareSync(plainText, hash);
}

export function generateToken(user: { id: number; email: string; role: string; name: string }): string {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    },
    JWT_SECRET,
    { expiresIn: TOKEN_EXPIRY }
  );
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  let token = req.cookies?.token;

  if (!token && req.headers.authorization) {
    const parts = req.headers.authorization.split(' ');
    if (parts.length === 2 && parts[0] === 'Bearer') {
      token = parts[1];
    }
  }

  if (!token) {
    return res.status(401).json({ error: 'Authentication required. Please log in.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthUserPayload;
    const user = getUserById(decoded.id);
    if (!user) {
      return res.status(401).json({ error: 'User account no longer exists.' });
    }

    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired session. Please log in again.' });
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Access forbidden. Administrator privileges required.' });
  }

  next();
}
