require('dotenv').config();
const app = require('./app');
const { initializeDatabase, pool } = require('./config/db');

const PORT = parseInt(process.env.PORT, 10) || 3000;

async function startServer() {
  try {
    // Ensure DB connection and schema tables are set up
    await initializeDatabase();

    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`===============================================`);
      console.log(`Task Manager App is running on port ${PORT}`);
      console.log(`Access the web app at: http://localhost:${PORT}`);
      console.log(`API endpoints available at: http://localhost:${PORT}/api`);
      console.log(`===============================================`);
    });

    const shutdown = async (signal) => {
      console.log(`\nReceived ${signal}. Gracefully shutting down...`);
      server.close(async () => {
        console.log('HTTP server closed.');
        try {
          await pool.end();
          console.log('Database pool closed.');
          process.exit(0);
        } catch (err) {
          console.error('Error closing database pool:', err);
          process.exit(1);
        }
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (error) {
    console.error('Fatal error starting server:', error);
    process.exit(1);
  }
}

startServer();
