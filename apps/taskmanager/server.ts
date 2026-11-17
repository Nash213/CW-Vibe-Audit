import 'dotenv/config';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  authenticateUser,
  createSession,
  createTaskForUser,
  createUser,
  deleteSession,
  deleteTaskForUser,
  getUserBySessionToken,
  listTasksForUser,
  updateTaskForUser,
} from './src/server/store.ts';
import type { TaskStatus, User } from './src/types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const SESSION_COOKIE_NAME = 'clearlist_session';
const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
const VALID_STATUSES = new Set<TaskStatus>(['todo', 'in_progress', 'done']);

interface AuthenticatedRequest extends Request {
  user?: User;
  sessionToken?: string;
}

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) {
    return {};
  }
  const cookies: Record<string, string> = {};
  for (const part of cookieHeader.split(';')) {
    const eqIdx = part.indexOf('=');
    if (eqIdx === -1) {
      continue;
    }
    const key = part.slice(0, eqIdx).trim();
    const rawValue = part.slice(eqIdx + 1).trim();
    if (key) {
      try {
        cookies[key] = decodeURIComponent(rawValue);
      } catch {
        cookies[key] = rawValue;
      }
    }
  }
  return cookies;
}

function setSessionCookie(res: Response, token: string): void {
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${SESSION_MAX_AGE_SECONDS}`,
  );
}

function clearSessionCookie(res: Response): void {
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`,
  );
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidStatus(value: unknown): value is TaskStatus {
  return typeof value === 'string' && VALID_STATUSES.has(value as TaskStatus);
}

async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const cookies = parseCookies(req.headers.cookie);
    const token = cookies[SESSION_COOKIE_NAME];
    if (!token) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    const user = await getUserBySessionToken(token);
    if (!user) {
      clearSessionCookie(res);
      res.status(401).json({ error: 'Session expired. Please log in again.' });
      return;
    }
    req.user = user;
    req.sessionToken = token;
    next();
  } catch (err) {
    console.error('Authentication check failed:', err);
    res.status(500).json({ error: 'Authentication error.' });
  }
}

