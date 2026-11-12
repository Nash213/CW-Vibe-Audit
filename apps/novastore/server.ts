import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { initDatabase } from './server/db.js';
import { authenticateToken } from './server/auth.js';
import authRoutes from './server/routes/auth.js';
import productRoutes from './server/routes/products.js';
import cartRoutes from './server/routes/cart.js';
import orderRoutes from './server/routes/orders.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;
const isProduction = process.env.NODE_ENV === 'production';

// Body and cookie parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Global authentication middleware to extract user if token present
app.use(authenticateToken);

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/orders', orderRoutes);

// System health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

async function startServer() {
  try {
    // Initialize PostgreSQL database schema & initial seed
    await initDatabase();

    if (!isProduction) {
      // In development mode, mount Vite development middleware
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
      console.log('Vite dev middleware mounted on Express.');
    } else {
      // In production mode, serve built static assets
      const distPath = path.resolve(__dirname, 'dist');
      app.use(express.static(distPath));
      app.get('*', (req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
      console.log(`Serving static production files from ${distPath}`);
    }

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`NovaStore online shop server running on http://0.0.0.0:${PORT}`);
    });
  } catch (error) {
    console.error('Fatal error starting server:', error);
    process.exit(1);
  }
}

startServer();
