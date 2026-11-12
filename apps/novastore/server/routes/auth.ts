import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { getDb, seedDemoData } from '../db.js';
import { generateToken, AuthenticatedRequest } from '../auth.js';

const router = Router();

// Get current system status (e.g., whether an admin exists)
router.get('/status', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const adminRes = await db.query("SELECT COUNT(*) as count FROM users WHERE role = 'admin'");
    const adminCount = parseInt(adminRes.rows[0].count, 10);

    const productRes = await db.query("SELECT COUNT(*) as count FROM products");
    const productCount = parseInt(productRes.rows[0].count, 10);

    res.json({
      hasAdmin: adminCount > 0,
      adminCount,
      productCount,
    });
  } catch (err: any) {
    console.error('Error fetching auth status:', err);
    res.status(500).json({ error: 'Failed to check system status' });
  }
});

// Create first admin (allowed only when 0 admins exist)
router.post('/create-first-admin', async (req: Request, res: Response) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }

    const db = await getDb();
    const adminCountRes = await db.query("SELECT COUNT(*) as count FROM users WHERE role = 'admin'");
    const adminCount = parseInt(adminCountRes.rows[0].count, 10);

    if (adminCount > 0) {
      return res.status(400).json({ error: 'An admin account already exists. Please log in or ask an existing admin.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    
    // Insert or update existing user to admin
    const insertRes = await db.query(
      `INSERT INTO users (email, password_hash, name, role) 
       VALUES ($1, $2, $3, 'admin') 
       ON CONFLICT (email) DO UPDATE SET role = 'admin', name = EXCLUDED.name, password_hash = EXCLUDED.password_hash
       RETURNING id, email, name, role`,
      [email.toLowerCase().trim(), passwordHash, name.trim()]
    );

    const user = insertRes.rows[0];
    const token = generateToken(user);

    res.cookie('token', token, {
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      sameSite: 'lax',
    });

    res.status(201).json({
      message: 'First admin account created successfully!',
      user,
      token,
    });
  } catch (err: any) {
    console.error('Error creating first admin:', err);
    res.status(500).json({ error: err.message || 'Failed to create admin' });
  }
});

// Register normal customer
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const db = await getDb();
    const existing = await db.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase().trim()]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const insertRes = await db.query(
      `INSERT INTO users (email, password_hash, name, role) 
       VALUES ($1, $2, $3, 'customer') 
       RETURNING id, email, name, role, created_at`,
      [email.toLowerCase().trim(), passwordHash, name.trim()]
    );

    const user = insertRes.rows[0];
    const token = generateToken(user);

    res.cookie('token', token, {
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      sameSite: 'lax',
    });

    res.status(201).json({
      message: 'Registration successful!',
      user,
      token,
    });
  } catch (err: any) {
    console.error('Error during registration:', err);
    res.status(500).json({ error: err.message || 'Failed to register account' });
  }
});

// Log in
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const db = await getDb();
    const userRes = await db.query(
      'SELECT id, email, password_hash, name, role FROM users WHERE email = $1',
      [email.toLowerCase().trim()]
    );

    if (userRes.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const userRecord = userRes.rows[0];
    const isMatch = await bcrypt.compare(password, userRecord.password_hash);

    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = {
      id: userRecord.id,
      email: userRecord.email,
      name: userRecord.name,
      role: userRecord.role,
    };

    const token = generateToken(user);

    res.cookie('token', token, {
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      sameSite: 'lax',
    });

    res.json({
      message: 'Login successful!',
      user,
      token,
    });
  } catch (err: any) {
    console.error('Error during login:', err);
    res.status(500).json({ error: 'Failed to process login' });
  }
});

// Logout
router.post('/logout', (req: Request, res: Response) => {
  res.clearCookie('token');
  res.json({ message: 'Logged out successfully' });
});

// Current User (me)
router.get('/me', (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return res.json({ user: null });
  }
  res.json({ user: req.user });
});

// Seed demo data route
router.post('/seed', async (req: AuthenticatedRequest, res: Response) => {
  try {
    await seedDemoData();
    res.json({ message: 'Demo data seeded successfully with example products and admin credentials' });
  } catch (err: any) {
    console.error('Seed error:', err);
    res.status(500).json({ error: err.message || 'Failed to seed data' });
  }
});

export default router;
