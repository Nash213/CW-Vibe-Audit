import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import bcrypt from 'bcryptjs';

const DB_PATH = path.resolve(process.cwd(), 'notex.db');
const db = new Database(DB_PATH);

// Enable WAL mode for high concurrency & performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Initialize database schema
export function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      avatar_url TEXT,
      bio TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      category TEXT DEFAULT 'General',
      tags TEXT DEFAULT '[]',
      is_pinned INTEGER DEFAULT 0,
      color TEXT DEFAULT 'default',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_notes_user_id ON notes(user_id);
    CREATE INDEX IF NOT EXISTS idx_notes_created ON notes(created_at DESC);
  `);

  // Seed default admin and demo user if none exist
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
  if (userCount.count === 0) {
    seedInitialData();
  }
}

function seedInitialData() {
  const salt = bcrypt.genSaltSync(10);
  const adminHash = bcrypt.hashSync('admin123', salt);
  const demoHash = bcrypt.hashSync('password123', salt);

  const insertUser = db.prepare(`
    INSERT INTO users (email, password_hash, name, role, avatar_url, bio)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  // 1. Admin user
  const adminResult = insertUser.run(
    'admin@notex.dev',
    adminHash,
    'System Admin',
    'admin',
    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=256&h=256&q=80',
    'Notex workspace administrator & security auditor.'
  );
  const adminId = adminResult.lastInsertRowid;

  // 2. Demo regular user
  const demoResult = insertUser.run(
    'alex@notex.dev',
    demoHash,
    'Alex Rivers',
    'user',
    'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=256&h=256&q=80',
    'Product designer & writer. Organizing thoughts, project specs, and sprint logs.'
  );
  const demoId = demoResult.lastInsertRowid;

  // Pre-seed sample notes for demo user
  const insertNote = db.prepare(`
    INSERT INTO notes (user_id, title, content, category, tags, is_pinned, color)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  insertNote.run(
    demoId,
    '🚀 Welcome to Notex Workspace',
    `Welcome! Notex is your private, ultra-fast note repository built with Node.js, Express, and SQLite.\n\n✨ Features ready to use:\n- Full instant markdown & rich text editing\n- Fast categorization & multi-tag filtering\n- Pin critical notes to the top\n- Color accents for visual scanning\n- Profile page with custom avatar uploads\n- Admin console to manage workspace accounts`,
    'General',
    JSON.stringify(['welcome', 'overview']),
    1,
    'indigo'
  );

  insertNote.run(
    demoId,
    'Quarterly Product Goals (Q4)',
    `Key Milestones:\n1. Complete offline-first note sync architecture\n2. Ship team sharing and collaborative boards\n3. Optimize SQLite query index benchmarks\n4. Redesign mobile navigation bar\n\nNotes from team standup: target zero latency on search queries under 100ms.`,
    'Work',
    JSON.stringify(['roadmap', 'quarterly', 'goals']),
    1,
    'amber'
  );

  insertNote.run(
    demoId,
    'Weekend Reading & Research List',
    `- Clean Architecture principles by Robert C. Martin\n- Designing Data-Intensive Applications (ch. 7 on transactions)\n- Typography discipline in modern web applications\n- Exploring SQLite WAL mode concurrency benefits`,
    'Ideas',
    JSON.stringify(['reading', 'research', 'books']),
    0,
    'emerald'
  );

  insertNote.run(
    demoId,
    'Grocery & Weekly Supplies',
    `- Almond milk (unsweetened)\n- Organic dark roast coffee beans\n- Sourdough loaf\n- Fresh blueberries & avocados\n- Sparkling water (lemon/lime)`,
    'Personal',
    JSON.stringify(['shopping', 'errands']),
    0,
    'rose'
  );

  // Seed one note for Admin
  insertNote.run(
    adminId,
    '🛡️ Admin Security Protocols',
    `Admin guidelines:\n1. Verify newly registered users periodically\n2. Promote trusted contributors to admin role\n3. SQLite database is backed up in WAL mode at notex.db\n4. Avatar uploads are served safely via express static /uploads/`,
    'Work',
    JSON.stringify(['admin', 'security']),
    1,
    'sky'
  );
}

// User operations
export function getUserByEmail(email: string) {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email) as any;
}

export function getUserById(id: number) {
  return db.prepare('SELECT id, email, name, role, avatar_url, bio, created_at, updated_at FROM users WHERE id = ?').get(id) as any;
}

export function getUserWithPasswordById(id: number) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as any;
}

export function createUser(data: { email: string; password_hash: string; name: string; role?: string; avatar_url?: string; bio?: string }) {
  const stmt = db.prepare(`
    INSERT INTO users (email, password_hash, name, role, avatar_url, bio)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    data.email,
    data.password_hash,
    data.name,
    data.role || 'user',
    data.avatar_url || null,
    data.bio || ''
  );
  return getUserById(Number(result.lastInsertRowid));
}

export function updateUser(id: number, data: { name?: string; bio?: string; avatar_url?: string; email?: string }) {
  const fields: string[] = [];
  const values: any[] = [];

  if (data.name !== undefined) {
    fields.push('name = ?');
    values.push(data.name);
  }
  if (data.bio !== undefined) {
    fields.push('bio = ?');
    values.push(data.bio);
  }
  if (data.avatar_url !== undefined) {
    fields.push('avatar_url = ?');
    values.push(data.avatar_url);
  }
  if (data.email !== undefined) {
    fields.push('email = ?');
    values.push(data.email);
  }

  if (fields.length === 0) return getUserById(id);

  fields.push('updated_at = CURRENT_TIMESTAMP');
  values.push(id);

  const query = `UPDATE users SET ${fields.join(', ')} WHERE id = ?`;
  db.prepare(query).run(...values);
  return getUserById(id);
}