async function startServer(): Promise<void> {
  const app = express();

  app.use(express.json({ limit: '256kb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  app.post('/api/auth/signup', async (req: Request, res: Response) => {
    try {
      const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
      const password = typeof req.body?.password === 'string' ? req.body.password : '';

      if (!email || !isValidEmail(email)) {
        res.status(400).json({ error: 'Please enter a valid email address.' });
        return;
      }
      if (password.length < 6) {
        res.status(400).json({ error: 'Password must be at least 6 characters long.' });
        return;
      }

      const user = await createUser(email, password);
      const token = await createSession(user.id);
      setSessionCookie(res, token);
      res.status(201).json({ user });
    } catch (err) {
      const tagged = err as Error & { code?: string };
      if (tagged.code === 'EMAIL_EXISTS') {
        res.status(409).json({ error: tagged.message });
        return;
      }
      console.error('Signup failed:', err);
      res.status(500).json({ error: 'Unable to create account right now.' });
    }
  });

  app.post('/api/auth/login', async (req: Request, res: Response) => {
    try {
      const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
      const password = typeof req.body?.password === 'string' ? req.body.password : '';

      if (!email || !password) {
        res.status(400).json({ error: 'Email and password are required.' });
        return;
      }

      const user = await authenticateUser(email, password);
      if (!user) {
        res.status(401).json({ error: 'Invalid email or password.' });
        return;
      }

      const token = await createSession(user.id);
      setSessionCookie(res, token);
      res.json({ user });
    } catch (err) {
      console.error('Login failed:', err);
      res.status(500).json({ error: 'Unable to log in right now.' });
    }
  });

  app.post('/api/auth/logout', async (req: Request, res: Response) => {
    try {
      const cookies = parseCookies(req.headers.cookie);
      const token = cookies[SESSION_COOKIE_NAME];
      if (token) {
        await deleteSession(token);
      }
      clearSessionCookie(res);
      res.json({ ok: true });
    } catch (err) {
      console.error('Logout failed:', err);
      res.status(500).json({ error: 'Unable to log out right now.' });
    }
  });

  app.get('/api/auth/me', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    res.json({ user: req.user });
  });

  app.get('/api/tasks', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const statusParam = typeof req.query.status === 'string' ? req.query.status : 'all';
      if (statusParam !== 'all' && !isValidStatus(statusParam)) {
        res.status(400).json({ error: 'Invalid status filter.' });
        return;
      }

      const result = await listTasksForUser(
        req.user!.id,
        statusParam === 'all' ? undefined : statusParam,
      );
      res.json(result);
    } catch (err) {
      console.error('Failed to list tasks:', err);
      res.status(500).json({ error: 'Unable to load tasks right now.' });
    }
  });

  app.post('/api/tasks', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
      const description =
        typeof req.body?.description === 'string' ? req.body.description.trim() : '';
      const rawStatus = req.body?.status ?? 'todo';

      if (!title) {
        res.status(400).json({ error: 'Task title is required.' });
        return;
      }
      if (title.length > 200) {
        res.status(400).json({ error: 'Task title must be 200 characters or fewer.' });
        return;
      }
      if (description.length > 2000) {
        res.status(400).json({ error: 'Description must be 2000 characters or fewer.' });
        return;
      }
      if (!isValidStatus(rawStatus)) {
        res.status(400).json({ error: 'Status must be todo, in_progress, or done.' });
        return;
      }

      const task = await createTaskForUser(req.user!.id, {
        title,
        description,
        status: rawStatus,
      });
      res.status(201).json({ task });
    } catch (err) {
      console.error('Failed to create task:', err);
      res.status(500).json({ error: 'Unable to create task right now.' });
    }
  });

  const handleUpdateTask = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const taskId = typeof req.params.id === 'string' ? req.params.id : '';
      if (!taskId) {
        res.status(400).json({ error: 'Task ID is required.' });
        return;
      }

      const updates: { title?: string; description?: string; status?: TaskStatus } = {};

      if (req.body?.title !== undefined) {
        if (typeof req.body.title !== 'string' || !req.body.title.trim()) {
          res.status(400).json({ error: 'Task title cannot be empty.' });
          return;
        }
        const trimmedTitle = req.body.title.trim();
        if (trimmedTitle.length > 200) {
          res.status(400).json({ error: 'Task title must be 200 characters or fewer.' });
          return;
        }
        updates.title = trimmedTitle;
      }

      if (req.body?.description !== undefined) {
        if (typeof req.body.description !== 'string') {
          res.status(400).json({ error: 'Description must be text.' });
          return;
        }
        const trimmedDescription = req.body.description.trim();
        if (trimmedDescription.length > 2000) {
          res.status(400).json({ error: 'Description must be 2000 characters or fewer.' });
          return;
        }
        updates.description = trimmedDescription;
      }

      if (req.body?.status !== undefined) {
        if (!isValidStatus(req.body.status)) {
          res.status(400).json({ error: 'Status must be todo, in_progress, or done.' });
          return;
        }
        updates.status = req.body.status;
      }

      if (
        updates.title === undefined &&
        updates.description === undefined &&
        updates.status === undefined
      ) {
        res.status(400).json({ error: 'Provide at least one field to update.' });
        return;
      }

      const task = await updateTaskForUser(req.user!.id, taskId, updates);
      if (!task) {
        res.status(404).json({ error: 'Task not found.' });
        return;
      }
      res.json({ task });
    } catch (err) {
      console.error('Failed to update task:', err);
      res.status(500).json({ error: 'Unable to update task right now.' });
    }
  };

  app.patch('/api/tasks/:id', requireAuth, handleUpdateTask);
  app.put('/api/tasks/:id', requireAuth, handleUpdateTask);

  app.delete('/api/tasks/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const taskId = typeof req.params.id === 'string' ? req.params.id : '';
      if (!taskId) {
        res.status(400).json({ error: 'Task ID is required.' });
        return;
      }
      const deleted = await deleteTaskForUser(req.user!.id, taskId);
      if (!deleted) {
        res.status(404).json({ error: 'Task not found.' });
        return;
      }
      res.json({ ok: true });
    } catch (err) {
      console.error('Failed to delete task:', err);
      res.status(500).json({ error: 'Unable to delete task right now.' });
    }
  });

  app.use('/api', (_req: Request, res: Response) => {
    res.status(404).json({ error: 'API endpoint not found.' });
  });

  if (process.env.NODE_ENV === 'production') {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ClearList server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal error starting server:', err);
  process.exit(1);
});
