# g1 (TaskFlow task manager): routes and intended access rules

**Source of the rules:** the app's README ("Features", "API Reference", "Web Pages
Served") and what a user sees in the UI. They were written **from the stated
intent, not from what the code does**, so a route whose code is missing a check
still shows the intended rule here. The route list was then checked against
`src/app.js`, `src/routes/auth.js` and `src/routes/tasks.js` only to make sure no
route is missing from the table.

**Roles:** none. g1 has one kind of user, so there is no admin route and **AC4 does
not apply to g1** (record "not applicable", never "secure").

**Owner field:** `tasks.user_id` (the user who created the task). A user may only
see, change or delete their own tasks. README: "Strict user isolation ... users
can only view, edit, or delete their own tasks."

**Refused means:** HTTP 401, 403 or 404, or a redirect to the login page. A 404
for someone else's task is acceptable (the task is hidden). Any 2xx, or any
response body that contains the other user's data, is a failure.

## API routes

| Method | Path | Login required? | Admin required? | Resource touched | Owner field | Probe checks |
|---|---|---|---|---|---|---|
| POST | `/api/auth/signup` | No | No | users (creates one) | n/a | none (public by design) |
| POST | `/api/auth/login` | No | No | users (reads one) | n/a | none (public by design) |
| POST | `/api/auth/logout` | No | No | session cookie | n/a | none (public by design; README: "Auth Required: No") |
| GET | `/api/auth/me` | **Yes** | No | users (own row) | `users.id` = token id | AC1-auth-me, AC5-jwt-secret |
| GET | `/api/tasks` | **Yes** | No | tasks (own list) | `tasks.user_id` | AC1-tasks-list, AC2-tasks-list |
| POST | `/api/tasks` | **Yes** | No | tasks (creates one for the caller) | `tasks.user_id` set to caller | AC1-tasks-create |
| GET | `/api/tasks/:id` | **Yes** | No | one task | `tasks.user_id` | AC1-tasks-read, AC2-tasks-read |
| PUT | `/api/tasks/:id` | **Yes** | No | one task | `tasks.user_id` | AC1-tasks-update, AC3-tasks-update |
| DELETE | `/api/tasks/:id` | **Yes** | No | one task | `tasks.user_id` | AC1-tasks-delete, AC3-tasks-delete |

Notes:
- Every protected route is tested by AC1 with a **real task id** for the `:id`
  routes, because a made-up id returns 404 and would look "refused" for the wrong
  reason.
- `GET /api/tasks?status=...` is the same route as the list; AC2-tasks-list also
  checks the filtered list.

## Page routes

| Method | Path | Login required? | Notes |
|---|---|---|---|
| GET | `/` | Intended yes (README: "Automatic redirect to `/login` for unauthenticated visitors") | See question Q1 |
| GET | `/login` | No | redirects to `/` when logged in (client side) |
| GET | `/signup` | No | redirects to `/` when logged in (client side) |
| GET | any other path | n/a | falls back to the `/` page with 404 |

Static files under `/css` and `/js` are public by design (no data in them).

## Open questions (settle with the team the same day)

- **Q1: is the `/` page itself protected, or only its data?** The README says
  unauthenticated visitors are redirected to `/login`. The pages are plain HTML
  files; the redirect can only come from the page's JavaScript, and the API
  behind it is protected. **Working answer:** the page shell is public and the
  protection is on the API, so the probe tests the API only. If the team decides
  the shell must also be refused, add `AC1-page-index`.
- **Q2: should a token stop working after logout?** `POST /api/auth/logout` only
  clears the cookie; a copied token stays valid until it expires (7 days). The
  README is silent. This is an N-6 check ("token dead after logout"), not AC1-AC5,
  so it is **not** probed here.
- **Q3: 404 or 403 for another user's task?** Both count as refused (see above).

## Checks that do not apply to g1

| ID | Reason |
|---|---|
| AC4 | No admin or other role in g1 |
| upload checks | g1 has no upload route; "not applicable" until request A adds one |
