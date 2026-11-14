# Community Board

A small community message board built with Node.js, Express, and PostgreSQL. The Express server serves both the web pages and the `/api` JSON endpoints from a single application.

## Features

- Sign up with email, display name, and password; log in and log out (session cookies backed by PostgreSQL)
- Publicly readable posts and comments (no login required to browse)
- Logged-in users can create posts (title + text) and comment on posts
- Authors can edit and delete their own posts and comments
- User profile pages showing display name, join date, and all posts by that user

## Tech Stack

- **Server:** Node.js, Express 5
- **Database:** PostgreSQL 17
- **Frontend:** Vanilla HTML, CSS, and JavaScript served from `public/`
- **Containers:** Docker & Docker Compose

## Quick Start (Docker)

1. *(Optional, recommended for reproducible installs)* Generate `package-lock.json`:
   ```bash
   npm install --package-lock-only