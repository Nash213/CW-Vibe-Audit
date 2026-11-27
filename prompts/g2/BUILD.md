Goal
Build a private notes web app where people write notes, can share a note with a link, and an admin can see who is using the app.
 
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
- Each user has their own notes with a title and text
- Users can create, view, edit and delete their notes
- A user can turn on a share link for a note, so anyone with the link can read it, and turn it off again
- There are two roles: normal user and admin
- An admin can see a list of all users
- Include a way to create the first admin account
 
UI
- Login and sign-up pages
- A page listing my notes, newest first, and a page to write or edit a note
- A "share" toggle on each note that shows the link
- An admin page with the list of users, only for admins
