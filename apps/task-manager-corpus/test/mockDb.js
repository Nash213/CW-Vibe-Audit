// In-memory mock database for automated test suite
const db = require('../src/config/db');

let users = [];
let tasks = [];
let nextUserId = 1;
let nextTaskId = 1;

function resetMockDb() {
  users = [];
  tasks = [];
  nextUserId = 1;
  nextTaskId = 1;
}

function mockQuery(sql, params = []) {
  const normalizedSql = sql.replace(/\s+/g, ' ').trim();

  // Users table queries
  if (normalizedSql.includes('SELECT id FROM users WHERE LOWER(email) = LOWER($1)')) {
    const email = params[0].toLowerCase();
    const rows = users.filter(u => u.email.toLowerCase() === email).map(u => ({ id: u.id }));
    return Promise.resolve({ rows, rowCount: rows.length });
  }

  if (normalizedSql.includes('INSERT INTO users (email, password_hash) VALUES ($1, $2)')) {
    const user = {
      id: nextUserId++,
      email: params[0],
      password_hash: params[1],
      created_at: new Date().toISOString()
    };
    users.push(user);
    return Promise.resolve({
      rows: [{ id: user.id, email: user.email, created_at: user.created_at }],
      rowCount: 1
    });
  }

  if (normalizedSql.includes('SELECT id, email, password_hash, created_at FROM users WHERE LOWER(email) = LOWER($1)')) {
    const email = params[0].toLowerCase();
    const found = users.find(u => u.email.toLowerCase() === email);
    const rows = found ? [{ ...found }] : [];
    return Promise.resolve({ rows, rowCount: rows.length });
  }

  if (normalizedSql.includes('SELECT id, email, created_at FROM users WHERE id = $1')) {
    const found = users.find(u => u.id === params[0]);
    const rows = found ? [{ id: found.id, email: found.email, created_at: found.created_at }] : [];
    return Promise.resolve({ rows, rowCount: rows.length });
  }

  // Tasks table queries
  if (normalizedSql.startsWith('INSERT INTO tasks')) {
    const task = {
      id: nextTaskId++,
      user_id: params[0],
      title: params[1],
      description: params[2] || '',
      status: params[3] || 'to do',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    tasks.push(task);
    return Promise.resolve({ rows: [{ ...task }], rowCount: 1 });
  }

  if (normalizedSql.startsWith('SELECT') && normalizedSql.includes('FROM tasks WHERE user_id = $1 AND status = $2')) {
    const userId = params[0];
    const status = params[1];
    const rows = tasks
      .filter(t => t.user_id === userId && t.status === status)
      .sort((a, b) => b.id - a.id);
    return Promise.resolve({ rows: [...rows], rowCount: rows.length });
  }

  if (normalizedSql.startsWith('SELECT') && normalizedSql.includes('FROM tasks WHERE user_id = $1 ORDER BY created_at DESC')) {
    const userId = params[0];
    const rows = tasks
      .filter(t => t.user_id === userId)
      .sort((a, b) => b.id - a.id);
    return Promise.resolve({ rows: [...rows], rowCount: rows.length });
  }

  if (normalizedSql.startsWith('SELECT') && normalizedSql.includes('FROM tasks WHERE id = $1 AND user_id = $2')) {
    const taskId = params[0];
    const userId = params[1];
    const found = tasks.find(t => t.id === taskId && t.user_id === userId);
    const rows = found ? [{ ...found }] : [];
    return Promise.resolve({ rows, rowCount: rows.length });
  }

  if (normalizedSql.startsWith('UPDATE tasks')) {
    const title = params[0];
    const description = params[1];
    const status = params[2];
    const taskId = params[3];
    const userId = params[4];

    const taskIndex = tasks.findIndex(t => t.id === taskId && t.user_id === userId);
    if (taskIndex === -1) {
      return Promise.resolve({ rows: [], rowCount: 0 });
    }

    tasks[taskIndex].title = title;
    tasks[taskIndex].description = description;
    tasks[taskIndex].status = status;
    tasks[taskIndex].updated_at = new Date().toISOString();

    return Promise.resolve({ rows: [{ ...tasks[taskIndex]}], rowCount: 1 });
  }

  if (normalizedSql.startsWith('DELETE FROM tasks')) {
    const taskId = params[0];
    const userId = params[1];
    const taskIndex = tasks.findIndex(t => t.id === taskId && t.user_id === userId);
    if (taskIndex === -1) {
      return Promise.resolve({ rows: [], rowCount: 0 });
    }

    const deleted = tasks.splice(taskIndex, 1)[0];
    return Promise.resolve({ rows: [{ id: deleted.id }], rowCount: 1 });
  }

  throw new Error(`Unhandled SQL query in test mock: ${sql}`);
}

function installMock() {
  db.query = mockQuery;
}

module.exports = {
  resetMockDb,
  installMock
};
