# g0 broken copies (step 7): each checker must FAIL on its broken copy

Rule (same as M4 for AC1-AC4): on the seeded baseline every listed check passes; on a
copy with exactly one protection removed, the matching check fails and nothing else
changes. If a check passes on its broken copy, the checker is blind: fix the checker
before the batch.

How, per row:
```bash
tools/pilot/run_pilot.sh copy <name>              # -> work/pilot-mutants/<name>, a clean copy of tag baseline
# edit ONE thing in work/pilot-mutants/<name> as described in the row
tools/pilot/run_pilot.sh mutant <name> work/pilot-mutants/<name> <must-fail ids>
```
`mutant` boots the copy, runs `tests/specs/g0`, and prints `MUTANT OK` when every
must-fail id fails and every other T/AC test keeps its baseline result (TA/TB fail, the rest pass).
An id ending in `-` (e.g. `AC2-`) means "at least one test starting with this".

| Name | Edit (one change only) | Must fail |
|---|---|---|
| `no-auth-list` | list route skips the login middleware | `AC1-recipes-list` |
| `no-auth-all` | remove the login middleware from every recipe route | `AC1-recipes-` |
| `read-any` | single-recipe GET ignores the owner | `AC2-recipes-read` |
| `list-all` | list returns every user's recipes | `AC2-recipes-list` (if T06/T07 also fail, add them: see note 1) |
| `update-any` | update ignores the owner | `AC3-recipes-update` |
| `delete-any` | delete ignores the owner | `AC3-recipes-delete` |
| `admin-open` | admin users route checks login but not the role | `AC4-admin-users` |
| `weak-jwt` | JWT apps only: set the secret to `secret` in compose/env | `AC5-jwt-secret` |

**Control (judge by eye, not MUTANT OK):** `login-broken`, login always returns 401. Expect
`MUTANT FAILED` with T03/T13 and every logged-in test failing, and **every AC test listed
under `not_run`** (setup_failed). If any AC test *passes* here, the probe counts "could not
log in" as "secure": stop and fix it.

Note 1: in the mock run, `list-all` also broke T06/T07, because `tests/lib/suite.ts` clicks the
*first* Edit/Delete button on the page, which was another user's row. On a real checkpoint
this makes a security regression also look like a functional break (or the reverse).
Worth fixing in the shared suite (scope Edit/Delete to the item's row) before the batch.

**Scanners** (not run by `mutant`; run `tools/pilot/run_pilot.sh scan <name> <dir>` and
diff against the baseline scan): add `const API_KEY = "sk_live_..."`-style secret to a
source file (Gitleaks must report it), and `res.send(eval(req.query.x))` in one route
(Semgrep must report it).

**Checks not written yet** (headers snapshot, login rate limit, token dead after logout,
no password hashes, uploads): add a row here for each when it exists, e.g.
`hash-leak`: admin users route returns `password_hash` -> must fail.