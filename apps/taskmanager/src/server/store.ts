import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Task, TaskCounts, TaskStatus, User } from '../types.ts';

interface StoredUser extends User {
  passwordHash: string;
}

interface StoredSession {
  token: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
}

interface StoreData {
  users: StoredUser[];
  sessions: StoredSession[];
  tasks: Task[];
}

const DATA_FILE = process.env.DATA_FILE
  ? path.resolve(process.env.DATA_FILE)
  : path.resolve(process.cwd(), 'data', 'store.json');

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

let writeQueue: Promise<void> = Promise.resolve();

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) {
    return false;
  }
  const [salt, keyHex] = parts;
  if (!salt || !keyHex) {
    return false;
  }
  const expected = Buffer.from(keyHex, 'hex');
  const actual = crypto.scryptSync(password, salt, 64);
  if (expected.length !== actual.length) {
    return false;
  }
  return crypto.timingSafeEqual(expected, actual);
}

async function readStore(): Promise<StoreData> {
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<StoreData>;
    return {
      users: Array.isArray(parsed.users) ? parsed.users : [],
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
    };
  } catch (err) {
    const nodeErr = err as NodeJS.ErrnoException;
    if (nodeErr.code === 'ENOENT') {
      return { users: [], sessions: [], tasks: [] };
    }
    throw err;
  }
}

async function writeStore(data: StoreData): Promise<void> {
  const dir = path.dirname(DATA_FILE);
  await fs.mkdir(dir, { recursive: true });
  const tempFile = `${DATA_FILE}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tempFile, JSON.stringify(data, null, 2), 'utf8');
  await fs.rename(tempFile, DATA_FILE);
}

function runExclusive<T>(fn: (data: StoreData) => Promise<{ next?: StoreData; result: T }>): Promise<T> {
  const task = writeQueue.then(async () => {
    const current = await readStore();
    const { next, result } = await fn(current);
    if (next) {
      await writeStore(next);
    }
    return result;
  });
  writeQueue = task.then(
    () => undefined,
    () => undefined,
  );
  return task;
}

function toPublicUser(user: StoredUser): User {
  return {
    id: user.id,
    email: user.email,
    createdAt: user.createdAt,
  };
}

export async function createUser(email: string, password: string): Promise<User> {
  const normalized = normalizeEmail(email);
  return runExclusive(async (data) => {
    const exists = data.users.some((u) => u.email === normalized);
    if (exists) {
      const err = new Error('An account with this email already exists.');
      (err as Error & { code?: string }).code = 'EMAIL_EXISTS';
      throw err;
    }

    const user: StoredUser = {
      id: crypto.randomUUID(),
      email: normalized,
      passwordHash: hashPassword(password),
      createdAt: new Date().toISOString(),
    };

    const next: StoreData = {
      ...data,
      users: [...data.users, user],
    };

    return { next, result: toPublicUser(user) };
  });
}

export async function authenticateUser(email: string, password: string): Promise<User | null> {
  const normalized = normalizeEmail(email);
  const data = await readStore();
  const user = data.users.find((u) => u.email === normalized);
  if (!user) {
    return null;
  }
  if (!verifyPassword(password, user.passwordHash)) {
    return null;
  }
  return toPublicUser(user);
}

export async function createSession(userId: string): Promise<string> {
  return runExclusive(async (data) => {
    const now = Date.now();
    const token = crypto.randomBytes(32).toString('hex');
    const activeSessions = data.sessions.filter((s) => Date.parse(s.expiresAt) > now);
    const session: StoredSession = {
      token,
      userId,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + SESSION_TTL_MS).toISOString(),
    };

    const next: StoreData = {
      ...data,
      sessions: [...activeSessions, session],
    };

    return { next, result: token };
  });
}

export async function getUserBySessionToken(token: string): Promise<User | null> {
  if (!token) {
    return null;
  }
  const data = await readStore();
  const now = Date.now();
  const session = data.sessions.find((s) => s.token === token && Date.parse(s.expiresAt) > now);
  if (!session) {
    return null;
  }
  const user = data.users.find((u) => u.id === session.userId);
  return user ? toPublicUser(user) : null;
}

export async function deleteSession(token: string): Promise<void> {
  if (!token) {
    return;
  }
  await runExclusive(async (data) => {
    const nextSessions = data.sessions.filter((s) => s.token !== token);
    if (nextSessions.length === data.sessions.length) {
      return { result: undefined };
    }
    return {
      next: { ...data, sessions: nextSessions },
      result: undefined,
    };
  });
}

export async function listTasksForUser(
  userId: string,
  status?: TaskStatus,
): Promise<{ tasks: Task[]; counts: TaskCounts }> {
  const data = await readStore();
  const userTasks = data.tasks
    .filter((t) => t.userId === userId)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

  const counts: TaskCounts = {
    all: userTasks.length,
    todo: userTasks.filter((t) => t.status === 'todo').length,
    in_progress: userTasks.filter((t) => t.status === 'in_progress').length,
    done: userTasks.filter((t) => t.status === 'done').length,
  };

  const tasks = status ? userTasks.filter((t) => t.status === status) : userTasks;
  return { tasks, counts };
}

export async function createTaskForUser(
  userId: string,
  input: { title: string; description: string; status: TaskStatus },
): Promise<Task> {
  return runExclusive(async (data) => {
    const now = new Date().toISOString();
    const task: Task = {
      id: crypto.randomUUID(),
      userId,
      title: input.title,
      description: input.description,
      status: input.status,
      createdAt: now,
      updatedAt: now,
    };

    const next: StoreData = {
      ...data,
      tasks: [task, ...data.tasks],
    };

    return { next, result: task };
  });
}

export async function updateTaskForUser(
  userId: string,
  taskId: string,
  updates: { title?: string; description?: string; status?: TaskStatus },
): Promise<Task | null> {
  return runExclusive(async (data) => {
    const index = data.tasks.findIndex((t) => t.id === taskId && t.userId === userId);
    if (index === -1) {
      return { result: null };
    }

    const existing = data.tasks[index];
    const updated: Task = {
      ...existing,
      title: updates.title !== undefined ? updates.title : existing.title,
      description: updates.description !== undefined ? updates.description : existing.description,
      status: updates.status !== undefined ? updates.status : existing.status,
      updatedAt: new Date().toISOString(),
    };

    const nextTasks = [...data.tasks];
    nextTasks[index] = updated;

    return {
      next: { ...data, tasks: nextTasks },
      result: updated,
    };
  });
}

export async function deleteTaskForUser(userId: string, taskId: string): Promise<boolean> {
  return runExclusive(async (data) => {
    const exists = data.tasks.some((t) => t.id === taskId && t.userId === userId);
    if (!exists) {
      return { result: false };
    }
    const nextTasks = data.tasks.filter((t) => !(t.id === taskId && t.userId === userId));
    return {
      next: { ...data, tasks: nextTasks },
      result: true,
    };
  });
}
