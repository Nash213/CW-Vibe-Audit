const express = require('express');
const { query } = require('../config/db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

const VALID_STATUSES = ['to do', 'in progress', 'done'];

// All task routes require authentication
router.use(authenticate);

// GET /api/tasks - list tasks for authenticated user, with optional status filter
router.get('/', async (req, res, next) => {
  try {
    const { status } = req.query;
    const userId = req.user.id;

    if (status && status !== 'all') {
      const normalizedStatus = status.toLowerCase().trim();
      if (!VALID_STATUSES.includes(normalizedStatus)) {
        return res.status(400).json({
          error: `Invalid status filter. Must be one of: 'all', ${VALID_STATUSES.map(s => `'${s}'`).join(', ')}`
        });
      }

      const result = await query(
        `SELECT id, user_id, title, description, status, created_at, updated_at
         FROM tasks
         WHERE user_id = $1 AND status = $2
         ORDER BY created_at DESC`,
        [userId, normalizedStatus]
      );
      return res.json(result.rows);
    }

    const result = await query(
      `SELECT id, user_id, title, description, status, created_at, updated_at
       FROM tasks
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId]
    );

    return res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

// GET /api/tasks/:id - view a single task
router.get('/:id', async (req, res, next) => {
  try {
    const taskId = parseInt(req.params.id, 10);
    if (isNaN(taskId)) {
      return res.status(400).json({ error: 'Invalid task ID format' });
    }

    const result = await query(
      `SELECT id, user_id, title, description, status, created_at, updated_at
       FROM tasks
       WHERE id = $1 AND user_id = $2`,
      [taskId, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    return res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// POST /api/tasks - create a new task
router.post('/', async (req, res, next) => {
  try {
    let { title, description, status } = req.body;

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return res.status(400).json({ error: 'Title is required' });
    }

    title = title.trim();
    if (title.length > 255) {
      return res.status(400).json({ error: 'Title cannot exceed 255 characters' });
    }

    description = typeof description === 'string' ? description.trim() : '';

    if (!status) {
      status = 'to do';
    } else {
      status = status.toLowerCase().trim();
      if (!VALID_STATUSES.includes(status)) {
        return res.status(400).json({
          error: `Status must be one of: ${VALID_STATUSES.map(s => `'${s}'`).join(', ')}`
        });
      }
    }

    const result = await query(
      `INSERT INTO tasks (user_id, title, description, status)
       VALUES ($1, $2, $3, $4)
       RETURNING id, user_id, title, description, status, created_at, updated_at`,
      [req.user.id, title, description, status]
    );

    return res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// PUT /api/tasks/:id - edit / update a task
router.put('/:id', async (req, res, next) => {
  try {
    const taskId = parseInt(req.params.id, 10);
    if (isNaN(taskId)) {
      return res.status(400).json({ error: 'Invalid task ID format' });
    }

    let { title, description, status } = req.body;

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return res.status(400).json({ error: 'Title is required' });
    }

    title = title.trim();
    if (title.length > 255) {
      return res.status(400).json({ error: 'Title cannot exceed 255 characters' });
    }

    description = typeof description === 'string' ? description.trim() : '';

    if (!status) {
      status = 'to do';
    } else {
      status = status.toLowerCase().trim();
      if (!VALID_STATUSES.includes(status)) {
        return res.status(400).json({
          error: `Status must be one of: ${VALID_STATUSES.map(s => `'${s}'`).join(', ')}`
        });
      }
    }

    const result = await query(
      `UPDATE tasks
       SET title = $1, description = $2, status = $3, updated_at = CURRENT_TIMESTAMP
       WHERE id = $4 AND user_id = $5
       RETURNING id, user_id, title, description, status, created_at, updated_at`,
      [title, description, status, taskId, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found or unauthorized' });
    }

    return res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/tasks/:id - delete a task
router.delete('/:id', async (req, res, next) => {
  try {
    const taskId = parseInt(req.params.id, 10);
    if (isNaN(taskId)) {
      return res.status(400).json({ error: 'Invalid task ID format' });
    }

    const result = await query(
      `DELETE FROM tasks
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [taskId, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found or unauthorized' });
    }

    return res.json({ message: 'Task deleted successfully', id: taskId });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
