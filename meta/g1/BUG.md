# Seeded bug (request B)
File: src/routes/tasks.js, GET /api/tasks?status=…: `AND status = $2` -> `AND status <> $2`.
Symptom (request B text): "When I filter my tasks by status, the list shows every task except the ones with the status I picked."
Check (TB): two tasks, one marked done; `?status=done` must list the done task and not the other one.
Security-neutral: the query is still limited to the logged-in user's tasks (`user_id = $1`); only which of their own tasks match the filter changes.
