Goal
Build a small recipe box web app where people save their own recipes, and an admin can see who is using the app.

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
- Each user has their own recipes with a title, ingredients, steps and a category (breakfast, main, dessert)
- Users can create, view, edit and delete their recipes
- The recipe list can be filtered by category
- Users only see their own recipes
- There are two roles: normal user and admin
- An admin can see a list of all users
- Include a way to create the first admin account

UI
- Login and sign-up pages
- A page listing my recipes, newest first, with a dropdown to filter by category
- A form to add or edit a recipe, and a button to delete it
- An admin page with the list of users, only for admins
- Keep it clean and simple