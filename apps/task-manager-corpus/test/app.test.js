const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { installMock, resetMockDb } = require('./mockDb');

// Install mock before loading app
installMock();
const app = require('../src/app');

describe('Task Manager Application Tests', () => {
  beforeEach(() => {
    resetMockDb();
  });

  describe('Static Pages Serving', () => {
    it('should serve the main tasks page on GET /', async () => {
      const res = await request(app).get('/');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.headers['content-type'].includes('text/html'), true);
      assert.strictEqual(res.text.includes('TaskFlow'), true);
      assert.strictEqual(res.text.includes('Add New Task'), true);
    });

    it('should serve the login page on GET /login', async () => {
      const res = await request(app).get('/login');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.headers['content-type'].includes('text/html'), true);
      assert.strictEqual(res.text.includes('Welcome Back'), true);
      assert.strictEqual(res.text.includes('Log In'), true);
    });

    it('should serve the signup page on GET /signup', async () => {
      const res = await request(app).get('/signup');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.headers['content-type'].includes('text/html'), true);
      assert.strictEqual(res.text.includes('Create an Account'), true);
      assert.strictEqual(res.text.includes('Sign Up'), true);
    });

    it('should serve CSS styles on GET /css/style.css', async () => {
      const res = await request(app).get('/css/style.css');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.headers['content-type'].includes('text/css'), true);
    });
  });

  describe('Authentication API (/api/auth)', () => {
    it('should reject signup with invalid email', async () => {
      const res = await request(app)
        .post('/api/auth/signup')
        .send({ email: 'not-an-email', password: 'password123' });
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.error, 'Please provide a valid email address');
    });

    it('should reject signup with short password', async () => {
      const res = await request(app)
        .post('/api/auth/signup')
        .send({ email: 'alice@example.com', password: '123' });
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.error, 'Password must be at least 6 characters long');
    });

    it('should sign up a new user successfully and set auth cookie', async () => {
      const res = await request(app)
        .post('/api/auth/signup')
        .send({ email: 'alice@example.com', password: 'password123' });

      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.user.email, 'alice@example.com');
      assert.ok(res.body.token);

      // Verify cookie
      const cookies = res.headers['set-cookie'];
      assert.ok(cookies);
      assert.ok(cookies.some(c => c.startsWith('token=')));
    });

    it('should prevent signup with duplicate email', async () => {
      await request(app)
        .post('/api/auth/signup')
        .send({ email: 'alice@example.com', password: 'password123' });

      const res = await request(app)
        .post('/api/auth/signup')
        .send({ email: 'ALICE@example.com', password: 'newpassword123' });

      assert.strictEqual(res.status, 409);
      assert.strictEqual(res.body.error, 'An account with this email already exists');
    });

    it('should log in successfully with valid credentials', async () => {
      await request(app)
        .post('/api/auth/signup')
        .send({ email: 'alice@example.com', password: 'password123' });

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'alice@example.com', password: 'password123' });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.user.email, 'alice@example.com');
      assert.ok(res.body.token);

      const cookies = res.headers['set-cookie'];
      assert.ok(cookies.some(c => c.startsWith('token=')));
    });

    it('should reject login with incorrect password', async () => {
      await request(app)
        .post('/api/auth/signup')
        .send({ email: 'alice@example.com', password: 'password123' });

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'alice@example.com', password: 'wrongpassword' });

      assert.strictEqual(res.status, 401);
      assert.strictEqual(res.body.error, 'Invalid email or password');
    });

    it('should get current user info with valid token via GET /api/auth/me', async () => {
      const signupRes = await request(app)
        .post('/api/auth/signup')
        .send({ email: 'alice@example.com', password: 'password123' });

      const token = signupRes.body.token;

      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`);

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.user.email, 'alice@example.com');
    });

    it('should reject GET /api/auth/me without authentication', async () => {
      const res = await request(app).get('/api/auth/me');
      assert.strictEqual(res.status, 401);
    });

    it('should log out and clear cookie', async () => {
      const res = await request(app).post('/api/auth/logout');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.message, 'Logged out successfully');
      const cookies = res.headers['set-cookie'];
      assert.ok(cookies);
    });
  });

  describe('Tasks API & User Isolation (/api/tasks)', () => {
    let aliceToken;
    let bobToken;

    beforeEach(async () => {
      resetMockDb();

      // Create Alice
      const resAlice = await request(app)
        .post('/api/auth/signup')
        .send({ email: 'alice@example.com', password: 'password123' });
      aliceToken = resAlice.body.token;

      // Create Bob
      const resBob = await request(app)
        .post('/api/auth/signup')
        .send({ email: 'bob@example.com', password: 'password123' });
      bobToken = resBob.body.token;
    });

    it('should block unauthenticated access to /api/tasks', async () => {
      const res = await request(app).get('/api/tasks');
      assert.strictEqual(res.status, 401);
    });

    it('should allow Alice to create tasks', async () => {
      const res = await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({
          title: 'Buy groceries',
          description: 'Milk, Eggs, Bread',
          status: 'to do'
        });

      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.title, 'Buy groceries');
      assert.strictEqual(res.body.description, 'Milk, Eggs, Bread');
      assert.strictEqual(res.body.status, 'to do');
      assert.ok(res.body.id);
    });

    it('should validate task creation parameters', async () => {
      // Empty title
      const res1 = await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ title: '', status: 'to do' });
      assert.strictEqual(res1.status, 400);

      // Invalid status
      const res2 = await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ title: 'Valid title', status: 'invalid-status' });
      assert.strictEqual(res2.status, 400);
    });

    it('should ensure Alice only sees her tasks, and Bob only sees his tasks', async () => {
      // Alice creates 2 tasks
      await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ title: 'Alice Task 1', status: 'to do' });

      await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ title: 'Alice Task 2', status: 'done' });

      // Bob creates 1 task
      await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${bobToken}`)
        .send({ title: 'Bob Secret Task', status: 'in progress' });

      // Alice fetches tasks
      const aliceRes = await request(app)
        .get('/api/tasks')
        .set('Authorization', `Bearer ${aliceToken}`);

      assert.strictEqual(aliceRes.status, 200);
      assert.strictEqual(aliceRes.body.length, 2);
      assert.ok(aliceRes.body.every(t => t.title.startsWith('Alice')));
      assert.strictEqual(aliceRes.body.some(t => t.title === 'Bob Secret Task'), false);

      // Bob fetches tasks
      const bobRes = await request(app)
        .get('/api/tasks')
        .set('Authorization', `Bearer ${bobToken}`);

      assert.strictEqual(bobRes.status, 200);
      assert.strictEqual(bobRes.body.length, 1);
      assert.strictEqual(bobRes.body[0].title, 'Bob Secret Task');
    });

    it('should filter tasks by status correctly', async () => {
      // Alice creates tasks with different statuses
      await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ title: 'Todo Task', status: 'to do' });

      await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ title: 'In Progress Task', status: 'in progress' });

      await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ title: 'Done Task', status: 'done' });

      // Filter by 'in progress'
      const filterProgress = await request(app)
        .get('/api/tasks?status=in progress')
        .set('Authorization', `Bearer ${aliceToken}`);

      assert.strictEqual(filterProgress.status, 200);
      assert.strictEqual(filterProgress.body.length, 1);
      assert.strictEqual(filterProgress.body[0].status, 'in progress');
      assert.strictEqual(filterProgress.body[0].title, 'In Progress Task');

      // Filter by 'done'
      const filterDone = await request(app)
        .get('/api/tasks?status=done')
        .set('Authorization', `Bearer ${aliceToken}`);

      assert.strictEqual(filterDone.status, 200);
      assert.strictEqual(filterDone.body.length, 1);
      assert.strictEqual(filterDone.body[0].status, 'done');

      // Filter by 'all' returns all
      const filterAll = await request(app)
        .get('/api/tasks?status=all')
        .set('Authorization', `Bearer ${aliceToken}`);

      assert.strictEqual(filterAll.status, 200);
      assert.strictEqual(filterAll.body.length, 3);
    });

    it('should allow viewing a specific task by ID', async () => {
      const createRes = await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ title: 'Specific Task', description: 'Detailed info', status: 'to do' });

      const taskId = createRes.body.id;

      const viewRes = await request(app)
        .get(`/api/tasks/${taskId}`)
        .set('Authorization', `Bearer ${aliceToken}`);

      assert.strictEqual(viewRes.status, 200);
      assert.strictEqual(viewRes.body.title, 'Specific Task');
      assert.strictEqual(viewRes.body.description, 'Detailed info');
    });

    it('should prevent Bob from viewing Alice task by ID', async () => {
      const createRes = await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ title: 'Alice Private Task', status: 'to do' });

      const taskId = createRes.body.id;

      const viewRes = await request(app)
        .get(`/api/tasks/${taskId}`)
        .set('Authorization', `Bearer ${bobToken}`);

      assert.strictEqual(viewRes.status, 404);
    });

    it('should allow editing a task', async () => {
      const createRes = await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ title: 'Original Title', description: 'Original description', status: 'to do' });

      const taskId = createRes.body.id;

      const updateRes = await request(app)
        .put(`/api/tasks/${taskId}`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({
          title: 'Updated Title',
          description: 'Updated description',
          status: 'done'
        });

      assert.strictEqual(updateRes.status, 200);
      assert.strictEqual(updateRes.body.title, 'Updated Title');
      assert.strictEqual(updateRes.body.description, 'Updated description');
      assert.strictEqual(updateRes.body.status, 'done');
    });

    it('should prevent Bob from editing Alice task', async () => {
      const createRes = await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ title: 'Alice Task', status: 'to do' });

      const taskId = createRes.body.id;

      const updateRes = await request(app)
        .put(`/api/tasks/${taskId}`)
        .set('Authorization', `Bearer ${bobToken}`)
        .send({
          title: 'Bob Hacked Title',
          status: 'done'
        });

      assert.strictEqual(updateRes.status, 404);
    });

    it('should allow deleting a task', async () => {
      const createRes = await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ title: 'Task to be deleted', status: 'to do' });

      const taskId = createRes.body.id;

      const deleteRes = await request(app)
        .delete(`/api/tasks/${taskId}`)
        .set('Authorization', `Bearer ${aliceToken}`);

      assert.strictEqual(deleteRes.status, 200);
      assert.strictEqual(deleteRes.body.message, 'Task deleted successfully');

      // Verify it is gone
      const listRes = await request(app)
        .get('/api/tasks')
        .set('Authorization', `Bearer ${aliceToken}`);
      assert.strictEqual(listRes.body.length, 0);
    });

    it('should prevent Bob from deleting Alice task', async () => {
      const createRes = await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ title: 'Alice Indestructible Task', status: 'to do' });

      const taskId = createRes.body.id;

      const deleteRes = await request(app)
        .delete(`/api/tasks/${taskId}`)
        .set('Authorization', `Bearer ${bobToken}`);

      assert.strictEqual(deleteRes.status, 404);

      // Verify Alice still has her task
      const listRes = await request(app)
        .get('/api/tasks')
        .set('Authorization', `Bearer ${aliceToken}`);
      assert.strictEqual(listRes.body.length, 1);
      assert.strictEqual(listRes.body[0].title, 'Alice Indestructible Task');
    });
  });
});
