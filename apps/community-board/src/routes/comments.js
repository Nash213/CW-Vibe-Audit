import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../auth.js';

const router = Router();

function parseId(raw) {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

router.patch('/:id', requireAuth, async (req, res) => {
  const commentId = parseId(req.params.id);
  if (!commentId) return res.status(400).json({ error: 'Invalid comment ID.' });

  const body = String(req.body?.body || '').trim();
  if (!body || body.length > 4000) {
    return res.status(400).json({ error: 'Comment must be 1–4,000 characters.' });
  }

  const existing = await pool.query('SELECT author_id FROM comments WHERE id = $1', [commentId]);
  if (existing.rows.length === 0) {
    return res.status(404).json({ error: 'Comment not found.' });
  }
  if (existing.rows[0].author_id !== req.user.id) {
    return res.status(403).json({ error: 'You can only edit your own comments.' });
  }

  const { rows } = await pool.query(
    `UPDATE comments
     SET body = $1, updated_at = NOW()
     WHERE id = $2
     RETURNING id, post_id AS "postId", body, author_id AS "authorId", created_at AS "createdAt", updated_at AS "updatedAt"`,
    [body, commentId]
  );

  res.json({
    comment: {
      ...rows[0],
      authorDisplayName: req.user.displayName,
    },
  });
});

router.delete('/:id', requireAuth, async (req, res) => {
  const commentId = parseId(req.params.id);
  if (!commentId) return res.status(400).json({ error: 'Invalid comment ID.' });

  const existing = await pool.query('SELECT author_id FROM comments WHERE id = $1', [commentId]);
  if (existing.rows.length === 0) {
    return res.status(404).json({ error: 'Comment not found.' });
  }
  if (existing.rows[0].author_id !== req.user.id) {
    return res.status(403).json({ error: 'You can only delete your own comments.' });
  }

  await pool.query('DELETE FROM comments WHERE id = $1', [commentId]);
  res.json({ ok: true });
});

export default router;
