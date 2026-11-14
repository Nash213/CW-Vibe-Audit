import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../auth.js';

const router = Router();

function parseId(raw) {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

router.get('/', async (_req, res) => {
  const { rows } = await pool.query(`
    SELECT
      p.id,
      p.title,
      p.body,
      p.author_id AS "authorId",
      u.display_name AS "authorDisplayName",
      p.created_at AS "createdAt",
      p.updated_at AS "updatedAt",
      COUNT(c.id)::int AS "commentCount"
    FROM posts p
    JOIN users u ON u.id = p.author_id
    LEFT JOIN comments c ON c.post_id = p.id
    GROUP BY p.id, u.display_name
    ORDER BY p.created_at DESC
    LIMIT 100
  `);
  res.json({ posts: rows });
});

router.get('/:id', async (req, res) => {
  const postId = parseId(req.params.id);
  if (!postId) return res.status(400).json({ error: 'Invalid post ID.' });

  const postResult = await pool.query(
    `SELECT
       p.id,
       p.title,
       p.body,
       p.author_id AS "authorId",
       u.display_name AS "authorDisplayName",
       p.created_at AS "createdAt",
       p.updated_at AS "updatedAt"
     FROM posts p
     JOIN users u ON u.id = p.author_id
     WHERE p.id = $1`,
    [postId]
  );

  if (postResult.rows.length === 0) {
    return res.status(404).json({ error: 'Post not found.' });
  }

  const commentsResult = await pool.query(
    `SELECT
       c.id,
       c.post_id AS "postId",
       c.body,
       c.author_id AS "authorId",
       u.display_name AS "authorDisplayName",
       c.created_at AS "createdAt",
       c.updated_at AS "updatedAt"
     FROM comments c
     JOIN users u ON u.id = c.author_id
     WHERE c.post_id = $1
     ORDER BY c.created_at ASC`,
    [postId]
  );

  res.json({ post: postResult.rows[0], comments: commentsResult.rows });
});

router.post('/', requireAuth, async (req, res) => {
  const title = String(req.body?.title || '').trim();
  const body = String(req.body?.body || '').trim();

  if (!title || title.length > 150) {
    return res.status(400).json({ error: 'Title must be 1–150 characters.' });
  }
  if (!body || body.length > 10000) {
    return res.status(400).json({ error: 'Post text must be 1–10,000 characters.' });
  }

  const { rows } = await pool.query(
    `INSERT INTO posts (author_id, title, body)
     VALUES ($1, $2, $3)
     RETURNING id, title, body, author_id AS "authorId", created_at AS "createdAt", updated_at AS "updatedAt"`,
    [req.user.id, title, body]
  );

  res.status(201).json({
    post: {
      ...rows[0],
      authorDisplayName: req.user.displayName,
      commentCount: 0,
    },
  });
});

router.patch('/:id', requireAuth, async (req, res) => {
  const postId = parseId(req.params.id);
  if (!postId) return res.status(400).json({ error: 'Invalid post ID.' });

  const title = String(req.body?.title || '').trim();
  const body = String(req.body?.body || '').trim();

  if (!title || title.length > 150) {
    return res.status(400).json({ error: 'Title must be 1–150 characters.' });
  }
  if (!body || body.length > 10000) {
    return res.status(400).json({ error: 'Post text must be 1–10,000 characters.' });
  }

  const existing = await pool.query('SELECT author_id FROM posts WHERE id = $1', [postId]);
  if (existing.rows.length === 0) {
    return res.status(404).json({ error: 'Post not found.' });
  }
  if (existing.rows[0].author_id !== req.user.id) {
    return res.status(403).json({ error: 'You can only edit your own posts.' });
  }

  const { rows } = await pool.query(
    `UPDATE posts
     SET title = $1, body = $2, updated_at = NOW()
     WHERE id = $3
     RETURNING id, title, body, author_id AS "authorId", created_at AS "createdAt", updated_at AS "updatedAt"`,
    [title, body, postId]
  );

  res.json({
    post: {
      ...rows[0],
      authorDisplayName: req.user.displayName,
    },
  });
});

router.delete('/:id', requireAuth, async (req, res) => {
  const postId = parseId(req.params.id);
  if (!postId) return res.status(400).json({ error: 'Invalid post ID.' });

  const existing = await pool.query('SELECT author_id FROM posts WHERE id = $1', [postId]);
  if (existing.rows.length === 0) {
    return res.status(404).json({ error: 'Post not found.' });
  }
  if (existing.rows[0].author_id !== req.user.id) {
    return res.status(403).json({ error: 'You can only delete your own posts.' });
  }

  await pool.query('DELETE FROM posts WHERE id = $1', [postId]);
  res.json({ ok: true });
});

router.post('/:id/comments', requireAuth, async (req, res) => {
  const postId = parseId(req.params.id);
  if (!postId) return res.status(400).json({ error: 'Invalid post ID.' });

  const body = String(req.body?.body || '').trim();
  if (!body || body.length > 4000) {
    return res.status(400).json({ error: 'Comment must be 1–4,000 characters.' });
  }

  const postCheck = await pool.query('SELECT id FROM posts WHERE id = $1', [postId]);
  if (postCheck.rows.length === 0) {
    return res.status(404).json({ error: 'Post not found.' });
  }

  const { rows } = await pool.query(
    `INSERT INTO comments (post_id, author_id, body)
     VALUES ($1, $2, $3)
     RETURNING id, post_id AS "postId", body, author_id AS "authorId", created_at AS "createdAt", updated_at AS "updatedAt"`,
    [postId, req.user.id, body]
  );

  res.status(201).json({
    comment: {
      ...rows[0],
      authorDisplayName: req.user.displayName,
    },
  });
});

export default router;
