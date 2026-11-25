# Decisions

Record each project decision with its date, owner, and rationale.

## 2026-11-17 — Definition of "reintroduced" (Wuth, M3)

**Decision.** For a chain where request D is applied at round r_D, the findings
reintroduced at a later round r are

    reintroduced(r) = (F_r − F_{r_D}) ∩ fixed_by_D,   fixed_by_D = F_{r_D − 1} − F_{r_D}

with multiset difference and intersection (`collections.Counter` `-` and `&`).
A key counts as reintroduced only by the amount it grew since right after D, and
never by more than D removed. Fix survival at r is `1 − |reintroduced| / |fixed_by_D|`,
reported as `n/a` when D fixed nothing.

**Why.** It is the only reading that gives both expected answers in the plan's
self-checks (Section 7.3): before {a:1, b:2, c:1}, after D {b:1, c:1}, later
{b:2, c:1, d:1} → reintroduced {b:1}; and duplicates before {x:2}, after D {x:1},
later {x:2} → reintroduced {x:1}, survival 0. Comparing the later round against
`before_D` instead would miss the second case.

**Where.** `analysis/measures.py` (`reintroduced`, `fix_survival`), tested in
`analysis/tests/test_measures.py`. Nazrul's statistics scripts must use the same
definition.

## 2026-11-17 — Scan output files and ingest rules (Wuth, M3)

**Decision.** The scan step writes these files into each checkpoint's raw folder,
next to the files from `tools/boot_and_test.sh`:

- `semgrep.json` — Semgrep JSON output.
- `semgrep.code.json` — a JSON list with the matched source lines for each Semgrep
  result, in the same order, read from the throw-away clone at scan time.
- `gitleaks.json` — Gitleaks JSON output (`null` when nothing is found).
- `npm-audit/<folder>.json` — `npm audit --json` for each folder with a
  `package.json`; `root.json` for the top folder, `/` written as `__`.

`tools/ingest.py` only ingests folders whose `stage` file says `done`, and lists
the others. A checkpoint with no Playwright report (did not boot, or Playwright
crashed twice) gets a `not_run` row for every test id seen for that app elsewhere.

**Why.** Semgrep keys hash the matched code read from our checkout, but the clone
is deleted after assessment and ingest reads only `results/raw/`. Saving the
lines at scan time keeps ingest reproducible from raw files alone, and lets the
key rule change later without re-scanning.

## 2026-11-17 — Scanners run in pinned Docker images (Wuth, M3)

**Decision.** Semgrep, Gitleaks and npm audit run in Docker images pinned by tag and
digest (`tools/scan.py`, versions in `docs/RUNINFO.md`), not as host binaries.
Semgrep and Gitleaks run with `--network none`.

**Why.** It makes results the same on every host, and the batch host needs only
Docker. Windows Application Control also blocks the native Semgrep and Gitleaks
binaries on the development machine.

## 2026-11-17 — npm lockfile fallback (Wuth, M3)

**Decision.** When a folder has no npm lockfile, `scan.py` generates one with
`npm install --package-lock-only --ignore-scripts`. If that fails, it retries once
with `--legacy-peer-deps`, and `scan.log` records `lock=generated-legacy-peer-deps`.

**Why.** The g2 baseline (notes app, `bun.lock` only) fails the plain lockfile build
with ERESOLVE, a peer-dependency conflict, so npm audit could not run on it at all.
The fallback resolves the same declared dependencies, and the log keeps it visible.

## 2026-11-17 — Transitions across a round that did not boot (Wuth, M3) — PROVISIONAL

**Decision (to confirm with Nazrul).** In `tools/transitions.py`, when the previous
round did not boot, or the test was `not_run` there, a round is compared with the
last earlier round of the same chain where that test has a result. Such rows have
`prev_adjacent = no`, and the lister prints how many there are.

**Why.** This is the plan's suggested choice (Wuth-3). It keeps a break that happened
across a non-booting round, rather than losing it.

**Status.** Nazrul has not confirmed it yet. If the team picks a different rule,
only `list_transitions` and its `test_previous_round_did_not_boot` case change.
