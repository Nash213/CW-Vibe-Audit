import { Router } from 'express';
import { pool } from '../db.js';
import {
  createSession,
  destroySession,
  hashPassword,
  verifyPassword,
} from '../auth.js';

const router = Router();

router.get('/me', (req, res) => {
  res.json({ user: req.user });
});

router.post('/signup', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const displayName = String(req.body?.displayName || '').trim();
  const password = String(req.body?.password || '');

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }
  if (displayName.length < 2 || displayName.length > 50) {
    return res.status(400).json({ error: 'Display name must be 2–50 characters.' });
  }
  if (password.length < 6 || password.length > 200) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }

  const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
  if (existing.rows.length > 0) {
    return res.status(409).json({ error: 'An account with that email already exists.' });
  }

  const passwordHash = await hashPassword(password);
  const { rows } = await pool.query(
    `INSERT INTO users (email, display_name, password_hash)
     VALUES ($1, $2, $3)
     RETURNING id, email, display_name AS "displayName", created_at AS "createdAt"`,
    [email, displayName, passwordHash]
  );

  const user = rows[0];
  await createSession(res, user.id);
  res.status(201).json({ user });
});

router.post('/login', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const { rows } = await pool.query(
    `SELECT id, email, display_name AS "displayName", password_hash, created_at AS "createdAt"
     FROM users
     WHERE email = $1`,
    [email]
  );

  const record = rows[0];
  if (!record || !(await verifyPassword(password, record.password_hash))) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  await createSession(res, record.id);
  res.json({
    user: {
      id: record.id,
      email: record.email,
      displayName: record.displayName,
      createdAt: record.createdAt,
    },
  });
});

router.post('/logout', async (req, res) => {
  await destroySession(req, res);
  res.json({ ok: true });
});

export default router;
