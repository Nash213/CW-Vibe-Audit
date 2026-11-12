import pg from 'pg';
import bcrypt from 'bcryptjs';

const { Pool } = pg;

export interface DBClient {
  query: (text: string, params?: any[]) => Promise<{ rows: any[]; rowCount?: number | null }>;
}

let dbClient: DBClient | null = null;
let isPglite = false;

export async function getDb(): Promise<DBClient> {
  if (dbClient) return dbClient;

  const connectionString = process.env.DATABASE_URL || 
    (process.env.PGHOST ? `postgres://${process.env.PGUSER || 'postgres'}:${process.env.PGPASSWORD || 'postgres'}@${process.env.PGHOST}:${process.env.PGPORT || 5432}/${process.env.PGDATABASE || 'shop_db'}` : null);

  if (connectionString) {
    try {
      const pool = new Pool({
        connectionString,
        max: 10,
        connectionTimeoutMillis: 5000,
      });

      // Test connection
      await pool.query('SELECT 1');
      console.log('Connected successfully to PostgreSQL server via connection string.');
      
      const client: DBClient = {
        query: async (text: string, params?: any[]) => {
          const res = await pool.query(text, params);
          return { rows: res.rows, rowCount: res.rowCount };
        },
      };
      dbClient = client;
      return client;
    } catch (err: any) {
      console.warn(`Could not connect to external PostgreSQL server (${err.message}). Falling back to embedded PostgreSQL (PGlite)...`);
    }
  }

  // Fallback to embedded WebAssembly PostgreSQL (PGlite)
  try {
    const fs = await import('fs');
    fs.mkdirSync('./.data/pglite', { recursive: true });

    const { PGlite } = await import('@electric-sql/pglite');
    // Store data in .data/pglite or in memory
    const pglite = new PGlite('./.data/pglite');
    isPglite = true;
    console.log('Initialized embedded WebAssembly PostgreSQL (PGlite) database.');

    dbClient = {
      query: async (text: string, params?: any[]) => {
        const res = await pglite.query(text, params);
        return {
          rows: res.rows || [],
          rowCount: res.affectedRows ?? (res.rows ? res.rows.length : 0),
        };
      },
    };
    return dbClient;
  } catch (err: any) {
    console.error('Failed to initialize PGlite:', err);
    throw err;
  }
}

