import { Router } from 'express';
import {
  createSession,
  hashPassword,
  requireAdmin,
  requireAuth,
  revokeSession,
  verifyPassword,
  type AuthenticatedRequest,
} from './auth.ts';
import {
  db,
  toPublicUser,
  toRecipeDTO,
  type AdminUserSummary,
  type RecipeCategory,
  type RecipeRow,
  type UserRow,
} from './db.ts';

const VALID_CATEGORIES = new Set<RecipeCategory>(['breakfast', 'main', 'dessert']);
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const normalized = raw.trim().toLowerCase();
  if (!normalized || normalized.length > 254 || !EMAIL_REGEX.test(normalized)) {
    return null;
  }
  return normalized;
}

function parsePassword(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  if (raw.length < 8 || raw.length > 128) {
    return null;
  }
  return raw;
}

function parseRecipeId(rawId: string): number | null {
  if (!/^\d+$/.test(rawId)) return null;
  const parsed = Number.parseInt(rawId, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseRecipeBody(body: unknown):
  | {
      ok: true;
      data: {
        title: string;
        ingredients: string;
        steps: string;
        category: RecipeCategory;
      };
    }
  | { ok: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Invalid request body.' };
  }
  const input = body as Record<string, unknown>;
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  const ingredients = typeof input.ingredients === 'string' ? input.ingredients.trim() : '';
  const steps = typeof input.steps === 'string' ? input.steps.trim() : '';
  const category = typeof input.category === 'string' ? (input.category.trim() as RecipeCategory) : null;

  if (!title || title.length > 140) {
    return { ok: false, error: 'Title is required and must be 140 characters or fewer.' };
  }
  if (!ingredients || ingredients.length > 10000) {
    return { ok: false, error: 'Ingredients are required.' };
  }
  if (!steps || steps.length > 20000) {
    return { ok: false, error: 'Steps are required.' };
  }
  if (!category || !VALID_CATEGORIES.has(category)) {
    return { ok: false, error: 'Category must be breakfast, main, or dessert.' };
  }

  return {
    ok: true,
    data: { title, ingredients, steps, category },
  };
}

export const apiRouter = Router();

apiRouter.get('/health', (_req, res) => {
  res.json({ ok: true });
});

apiRouter.get('/auth/setup-status', (_req, res) => {
  try {
    const row = db
      .prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin'")
      .get() as { count: number };
    res.json({ hasAdmin: row.count > 0 });
  } catch (err) {
    console.error('Failed to check admin setup status:', err);
    res.status(500).json({ error: 'Unable to check setup status.' });
  }
});

apiRouter.post('/auth/setup-admin', (req, res) => {
  const email = parseEmail(req.body?.email);
  const password = parsePassword(req.body?.password);

  if (!email) {
    res.status(400).json({ error: 'Please enter a valid email address.' });
    return;
  }
  if (!password) {
    res.status(400).json({ error: 'Password must be between 8 and 128 characters.' });
    return;
  }

  try {
    db.exec('BEGIN IMMEDIATE');
    try {
      const adminCountRow = db
        .prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin'")
        .get() as { count: number };

      if (adminCountRow.count > 0) {
        db.exec('ROLLBACK');
        res.status(409).json({ error: 'An admin account has already been created.' });
        return;
      }

      const existingEmail = db
        .prepare('SELECT id FROM users WHERE email = ?')
        .get(email) as { id: number } | undefined;

      if (existingEmail) {
        db.exec('ROLLBACK');
        res.status(409).json({ error: 'An account with that email already exists.' });
        return;
      }

      const passwordHash = hashPassword(password);
      const insertResult = db
        .prepare("INSERT INTO users (email, password_hash, role) VALUES (?, ?, 'admin')")
        .run(email, passwordHash);

      const userId = Number(insertResult.lastInsertRowid);
      const createdUser = db
        .prepare('SELECT id, email, role, created_at FROM users WHERE id = ?')
        .get(userId) as Pick<UserRow, 'id' | 'email' | 'role' | 'created_at'>;

      db.exec('COMMIT');

      const token = createSession(createdUser.id);
      res.status(201).json({ token, user: toPublicUser(createdUser) });
    } catch (innerErr) {
      db.exec('ROLLBACK');
      throw innerErr;
    }
  } catch (err) {
    console.error('Admin setup failed:', err);
    res.status(500).json({ error: 'Unable to create admin account.' });
  }
});

apiRouter.post('/auth/signup', (req, res) => {
  const email = parseEmail(req.body?.email);
  const password = parsePassword(req.body?.password);

  if (!email) {
    res.status(400).json({ error: 'Please enter a valid email address.' });
    return;
  }
  if (!password) {
    res.status(400).json({ error: 'Password must be between 8 and 128 characters.' });
    return;
  }

  try {
    const existing = db
      .prepare('SELECT id FROM users WHERE email = ?')
      .get(email) as { id: number } | undefined;

    if (existing) {
      res.status(409).json({ error: 'An account with that email already exists.' });
      return;
    }

    const passwordHash = hashPassword(password);
    const result = db
      .prepare("INSERT INTO users (email, password_hash, role) VALUES (?, ?, 'user')")
      .run(email, passwordHash);

    const userId = Number(result.lastInsertRowid);
    const createdUser = db
      .prepare('SELECT id, email, role, created_at FROM users WHERE id = ?')
      .get(userId) as Pick<UserRow, 'id' | 'email' | 'role' | 'created_at'>;

    const token = createSession(createdUser.id);
    res.status(201).json({ token, user: toPublicUser(createdUser) });
  } catch (err) {
    console.error('Signup failed:', err);
    res.status(500).json({ error: 'Unable to create account.' });
  }
});

apiRouter.post('/auth/login', (req, res) => {
  const email = parseEmail(req.body?.email);
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required.' });
    return;
  }

  try {
    const user = db
      .prepare('SELECT id, email, password_hash, role, created_at FROM users WHERE email = ?')
      .get(email) as UserRow | undefined;

    if (!user || !verifyPassword(password, user.password_hash)) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    const token = createSession(user.id);
    res.json({ token, user: toPublicUser(user) });
  } catch (err) {
    console.error('Login failed:', err);
    res.status(500).json({ error: 'Unable to log in.' });
  }
});

