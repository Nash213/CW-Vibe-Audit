import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export type UserRole = 'user' | 'admin';
export type RecipeCategory = 'breakfast' | 'main' | 'dessert';

export interface UserRow {
  id: number;
  email: string;
  password_hash: string;
  role: UserRole;
  created_at: string;
}

export interface PublicUser {
  id: number;
  email: string;
  role: UserRole;
  createdAt: string;
}

export interface AdminUserSummary extends PublicUser {
  recipeCount: number;
}

export interface RecipeRow {
  id: number;
  user_id: number;
  title: string;
  ingredients: string;
  steps: string;
  category: RecipeCategory;
  created_at: string;
  updated_at: string;
}

export interface RecipeDTO {
  id: number;
  userId: number;
  title: string;
  ingredients: string;
  steps: string;
  category: RecipeCategory;
  createdAt: string;
  updatedAt: string;
}

const configuredDbPath = process.env.DB_PATH?.trim() || path.resolve(process.cwd(), 'data', 'recipebox.db');
const dbDir = path.dirname(configuredDbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

export const db = new DatabaseSync(configuredDbPath);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'admin')) DEFAULT 'user',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);

  CREATE TABLE IF NOT EXISTS recipes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    ingredients TEXT NOT NULL,
    steps TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('breakfast', 'main', 'dessert')),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

  CREATE INDEX IF NOT EXISTS idx_recipes_user_created ON recipes(user_id, created_at DESC, id DESC);
  CREATE INDEX IF NOT EXISTS idx_recipes_user_category ON recipes(user_id, category);
`);

export function toPublicUser(row: Pick<UserRow, 'id' | 'email' | 'role' | 'created_at'>): PublicUser {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    createdAt: row.created_at,
  };
}

export function toRecipeDTO(row: RecipeRow): RecipeDTO {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    ingredients: row.ingredients,
    steps: row.steps,
    category: row.category,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
