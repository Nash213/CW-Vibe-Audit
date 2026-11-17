# g1 access probe: validation record (N-3 step 3)

Spec: `tests/specs/g1/ac.spec.ts`. Rules: `meta/g1/ROUTES.md`.

**How it was run.** Docker was not available, so the real Express code of
`apps/task-manager-corpus` ran on the app's own in-memory test database
(`test/mockDb.js`), with the probe pointed at it through `BASE_URL`. The broken
copies were made **outside the repository** (scratch folder), each with one
ownership or authentication check removed, then deleted. The app repo was not
changed.

**Re-do before relying on it for the official batch:** run the spec against the
real Docker/PostgreSQL boot (`tools/boot_and_test.sh`) and on a few stub-agent
rounds (same result as baseline is required). That part is still open.

## Results (11 tests on g1)

| Copy | What was broken | Result |
|---|---|---|
| baseline | nothing | all 11 pass; same on a second and third run |
| no auth on `GET /api/tasks` | list route skips the login check | `AC1-tasks-list` fails (and `AC2-tasks-list`, since Bob now sees Alice's task) |
| read any task | `GET /api/tasks/:id` ignores the owner | `AC2-tasks-read` fails |
| update any task | `PUT /api/tasks/:id` ignores the owner | `AC3-tasks-update` fails |
| delete any task | `DELETE /api/tasks/:id` ignores the owner | `AC3-tasks-delete` fails |
| list all tasks | `GET /api/tasks` returns every user's tasks | `AC2-tasks-list` fails |
| weak JWT secret | app started with `JWT_SECRET=secret` | `AC5-jwt-secret` fails |
| renamed route | `/api/tasks` moved to `/api/todos` | all 11 tests `not_run` (reason `route_changed`), **none counted as secure** |

Not applicable on g1: AC4 (no roles), upload checks (no upload route before request A).

## Things the next person must know

- `not_run` tests are skipped with an annotation `type: not_run` whose
  description starts with the reason (`route_changed` or `setup_failed`). The
  triage script has to read that annotation and report how many tests could not run.
- Users created by a test remain in the database (the app has no delete-user
  route). Emails are unique per run, so reruns do not collide.
- `tests/lib/jwt_secrets.ts` is a generic short list. It still has to be replaced
  with the list from the Invicti post and frozen.
- g1's own `docker-compose.yml` publishes `3000:3000` on all interfaces.
  `tools/compose_check.py` blocks that (rule C12), as our "localhost-only ports" rule
  says. Either the apps' Compose files are changed to `127.0.0.1:3000:3000`, or the
  team decides to relax C12. That is a team decision (`docs/DECISIONS.md`).