export async function initDatabase() {
  const db = await getDb();

  // Create tables using PostgreSQL dialect
  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      name VARCHAR(255) NOT NULL,
      role VARCHAR(50) NOT NULL DEFAULT 'customer',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      description TEXT NOT NULL,
      price NUMERIC(10, 2) NOT NULL,
      stock INTEGER NOT NULL DEFAULT 0,
      image_url TEXT,
      category VARCHAR(100) DEFAULT 'General',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      total_amount NUMERIC(10, 2) NOT NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'completed',
      shipping_address TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS order_items (
      id SERIAL PRIMARY KEY,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
      product_name VARCHAR(255) NOT NULL,
      unit_price NUMERIC(10, 2) NOT NULL,
      quantity INTEGER NOT NULL,
      subtotal NUMERIC(10, 2) NOT NULL
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS cart_items (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      quantity INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, product_id)
    );
  `);

  console.log('PostgreSQL database tables verified and ready.');

  // Auto-seed if products table is empty
  const countRes = await db.query('SELECT COUNT(*) as count FROM products');
  const count = parseInt(countRes.rows[0].count, 10);
  if (count === 0) {
    console.log('Seeding initial example products and admin...');
    await seedDemoData();
  }
}

export const SAMPLE_PRODUCTS = [
  {
    name: 'Aura Wireless Noise-Cancelling Headphones',
    description: 'Immersive spatial audio with custom 40mm drivers, 40-hour battery life, and ultra-plush memory foam earcups.',
    price: 199.99,
    stock: 25,
    category: 'Audio',
    image_url: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&q=80',
  },
  {
    name: 'Vantage Minimalist Mechanical Keyboard',
    description: 'Compact 75% hot-swappable keyboard with tactile lubricating switches, RGB per-key backlighting, and solid aluminum casing.',
    price: 139.50,
    stock: 18,
    category: 'Accessories',
    image_url: 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=800&q=80',
  },
  {
    name: 'Apex Precision Ergonomic Mouse',
    description: 'Hyper-accurate 26,000 DPI optical sensor, dual wireless connectivity (Bluetooth & 2.4GHz), and customizable thumb scroll wheel.',
    price: 79.99,
    stock: 30,
    category: 'Accessories',
    image_url: 'https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?w=800&q=80',
  },
  {
    name: 'Horizon Ultra-Wide 34" Curved Monitor',
    description: 'WQHD 3440x1440 resolution, 144Hz refresh rate, 1ms response time, HDR400, and USB-C 90W power delivery.',
    price: 499.00,
    stock: 8,
    category: 'Displays',
    image_url: 'https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?w=800&q=80',
  },
  {
    name: 'Lumio Smart Ambient Desk Lamp',
    description: 'Adaptive color temperature (2700K - 6500K) with touch dimming slider, integrated 15W Qi wireless charger, and aluminum hinge.',
    price: 64.99,
    stock: 45,
    category: 'Lighting',
    image_url: 'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=800&q=80',
  },
  {
    name: 'Nomad Waxed Canvas Everyday Backpack',
    description: 'Weatherproof 22L everyday pack with dedicated padded 16" laptop sleeve, water bottle pocket, and magnetic quick-access latch.',
    price: 119.00,
    stock: 14,
    category: 'Bags',
    image_url: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=800&q=80',
  },
  {
    name: 'Titanium Ceramic Thermal Tumbler 500ml',
    description: 'Double-wall vacuum insulation keeps drinks cold for 24h or piping hot for 12h. Leak-proof sip lid with ceramic interior coating.',
    price: 34.00,
    stock: 60,
    category: 'Lifestyle',
    image_url: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=800&q=80',
  },
  {
    name: 'Pulse Pro Fitness & Sleep Smartwatch',
    description: 'Continuous heart rate monitoring, SpO2, sleep staging analysis, 7-day battery life, and 5ATM water resistance.',
    price: 159.00,
    stock: 12,
    category: 'Wearables',
    image_url: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800&q=80',
  },
];

export async function seedDemoData() {
  const db = await getDb();

  // 1. Create default admin if none exists
  const adminCheck = await db.query("SELECT * FROM users WHERE role = 'admin' LIMIT 1");
  if (adminCheck.rows.length === 0) {
    const adminPassHash = await bcrypt.hash('admin123', 10);
    await db.query(
      `INSERT INTO users (email, password_hash, name, role) 
       VALUES ($1, $2, $3, $4) 
       ON CONFLICT (email) DO UPDATE SET role = 'admin'`,
      ['admin@novastore.com', adminPassHash, 'System Administrator', 'admin']
    );
    console.log('Seeded default admin account: admin@novastore.com / admin123');
  }

  // 2. Create demo customer
  const customerCheck = await db.query("SELECT * FROM users WHERE email = 'customer@example.com'");
  if (customerCheck.rows.length === 0) {
    const customerPassHash = await bcrypt.hash('customer123', 10);
    await db.query(
      `INSERT INTO users (email, password_hash, name, role) 
       VALUES ($1, $2, $3, $4) 
       ON CONFLICT (email) DO NOTHING`,
      ['customer@example.com', customerPassHash, 'Sarah Jenkins', 'customer']
    );
    console.log('Seeded demo customer account: customer@example.com / customer123');
  }

  // 3. Seed products if needed
  for (const prod of SAMPLE_PRODUCTS) {
    const existing = await db.query('SELECT id FROM products WHERE name = $1', [prod.name]);
    if (existing.rows.length === 0) {
      await db.query(
        `INSERT INTO products (name, description, price, stock, category, image_url) 
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [prod.name, prod.description, prod.price, prod.stock, prod.category, prod.image_url]
      );
    }
  }

  console.log('Demo products seeded successfully.');
}