apiRouter.post('/auth/logout', requireAuth, (req: AuthenticatedRequest, res) => {
  try {
    if (req.sessionId) {
      revokeSession(req.sessionId);
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('Logout failed:', err);
    res.status(500).json({ error: 'Unable to log out.' });
  }
});

apiRouter.get('/auth/me', requireAuth, (req: AuthenticatedRequest, res) => {
  res.json({ user: req.user });
});

apiRouter.get('/recipes', requireAuth, (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const rawCategory = typeof req.query.category === 'string' ? req.query.category.trim() : '';

  if (rawCategory && rawCategory !== 'all' && !VALID_CATEGORIES.has(rawCategory as RecipeCategory)) {
    res.status(400).json({ error: 'Invalid category filter.' });
    return;
  }

  try {
    const rows = (
      rawCategory && rawCategory !== 'all'
        ? db
            .prepare(
              `SELECT id, user_id, title, ingredients, steps, category, created_at, updated_at
               FROM recipes
               WHERE user_id = ? AND category = ?
               ORDER BY created_at DESC, id DESC`
            )
            .all(userId, rawCategory)
        : db
            .prepare(
              `SELECT id, user_id, title, ingredients, steps, category, created_at, updated_at
               FROM recipes
               WHERE user_id = ?
               ORDER BY created_at DESC, id DESC`
            )
            .all(userId)
    ) as unknown as RecipeRow[];

    res.json({ recipes: rows.map(toRecipeDTO) });
  } catch (err) {
    console.error('Failed to list recipes:', err);
    res.status(500).json({ error: 'Unable to load recipes.' });
  }
});

apiRouter.get('/recipes/:id', requireAuth, (req: AuthenticatedRequest, res) => {
  const recipeId = parseRecipeId(String(req.params.id));
  if (!recipeId) {
    res.status(400).json({ error: 'Invalid recipe ID.' });
    return;
  }

  try {
    const row = db
      .prepare(
        `SELECT id, user_id, title, ingredients, steps, category, created_at, updated_at
         FROM recipes
         WHERE id = ? AND user_id = ?`
      )
      .get(recipeId, req.user!.id) as RecipeRow | undefined;

    if (!row) {
      res.status(404).json({ error: 'Recipe not found.' });
      return;
    }

    res.json({ recipe: toRecipeDTO(row) });
  } catch (err) {
    console.error('Failed to get recipe:', err);
    res.status(500).json({ error: 'Unable to load recipe.' });
  }
});

apiRouter.post('/recipes', requireAuth, (req: AuthenticatedRequest, res) => {
  const parsed = parseRecipeBody(req.body);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }

  try {
    const { title, ingredients, steps, category } = parsed.data;
    const insertResult = db
      .prepare(
        `INSERT INTO recipes (user_id, title, ingredients, steps, category)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(req.user!.id, title, ingredients, steps, category);

    const recipeId = Number(insertResult.lastInsertRowid);
    const created = db
      .prepare(
        `SELECT id, user_id, title, ingredients, steps, category, created_at, updated_at
         FROM recipes
         WHERE id = ? AND user_id = ?`
      )
      .get(recipeId, req.user!.id) as unknown as RecipeRow;

    res.status(201).json({ recipe: toRecipeDTO(created) });
  } catch (err) {
    console.error('Failed to create recipe:', err);
    res.status(500).json({ error: 'Unable to save recipe.' });
  }
});

apiRouter.put('/recipes/:id', requireAuth, (req: AuthenticatedRequest, res) => {
  const recipeId = parseRecipeId(String(req.params.id));
  if (!recipeId) {
    res.status(400).json({ error: 'Invalid recipe ID.' });
    return;
  }

  const parsed = parseRecipeBody(req.body);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }

  try {
    const { title, ingredients, steps, category } = parsed.data;
    const updateResult = db
      .prepare(
        `UPDATE recipes
         SET title = ?, ingredients = ?, steps = ?, category = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ? AND user_id = ?`
      )
      .run(title, ingredients, steps, category, recipeId, req.user!.id);

    if (updateResult.changes === 0) {
      res.status(404).json({ error: 'Recipe not found.' });
      return;
    }

    const updated = db
      .prepare(
        `SELECT id, user_id, title, ingredients, steps, category, created_at, updated_at
         FROM recipes
         WHERE id = ? AND user_id = ?`
      )
      .get(recipeId, req.user!.id) as unknown as RecipeRow;

    res.json({ recipe: toRecipeDTO(updated) });
  } catch (err) {
    console.error('Failed to update recipe:', err);
    res.status(500).json({ error: 'Unable to update recipe.' });
  }
});

apiRouter.delete('/recipes/:id', requireAuth, (req: AuthenticatedRequest, res) => {
  const recipeId = parseRecipeId(String(req.params.id));
  if (!recipeId) {
    res.status(400).json({ error: 'Invalid recipe ID.' });
    return;
  }

  try {
    const deleteResult = db
      .prepare('DELETE FROM recipes WHERE id = ? AND user_id = ?')
      .run(recipeId, req.user!.id);

    if (deleteResult.changes === 0) {
      res.status(404).json({ error: 'Recipe not found.' });
      return;
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('Failed to delete recipe:', err);
    res.status(500).json({ error: 'Unable to delete recipe.' });
  }
});

apiRouter.get('/admin/users', requireAuth, requireAdmin, (_req, res) => {
  try {
    const rows = db
      .prepare(
        `SELECT u.id, u.email, u.role, u.created_at, COUNT(r.id) AS recipe_count
         FROM users u
         LEFT JOIN recipes r ON r.user_id = u.id
         GROUP BY u.id
         ORDER BY u.created_at DESC, u.id DESC`
      )
      .all() as Array<{
      id: number;
      email: string;
      role: 'user' | 'admin';
      created_at: string;
      recipe_count: number;
    }>;

    const users: AdminUserSummary[] = rows.map((row) => ({
      id: row.id,
      email: row.email,
      role: row.role,
      createdAt: row.created_at,
      recipeCount: Number(row.recipe_count),
    }));

    res.json({ users });
  } catch (err) {
    console.error('Failed to list users for admin:', err);
    res.status(500).json({ error: 'Unable to load users.' });
  }
});