export function updateUserPassword(id: number, password_hash: string) {
  db.prepare('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(password_hash, id);
}

export function updateUserRole(id: number, role: 'admin' | 'user') {
  db.prepare('UPDATE users SET role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(role, id);
  return getUserById(id);
}

export function deleteUser(id: number) {
  return db.prepare('DELETE FROM users WHERE id = ?').run(id);
}

export function getAllUsersWithStats() {
  const stmt = db.prepare(`
    SELECT 
      u.id, 
      u.email, 
      u.name, 
      u.role, 
      u.avatar_url, 
      u.bio, 
      u.created_at, 
      u.updated_at,
      COUNT(n.id) as note_count
    FROM users u
    LEFT JOIN notes n ON u.id = n.user_id
    GROUP BY u.id
    ORDER BY u.created_at DESC
  `);
  return stmt.all() as any[];
}

export function getAdminSummaryStats() {
  const totalUsers = (db.prepare('SELECT COUNT(*) as count FROM users').get() as any).count;
  const totalNotes = (db.prepare('SELECT COUNT(*) as count FROM notes').get() as any).count;
  const totalAdmins = (db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'").get() as any).count;
  const recentUsers = (db.prepare("SELECT COUNT(*) as count FROM users WHERE created_at >= datetime('now', '-7 days')").get() as any).count;

  return {
    totalUsers,
    totalNotes,
    totalAdmins,
    recentUsers,
  };
}

// Notes operations
export function getNotes(userId: number, options?: { search?: string; category?: string; pinned?: boolean }) {
  let query = 'SELECT * FROM notes WHERE user_id = ?';
  const params: any[] = [userId];

  if (options?.category && options.category !== 'All') {
    query += ' AND category = ?';
    params.push(options.category);
  }

  if (options?.pinned !== undefined) {
    query += ' AND is_pinned = ?';
    params.push(options.pinned ? 1 : 0);
  }

  if (options?.search && options.search.trim() !== '') {
    query += ' AND (title LIKE ? OR content LIKE ? OR tags LIKE ?)';
    const searchPattern = `%${options.search.trim()}%`;
    params.push(searchPattern, searchPattern, searchPattern);
  }

  query += ' ORDER BY is_pinned DESC, updated_at DESC';

  const rows = db.prepare(query).all(...params) as any[];
  return rows.map((r) => ({
    ...r,
    tags: r.tags ? JSON.parse(r.tags) : [],
    is_pinned: Boolean(r.is_pinned),
  }));
}

export function getNoteById(id: number, userId: number) {
  const row = db.prepare('SELECT * FROM notes WHERE id = ? AND user_id = ?').get(id, userId) as any;
  if (!row) return null;
  return {
    ...row,
    tags: row.tags ? JSON.parse(row.tags) : [],
    is_pinned: Boolean(row.is_pinned),
  };
}

export function createNote(data: {
  user_id: number;
  title: string;
  content: string;
  category?: string;
  tags?: string[];
  is_pinned?: boolean;
  color?: string;
}) {
  const stmt = db.prepare(`
    INSERT INTO notes (user_id, title, content, category, tags, is_pinned, color)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    data.user_id,
    data.title,
    data.content,
    data.category || 'General',
    JSON.stringify(data.tags || []),
    data.is_pinned ? 1 : 0,
    data.color || 'default'
  );
  return getNoteById(Number(result.lastInsertRowid), data.user_id);
}

export function updateNote(
  id: number,
  userId: number,
  data: {
    title?: string;
    content?: string;
    category?: string;
    tags?: string[];
    is_pinned?: boolean;
    color?: string;
  }
) {
  const fields: string[] = [];
  const values: any[] = [];

  if (data.title !== undefined) {
    fields.push('title = ?');
    values.push(data.title);
  }
  if (data.content !== undefined) {
    fields.push('content = ?');
    values.push(data.content);
  }
  if (data.category !== undefined) {
    fields.push('category = ?');
    values.push(data.category);
  }
  if (data.tags !== undefined) {
    fields.push('tags = ?');
    values.push(JSON.stringify(data.tags));
  }
  if (data.is_pinned !== undefined) {
    fields.push('is_pinned = ?');
    values.push(data.is_pinned ? 1 : 0);
  }
  if (data.color !== undefined) {
    fields.push('color = ?');
    values.push(data.color);
  }

  if (fields.length === 0) return getNoteById(id, userId);

  fields.push('updated_at = CURRENT_TIMESTAMP');
  values.push(id, userId);

  const query = `UPDATE notes SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`;
  db.prepare(query).run(...values);
  return getNoteById(id, userId);
}

export function deleteNote(id: number, userId: number) {
  return db.prepare('DELETE FROM notes WHERE id = ? AND user_id = ?').run(id, userId);
}

export function toggleNotePin(id: number, userId: number) {
  const note = getNoteById(id, userId);
  if (!note) return null;
  const newPinned = note.is_pinned ? 0 : 1;
  db.prepare('UPDATE notes SET is_pinned = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?').run(
    newPinned,
    id,
    userId
  );
  return getNoteById(id, userId);
}

export default db;
