Goal
Build a small community board where people post messages that everyone can read and comment on.
 
Tech stack
- Node.js with Express for the server
- PostgreSQL as the database
- The server also serves the web pages, so everything runs from one app
- A JSON API under /api that the pages use
- One docker-compose.yml that starts the app and the database
- The app should be reachable on one web port
- Include a package-lock.json
 
Requirements
- Sign up with email, a display name and a password, log in, log out
- Logged-in users can write posts with a title and text
- Anyone, even when not logged in, can read posts and comments
- Logged-in users can comment on posts
- Authors can edit and delete their own posts and comments
- Each user has a profile page showing their display name and their posts
 
UI
- A home page with the latest posts
- A page for each post with its comments and a comment box
- Login, sign-up and profile pages
- Keep it clean and simple
