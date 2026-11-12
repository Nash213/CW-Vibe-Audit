import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import {
  createUser,
  getUserByEmail,
  getUserById,
  getUserWithPasswordById,
  updateUser,
  updateUserPassword,
  updateUserRole,
  deleteUser,
  getAllUsersWithStats,
  getAdminSummaryStats,
  getNotes,
  getNoteById,
  createNote,
  updateNote,
  deleteNote,
  toggleNotePin,
} from './db.js';
import { hashPassword, comparePassword, generateToken, requireAuth, requireAdmin } from './auth.js';

const router = Router();

// Setup Multer for Avatar uploads
const uploadsDir = path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const userId = req.user?.id || 'anon';
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `avatar-${userId}-${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files (JPEG, PNG, WebP, GIF) are allowed.'));
    }
  },
});

/* ==========================================================================
   AUTH ROUTES
   ========================================================================== */

// POST /api/auth/register
router.post('/auth/register', (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Name is required.' });
    }
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Valid email address is required.' });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
    }

    const existing = getUserByEmail(email.trim().toLowerCase());
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    const password_hash = hashPassword(password);
    const user = createUser({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password_hash,
      role: 'user',
    });

    const token = generateToken(user);
    res.cookie('token', token, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.status(201).json({ user, token });
  } catch (err: any) {
    console.error('Registration error:', err);
    return res.status(500).json({ error: 'Failed to create account.' });
  }
});

// POST /api/auth/login
router.post('/auth/login', (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const userRecord = getUserByEmail(email.trim().toLowerCase());
    if (!userRecord) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const isMatch = comparePassword(password, userRecord.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const user = getUserById(userRecord.id);
    const token = generateToken(user);

    res.cookie('token', token, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.json({ user, token });
  } catch (err: any) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Failed to log in.' });
  }
});

// POST /api/auth/logout
router.post('/auth/logout', (_req, res) => {
  res.clearCookie('token');
  return res.json({ success: true, message: 'Logged out successfully.' });
});

// GET /api/auth/me
router.get('/auth/me', requireAuth, (req, res) => {
  try {
    const user = getUserById(req.user!.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }
    return res.json({ user });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch current user.' });
  }
});

/* ==========================================================================
   PROFILE ROUTES
   ========================================================================== */

// PUT /api/profile - update name, bio, avatar_url
router.put('/profile', requireAuth, (req, res) => {
  try {
    const { name, bio, avatar_url } = req.body;
    if (name !== undefined && !name.trim()) {
      return res.status(400).json({ error: 'Name cannot be empty.' });
    }

    const updatedUser = updateUser(req.user!.id, {
      name: name?.trim(),
      bio: bio?.trim(),
      avatar_url: avatar_url?.trim(),
    });

    return res.json({ user: updatedUser });
  } catch (err) {
    console.error('Profile update error:', err);
    return res.status(500).json({ error: 'Failed to update profile.' });
  }
});

// POST /api/profile/avatar - File upload or Base64 data URL
router.post('/profile/avatar', requireAuth, (req, res) => {
  upload.single('avatar')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || 'Error uploading file.' });
    }

    try {
      let avatarUrl = '';

      if (req.file) {
        avatarUrl = `/uploads/${req.file.filename}`;
      } else if (req.body.dataUrl) {
        // Base64 dataURL fallback
        const matches = req.body.dataUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        if (matches && matches.length === 3) {
          const buffer = Buffer.from(matches[2], 'base64');
          const ext = matches[1].includes('png') ? '.png' : matches[1].includes('webp') ? '.webp' : '.jpg';
          const filename = `avatar-${req.user!.id}-${Date.now()}${ext}`;
          fs.writeFileSync(path.join(uploadsDir, filename), buffer);
          avatarUrl = `/uploads/${filename}`;
        } else {
          return res.status(400).json({ error: 'Invalid image data format.' });
        }
      } else if (req.body.avatar_url) {
        avatarUrl = req.body.avatar_url;
      } else {
        return res.status(400).json({ error: 'No image file or URL provided.' });
      }

      const updatedUser = updateUser(req.user!.id, { avatar_url: avatarUrl });
      return res.json({ user: updatedUser, avatarUrl });
    } catch (saveErr) {
      console.error('Avatar save error:', saveErr);
      return res.status(500).json({ error: 'Failed to process avatar.' });
    }
  });
});

// PUT /api/profile/password - change password
router.put('/profile/password', requireAuth, (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new password are required.' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters.' });
    }

    const userRecord = getUserWithPasswordById(req.user!.id);
    if (!userRecord || !comparePassword(currentPassword, userRecord.password_hash)) {
      return res.status(401).json({ error: 'Current password does not match.' });
    }

    const newHash = hashPassword(newPassword);
    updateUserPassword(req.user!.id, newHash);

    return res.json({ success: true, message: 'Password updated successfully.' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update password.' });
  }
});

/* ==========================================================================
   NOTES ROUTES
   ========================================================================== */

// GET /api/notes
router.get('/notes', requireAuth, (req, res) => {
  try {
    const { search, category, pinned } = req.query;
    const notes = getNotes(req.user!.id, {
      search: typeof search === 'string' ? search : undefined,
      category: typeof category === 'string' ? category : undefined,
      pinned: pinned === 'true' ? true : pinned === 'false' ? false : undefined,
    });
    return res.json({ notes });
  } catch (err) {
    console.error('Fetch notes error:', err);
    return res.status(500).json({ error: 'Failed to retrieve notes.' });
  }
});

// POST /api/notes
router.post('/notes', requireAuth, (req, res) => {
  try {
    const { title, content, category, tags, is_pinned, color } = req.body;
    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Note title is required.' });
    }

    const note = createNote({
      user_id: req.user!.id,
      title: title.trim(),
      content: content || '',
      category: category || 'General',
      tags: Array.isArray(tags) ? tags : [],
      is_pinned: Boolean(is_pinned),
      color: color || 'default',
    });

    return res.status(201).json({ note });
  } catch (err) {
    console.error('Create note error:', err);
    return res.status(500).json({ error: 'Failed to create note.' });
  }
});

// GET /api/notes/:id
router.get('/notes/:id', requireAuth, (req, res) => {
  try {
    const noteId = parseInt(req.params.id, 10);
    const note = getNoteById(noteId, req.user!.id);
    if (!note) {
      return res.status(404).json({ error: 'Note not found.' });
    }
    return res.json({ note });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch note.' });
  }
});

// PUT /api/notes/:id
router.put('/notes/:id', requireAuth, (req, res) => {
  try {
    const noteId = parseInt(req.params.id, 10);
    const existing = getNoteById(noteId, req.user!.id);
    if (!existing) {
      return res.status(404).json({ error: 'Note not found or permission denied.' });
    }

    const { title, content, category, tags, is_pinned, color } = req.body;
    const updated = updateNote(noteId, req.user!.id, {
      title: title !== undefined ? title.trim() : undefined,
      content,
      category,
      tags: Array.isArray(tags) ? tags : undefined,
      is_pinned: is_pinned !== undefined ? Boolean(is_pinned) : undefined,
      color,
    });

    return res.json({ note: updated });
  } catch (err) {
    console.error('Update note error:', err);
    return res.status(500).json({ error: 'Failed to update note.' });
  }
});

// DELETE /api/notes/:id
router.delete('/notes/:id', requireAuth, (req, res) => {
  try {
    const noteId = parseInt(req.params.id, 10);
    const existing = getNoteById(noteId, req.user!.id);
    if (!existing) {
      return res.status(404).json({ error: 'Note not found or permission denied.' });
    }

    deleteNote(noteId, req.user!.id);
    return res.json({ success: true, message: 'Note deleted.' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to delete note.' });
  }
});

// PATCH /api/notes/:id/pin
router.patch('/notes/:id/pin', requireAuth, (req, res) => {
  try {
    const noteId = parseInt(req.params.id, 10);
    const note = toggleNotePin(noteId, req.user!.id);
    if (!note) {
      return res.status(404).json({ error: 'Note not found.' });
    }
    return res.json({ note });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to toggle pin.' });
  }
});

/* ==========================================================================
   ADMIN ROUTES (Protected: role === 'admin')
   ========================================================================== */

// GET /api/admin/users
router.get('/admin/users', requireAuth, requireAdmin, (_req, res) => {
  try {
    const users = getAllUsersWithStats();
    return res.json({ users });
  } catch (err) {
    console.error('Admin users error:', err);
    return res.status(500).json({ error: 'Failed to fetch user list.' });
  }
});

// GET /api/admin/stats
router.get('/admin/stats', requireAuth, requireAdmin, (_req, res) => {
  try {
    const stats = getAdminSummaryStats();
    return res.json({ stats });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to retrieve admin stats.' });
  }
});

// PATCH /api/admin/users/:id/role
router.patch('/admin/users/:id/role', requireAuth, requireAdmin, (req, res) => {
  try {
    const targetUserId = parseInt(req.params.id, 10);
    const { role } = req.body;

    if (role !== 'admin' && role !== 'user') {
      return res.status(400).json({ error: "Role must be 'admin' or 'user'." });
    }

    // Safety: check if demoting the only admin
    if (role === 'user') {
      const stats = getAdminSummaryStats();
      if (stats.totalAdmins <= 1) {
        const targetUser = getUserById(targetUserId);
        if (targetUser?.role === 'admin') {
          return res.status(400).json({ error: 'Cannot demote the last remaining administrator.' });
        }
      }
    }

    const updated = updateUserRole(targetUserId, role);
    return res.json({ user: updated });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update user role.' });
  }
});

// DELETE /api/admin/users/:id
router.delete('/admin/users/:id', requireAuth, requireAdmin, (req, res) => {
  try {
    const targetUserId = parseInt(req.params.id, 10);

    // Prevent self-deletion
    if (targetUserId === req.user!.id) {
      return res.status(400).json({ error: 'You cannot delete your own admin account while logged in.' });
    }

    const targetUser = getUserById(targetUserId);
    if (!targetUser) {
      return res.status(404).json({ error: 'User does not exist.' });
    }

    deleteUser(targetUserId);
    return res.json({ success: true, message: `User "${targetUser.name}" and their notes have been removed.` });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to delete user.' });
  }
});

export default router;
