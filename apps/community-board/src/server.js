import path from 'node:path';
import express from 'express';
import { initDb } from './db.js';
import { attachUser } from './auth.js';
import authRoutes from './routes/auth.js';
import postRoutes from './routes/posts.js';
import commentRoutes from './routes/comments.js';
import userRoutes from './routes/users.js';

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(import.meta.dirname, '..', 'public');

app.use(express.json({ limit: '100kb' }));
app.use(attachUser);
app.use(express.static(PUBLIC_DIR));

// JSON API
app.use('/api/auth', authRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/users', userRoutes);

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'API route not found.' });
});

// Web pages
app.get('/', (_req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));
app.get('/login', (_req, res) => res.sendFile(path.join(PUBLIC_DIR, 'login.html')));
app.get('/signup', (_req, res) => res.sendFile(path.join(PUBLIC_DIR, 'signup.html')));
app.get('/posts/:id', (_req, res) => res.sendFile(path.join(PUBLIC_DIR, 'post.html')));
app.get('/users/:id', (_req, res) => res.sendFile(path.join(PUBLIC_DIR, 'profile.html')));

app.use((err, req, res, _next) => {
  console.error(err);
  if (req.path.startsWith('/api')) {
    return res.status(500).json({ error: 'Internal server error.' });
  }
  res.status(500).send('Internal server error.');
});

await initDb();

app.listen(PORT, () => {
  console.log(`Community board listening on http://localhost:${PORT}`);
});
