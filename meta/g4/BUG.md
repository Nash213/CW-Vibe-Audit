# Seeded bug (request B)
File: src/routes/posts.js, GET /api/posts/:id comments: `created_at ASC` -> `created_at DESC`.
Symptom (request B text): "Comments on a post are in reverse order: the newest comment is at the top instead of the bottom."
Check (TB): two comments added in order; the first one must be listed first.