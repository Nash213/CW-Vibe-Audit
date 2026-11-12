const { Pool } = require('pg');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/taskmanager';

const pool = new Pool({
  connectionString,
  // Add SSL configuration if required in production
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client:', err);
});

async function query(text, params) {
  return pool.query(text, params);
}

// Helper to wait
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function initializeDatabase(maxRetries = 15, delayMs = 2000) {
  let retries = 0;
  while (retries < maxRetries) {
    try {
      console.log(`Connecting to PostgreSQL (attempt ${retries + 1}/${maxRetries})...`);
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Users table
        await client.query(`
          CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            email VARCHAR(255) UNIQUE NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          );
        `);

        // Tasks table
        await client.query(`
          CREATE TABLE IF NOT EXISTS tasks (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            title VARCHAR(255) NOT NULL,
            description TEXT DEFAULT '',
            status VARCHAR(50) NOT NULL DEFAULT 'to do' CHECK (status IN ('to do', 'in progress', 'done')),
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          );
        `);

        // Indexes for performance
        await client.query(`
          CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks(user_id);
          CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
        `);

        await client.query('COMMIT');
        console.log('Database initialized successfully.');
        return;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    } catch (err) {
      retries += 1;
      console.warn(`Database connection/init failed: ${err.message}. Retrying in ${delayMs / 1000}s...`);
      if (retries >= maxRetries) {
        console.error('Could not connect to database after multiple retries.');
        throw err;
      }
      await wait(delayMs);
    }
  }
}

module.exports = {
  pool,
  query,
  initializeDatabase
};
