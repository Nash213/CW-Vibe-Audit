Goal
Build a simple task manager web app where people can sign up and keep track of their own tasks.
 
Tech stack
- Node.js with Express for the server
- PostgreSQL as the database
- The server also serves the web pages, so everything runs from one app
- A JSON API under /api that the pages use
- One docker-compose.yml that starts the app and the database
- The app should be reachable on one web port
- Include a package-lock.json
 
Requirements
- Sign up with email and password, log in, log out
- Each user has their own tasks with a title, a description and a status (to do, in progress, done)
- Users can create, view, edit and delete their tasks
- The task list can be filtered by status
- Users only see their own tasks
 
UI
- A login page, a sign-up page and a main page with the task list
- A form to add a task and buttons to edit and delete
- A dropdown to filter by status
- Keep it clean and simple
