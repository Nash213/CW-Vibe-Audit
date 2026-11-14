import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();

router.get('/:id', async (req, res) => {
  const userId = Number(req.params.id);
  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ error: 'Invalid user ID.' });
  }

  const userResult = await pool.query(
    `SELECT id, display_name AS "displayName", created_at AS "createdAt"
     FROM users
     WHERE id = $1`,
    [userId]
  );

  if (userResult.rows.length === 0) {
    return res.status(404).json({ error: 'User not found.' });
  }

  const postsResult = await pool.query(
    `SELECT
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
     WHERE p.author_id = $1
     GROUP BY p.id, u.display_name
     ORDER BY p.created_at DESC`,
    [userId]
  );

  res.json({ user: userResult.rows[0], posts: postsResult.rows });
});

export default router;
