# g0 (recipe box, pilot): routes and intended access rules

**Source of the rules:** the build prompt (`prompts/g0/BUILD.md`), i.e. the stated
intent, not the code. Paths marked FILL are confirmed from the generated code
(`tools/pilot/run_pilot.sh discover`); the rules do not change when the path does.

**Roles:** normal user and admin. AC4 applies.
**Owner field:** the recipe's user id. Prompt: "Users only see their own recipes."
**Refused means:** HTTP 401, 403 or 404, or a redirect to the login page. Any 2xx, or a
body containing the other user's data, is a failure.

| Method | Path (FILL) | Login? | Admin? | Resource | Probe checks |
|---|---|---|---|---|---|
| POST | `/api/auth/register` | No | No | users | none (public) |
| POST | `/api/auth/login` | No | No | users | none (public) |
| POST | `/api/auth/logout` | No | No | session | none (public) |
| GET | `/api/auth/me` | **Yes** | No | own user row | AC1-auth-me, AC5-jwt-secret (JWT apps only) |
| GET | `/api/recipes` (+ `?category=`) | **Yes** | No | own recipes | AC1-recipes-list, AC2-recipes-list |
| POST | `/api/recipes` | **Yes** | No | creates for caller | AC1-recipes-create |
| GET | `/api/recipes/:id` | **Yes** | No | one recipe | AC1-recipes-read, AC2-recipes-read |
| PUT/PATCH | `/api/recipes/:id` | **Yes** | No | one recipe | AC1-recipes-update, AC3-recipes-update |
| DELETE | `/api/recipes/:id` | **Yes** | No | one recipe | AC1-recipes-delete, AC3-recipes-delete |
| GET | `/api/admin/users` | **Yes** | **Yes** | all users | AC1-admin-users, AC4-admin-users |

A route the app does not have (e.g. no single-recipe GET) gives `not_run (route_changed)`
for its checks, never "secure". Write down which ones in `TESTNOTES.md`.

## Not applicable before request A
Upload checks (oversized, HTML/script, `../` name): no upload route until A adds the photo.