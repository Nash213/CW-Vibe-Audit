import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { apiRouter } from './src/server/routes.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const port = Number.parseInt(process.env.PORT || '3000', 10) || 3000;
  const isProduction = process.env.NODE_ENV === 'production';

  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  app.use(express.json({ limit: '256kb' }));
  app.use('/api', apiRouter);

  // Return JSON 404 for unknown API paths instead of falling through to SPA HTML
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found.' });
  });

  if (isProduction) {
    const distDir = path.resolve(__dirname, 'dist');
    const indexHtmlPath = path.join(distDir, 'index.html');

    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      if (!fs.existsSync(indexHtmlPath)) {
        res.status(500).send('Application build not found.');
        return;
      }
      res.sendFile(indexHtmlPath);
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Recipe Box server listening on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start Recipe Box server:', err);
  process.exit(1);
});
