# TaskFlow - Personal Task Manager

A simple, secure, full-stack task manager web app where users can sign up and keep track of their personal tasks. Everything runs from a single unified Express server with PostgreSQL, and can be launched with a single Docker Compose command.

---

## Tech Stack & Architecture

- **Backend**: Node.js & Express (serves both the static HTML/CSS/JS frontend pages and the JSON REST API under `/api`).
- **Database**: PostgreSQL (with automated schema migrations and connection retry logic).
- **Authentication**: Secure bcrypt password hashing and JSON Web Tokens (JWT) stored in HTTP-only cookies (with Bearer token fallback for API consumers).
- **Frontend**: Clean, modern vanilla JavaScript and responsive CSS without external CDN dependencies.
- **Containerization**: Single `docker-compose.yml` orchestrating the app and PostgreSQL container on a single port (`3000`).

---

## Features

- **User Authentication**:
  - Sign up with email and password.
  - Secure login and logout.
  - Automatic redirect to `/login` for unauthenticated visitors.
  - Automatic redirect to `/` for authenticated visitors visiting login/signup pages.
- **Task Management (CRUD)**:
  - Create tasks with a title, optional description, and status (`to do`, `in progress`, `done`).
  - View individual tasks or list of tasks.
  - Edit existing tasks (title, description, status) via an interactive modal.
  - Delete tasks with confirmation.
- **Filtering & Statistics**:
  - Real-time dropdown to filter tasks by status (`All`, `To Do`, `In Progress`, `Done`).
  - Summary stats counter cards showing counts for each task status.
- **Data Privacy & Multi-Tenancy**:
  - Strict user isolation enforced at the database query level: users can only view, edit, or delete their own tasks.

---

## Quick Start with Docker Compose

Ensure Docker and Docker Compose are installed on your machine.

1. **Start the application and database**:
   ```bash
   docker compose up --build
   ```

2. **Access the web app**:
   Open your browser and navigate to:
   [http://localhost:3000](http://localhost:3000)

3. **Stop the containers**:
   ```bash
   docker compose down
   ```

---

## Local Development Setup

To run the application locally without Docker:

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Configure environment**:
   Copy `.env.example` to `.env` and update your PostgreSQL connection string:
   ```env
   PORT=3000
   DATABASE_URL=postgres://postgres:postgrespassword@localhost:5432/taskmanager
   JWT_SECRET=supersecret-taskmanager-token-key-2026
   NODE_ENV=development
   ```

3. **Start the application**:
   ```bash
   npm start
   ```

4. **Run automated tests**:
   ```bash
   npm test
   ```

---

## API Reference

All API routes return JSON and accept JSON bodies.

### Authentication (`/api/auth`)

| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `POST` | `/api/auth/signup` | Register a new user with `email` and `password` | No |
| `POST` | `/api/auth/login` | Authenticate user and issue JWT cookie | No |
| `POST` | `/api/auth/logout` | Clear session cookie | No |
| `GET` | `/api/auth/me` | Fetch currently logged-in user profile | Yes |

### Tasks (`/api/tasks`)

| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `GET` | `/api/tasks` | List user's tasks (optional `?status=to do\|in progress\|done`) | Yes |
| `GET` | `/api/tasks/:id` | View a single task by ID | Yes |
| `POST` | `/api/tasks` | Create a task (`title`, optional `description`, `status`) | Yes |
| `PUT` | `/api/tasks/:id` | Update a task (`title`, `description`, `status`) | Yes |
| `DELETE` | `/api/tasks/:id` | Delete a task | Yes |

---

## Web Pages Served

- `GET /` - Main task manager dashboard
- `GET /login` - User login page
- `GET /signup` - User registration page

---

## Database Schema

```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE tasks (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT DEFAULT '',
  status VARCHAR(50) NOT NULL DEFAULT 'to do' CHECK (status IN ('to do', 'in progress', 'done')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_tasks_user_id ON tasks(user_id);
CREATE INDEX idx_tasks_status ON tasks(status);
```
