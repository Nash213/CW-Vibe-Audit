const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../config/db');
const { authenticate, JWT_SECRET } = require('../middleware/auth');

const router = express.Router();

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TOKEN_COOKIE_NAME = 'token';
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

function sendAuthCookie(res, token) {
  res.cookie(TOKEN_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: COOKIE_MAX_AGE
  });
}

function clearAuthCookie(res) {
  res.clearCookie(TOKEN_COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax'
  });
}

// POST /api/auth/signup
router.post('/signup', async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || typeof email !== 'string' || !EMAIL_REGEX.test(email.trim())) {
      return res.status(400).json({ error: 'Please provide a valid email address' });
    }

    if (!password || typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Check if user already exists
    const existing = await query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [normalizedEmail]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    // Hash password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Insert user
    const insertResult = await query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, created_at',
      [normalizedEmail, passwordHash]
    );

    const user = insertResult.rows[0];

    // Generate JWT
    const token = jwt.sign(
      { id: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    sendAuthCookie(res, token);

    return res.status(201).json({
      message: 'Account created successfully',
      user: {
        id: user.id,
        email: user.email,
        created_at: user.created_at
      },
      token
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';

    const userResult = await query(
      'SELECT id, email, password_hash, created_at FROM users WHERE LOWER(email) = LOWER($1)',
      [normalizedEmail]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = userResult.rows[0];
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);

    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    sendAuthCookie(res, token);

    return res.json({
      message: 'Logged in successfully',
      user: {
        id: user.id,
        email: user.email,
        created_at: user.created_at
      },
      token
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  clearAuthCookie(res);
  return res.json({ message: 'Logged out successfully' });
});

// GET /api/auth/me
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const result = await query(
      'SELECT id, email, created_at FROM users WHERE id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      clearAuthCookie(res);
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json({ user: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
