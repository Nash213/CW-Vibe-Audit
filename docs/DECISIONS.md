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

## 2026-11-27 — Agent runs on Azure AI Foundry (gpt-5.4-mini), not Gemini (Wuth, for Jarred-0)

**Decision.** `agent/agent_runner.py` calls `gpt-5.4-mini` (served as
`gpt-5.4-mini-2026-03-17`) through the OpenAI-compatible v1 API of an Azure AI Foundry
resource (`comp3226-vibe-audit-ai`, resource group `comp3226-vibe-audit`, Azure for
Students, Germany West Central, deployment `gpt-5.4-mini`, GlobalStandard). The endpoint,
key and deployment name live in the git-ignored `.env`. Gemini stays in the runner as two
fallback backends, `vertex` and `apikey`, with the same tools, sandbox and `agent.json`.

**This changes the plan's model** (`gemini-3.8-flash`). The team has to agree, and the
report's method section must name the model actually used.

**Why not Gemini.** Jarred-0 (due 4 Nov) was not delivered. All three Gemini routes were
tried on 27 Nov 2026:
- *Vertex AI* on a new project `comp3226-vibe-audit`: calls failed intermittently with 403
  "Access requires an eligible paid billing account in a supported region". The Cloud
  free-trial billing account is not eligible.
- *AI Studio key with billing linked*: "Prepay required" (a $5 minimum).
- *AI Studio free tier* (billing unlinked): `gemini-3.8-flash` and `gemini-3.6-flash`
  returned 503 "high demand" on most calls. That is not usable for batch runs.

Azure for Students gives $100 credit with no card, and the deployment needed no prepay.

**Reliability check** (`agent/reliability_check.py --backend azure`, 27 Nov 2026 18:24 UTC):
- 20/20 single-call pings with no retries, median latency 0.5 s, p90 0.6 s.
- 5/5 toy agent runs passed, 3 steps each, 0 retries, about 1.7 s per run.
- A request to write `../outside.txt` was refused by the file tool and nothing was written.
- `node hello.js` ran in the Docker sandbox and its output was saved.

Results are in `work/agent-reliability/azure-20261127T182409Z/` (git-ignored). The test
is small: about 1,300 input tokens per toy run. Real chain runs will be far larger.

**Secrets.** The key is read from `.env` on the host only. The sandbox container's
environment has every `AZURE_`, `OPENAI_`, `GEMINI_`, `GOOGLE_`, `CLOUDSDK_` and `VERTEX`
variable removed, and only the app repo is mounted.

## 2026-11-27 — Agent generation settings (Wuth) — PROVISIONAL until the team agrees

**Decision.** In `agent/settings.json` (`azure` block): temperature and reasoning effort
are left unset, so the deployment's defaults apply. Seed 3226, step cap 30, no
max-completion-token limit. Never changed after G1.

**Why.** A non-expert user would not change the defaults. In the reliability check the
default reasoning effort produced 0 reasoning tokens, so the model is not "thinking" before
answering. If the team wants reasoning on, set `reasoning_effort` before G1 and rerun the
check. The seed is set and recorded, but runs are not expected to replay exactly.

**Counting.** A step is one model call. `tokens_in` sums `prompt_tokens` over all calls
(each call re-sends the conversation). `tokens_out` sums `completion_tokens`, which already
include reasoning tokens. Reasoning tokens are also kept separately in `agent.json`
(`tokens_thoughts`).

**Still open (Jarred-0 items 4 and 6).** The deployment's rate limits (tokens per minute)
under real chain runs, the measured average steps and tokens over three real requests,
the budget against the $100 student credit, and the data-use terms for Azure AI Foundry.

## 2026-11-27 — Chain driver: resuming, crashed rounds and naming (Wuth, for Jarred-5)

**Decision.** `tools/run_chain.py` and `agent/stub_agent.py` follow plan Jarred-5. Where the
plan leaves a choice open, the driver does this:

- **Resuming.** "Check out with -B so a re-run starts clean" and "skip rounds whose tag
  exists" conflict if `-B` always starts at `baseline`. The driver checks out
  `chain-<id>` with `-B` from the **last tagged round** (or `baseline` if none). A re-run
  keeps finished rounds and restarts the unfinished one from the same tag.
- **Crashed rounds.** A crash mid-round leaves the agent's edits uncommitted, and the
  dirty-tree check would then block every retry. The driver discards uncommitted changes
  only when all of these hold: its own `round.json` for the next round says `running`
  or `failed`, the repo is on `chain-<id>`, and HEAD is still the round's start tag.
  Any other uncommitted change is refused and never discarded. The retry is recorded as
  attempt n+1, and the failed attempt's logs move to `r<k>/attempt-<n>/`.
- **What counts as an outcome.** Agent exit 0 (done or step cap) and exit 2 (blocked by
  the content filter) are committed and tagged. Any other exit (an API failure after
  retries, a crash) is a technical failure: nothing is committed and the round is retried
  (plan Jarred-7: re-run only after a technical failure, from the same tag).
  **Open for the team:** whether a content-filter block should count as an outcome.
- **Names.** Branch `chain-<id>` and tags `<id>-r<k>`, as in the plan's naming table (the
  g0 pilot script uses `chain/<id>`). Commit message `round-<k>`. Committer
  `vibe-audit <chain@vibe-audit.invalid>`. The `--suffix` is part of the id
  (`DCBA-rep-r2`), matching `tools/ingest.py`, which reads the order from the part
  before the first `-`.
- **Per-round metadata.** `round.json` (request, attempt, status, model, steps, tokens,
  start and end, commit, tag, files changed) sits beside the runner's `agent.json` and
  `transcript.jsonl` in `results/raw/<app>/<id>/r<k>/`. The agent's console output goes
  to `agent.stdout.log`, which `.gitignore` does not exclude. g0 defaults to
  `results/pilot/raw`, as `meta/g0/README.md` requires.
- **Manifest.** Checked at start and before every request. The driver refuses if a listed
  file is missing or changed, if a prompt the chain needs is not listed, or if the
  manifest is empty. It is empty today because the prompts are not frozen (Jarred-4), so
  no chain can run until they are.

**Tested.** `tools/tests/test_run_chain.py`, 22 tests with the stub: a full chain, a
re-run, an empty round, `-rep`, refusing a dirty tree or untracked file, a corrupted
prompt (at start and mid-chain), an unlisted prompt, an empty manifest, a missing
baseline or repo, bad chain strings, a gap in the tags, a failed round retried, a hand
edit never discarded, and a process killed half way that resumes. One real
two-round chain on a toy app through Azure `gpt-5.4-mini` also committed and tagged
both rounds (27 Nov).

## 2026-11-27 — App repos, frozen prompts and tests_version (Wuth, for Jarred-1/3/4) — PROVISIONAL until the team agrees

**App repos.** `tools/init_app_repos.py` builds `apps/g1` … `apps/g4` as their
own git repositories (git-ignored here) from the tracked source folders listed in
`meta/apps.json` (g1 = task manager, g2 = notes, g3 = novastore, g4 = community board). In each repo:
`import` (the source as tracked, which already contains the seeded B bug from `897ec49`),
then `baseline-fix: gitignore` (the app's `.gitignore` replaced by `node_modules/` only, as
plan Jarred-1 requires, so the agent's `.env` and config files are committed and scanned),
then `baseline-fix: lockfile` where the app had no `package-lock.json` (g2, g4), then tag
`baseline`. The seed is not a separate commit, because it was applied in the source folder
before this step; `meta/<app>/BUG.md` records it.

**g2 build tools (added 27 Nov, after the first g2 stability run).** On the batch host the
g2 baseline did not boot (`results/stability/g2-20261127T204329Z.txt`, 3 of 3
`boot=fail`): `better-sqlite3` 13.2.0 ships no prebuilt binary, so `npm install` compiles
it with node-gyp, and `node:22-slim` has no Python, make or g++. Faris's passing run on
25 Nov used the same Dockerfile and version, most likely with a cached build layer. Fix:
the Dockerfile installs `python3 make g++` before `npm install`, committed as
`baseline-fix: build tools for better-sqlite3` and `baseline` moved onto it (no g2
chain existed). The same change is in the tracked source folder, so a rebuild with
`init_app_repos.py` gives the same tree. It changes the build only, not the app's code.
Stability on the batch host after the fix: `RESULT: OK` 3 of 3 for g2
(`g2-20261127T205315Z.txt`), and for g3 and g4 unchanged
(`g3-20261127T204404Z.txt`, `g4-20261127T204702Z.txt`).

**g1 = `task-manager-corpus`, restored from `ffb995c^`.** The version swapped in on 17 Nov
(`apps/taskmanager`, an AI Studio export) cannot be a baseline without hand-writing much of
it: `AuthPage.tsx`, `index.html` and the entry module are missing, `package.json` lists no
dependencies, the UI and API disagree on status values and count fields, data goes to a
JSON file instead of the Compose database, and there is no Dockerfile or lockfile. A
baseline largely written by us would break "the baseline's security state is whatever the
generator produced". `task-manager-corpus` is Express + Postgres, has a Dockerfile and a
lockfile, publishes 3001 (= `meta/g1/PORT`), passed 3 of 3 stability runs on 17 Nov, and
is what `tests/lib/apps.ts` g1 was written for. `apps/taskmanager` is left in place,
unused, for its author to remove.

**g1 seed and request A (new).** B: inverted status filter in `src/routes/tasks.js`
(`status = $2` → `status <> $2`), still scoped to the user's own tasks (`meta/g1/BUG.md`).
A: comments on a task, the one non-upload feature among g1, g2, g4 (`meta/g1/A_SPEC.md`).
TA and TB in `tests/specs/g1/feature.spec.ts` are filled in. Checked by hand on 27 Nov:
`apps/g1` at `baseline` boots with Compose, home page 200, sign-up and login work, and
`?status=done` lists only the task that is **not** done, so the bug shows. Stability on the
batch host (WSL): `RESULT: OK` in 3 of 3 runs (`results/stability/g1-20261127T195845Z.txt`):
T01–T15 and the AC probes pass, TA fails with "no comment box found for the task", TB
fails because the done filter returns the open task. **Not yet shown:** that TA passes
once request A has added comments; check it on the first chain round that runs A.

**Prompts frozen (g1–g4).** `prompts/<app>/A.md` and `B.md` are the texts marked frozen in
`meta/<app>/A_SPEC.md` and `BUG.md`, copied word for word. `C.md` and `D.md` are
byte-identical to `prompts/g0/` (the plan's wording; D = "Please make this app secure.").
`tools/freeze_prompts.py` checks that C and D are identical across apps and that A, B and C
contain no security words, then writes `prompts/MANIFEST.sha256` (21 files, including the
BUILD prompts; 25 with g1). `--check` verifies it.

**tests_version.** Written by `tools/assess.py` into every checkpoint folder: `t-` plus 12
hex of a SHA-256 over `tests/specs/<app>/`, `tests/lib/`, `playwright.config.ts` and
`tests/package-lock.json` (line endings normalised). Any edit to an app's tests or probe
specs changes it, so the re-assessment rule (Wuth-5) can be checked from the CSVs alone.

**Checked.** A stub DCBA chain on a throw-away clone of `apps/g2` tagged `DCBA-r1` … `r4`
and a re-run did nothing. `assess.py g2 DCBA 0 --scan-only` cloned `baseline` and scanned it
in 27 s and wrote `tests_version`. Unit tests: 73 passed.

## 2026-11-27 — Tables R1 to R3: counting rules (Wuth, Wuth-6) — PROVISIONAL

**Decision.** `analysis/tables.py` builds R1 (per chain), R2 (damage per request type)
and R3 (per app) from the CSVs only. It writes `results/tables/R1.csv`, `R2.csv`, `R3.csv`
and `tables.md`. The plan fixes the measures (Table 3, D7, D8, D9a). These choices are
where it leaves room:

- **R2 counts only rounds after D.** That is what gives the plan's "8 each": across the
  four apps, BDAC, CADB and DCBA put A, B and C after D twice each. The D9a version
  uses only the first round after D (4 each). Rounds before D are in R1 but not in R2.
- **Reintroduced, per round (R2).** These are instances reintroduced at round r that were
  not already reintroduced at r−1. So a finding that comes back and stays is charged
  once, to the request that brought it back. R1 shows the cumulative count at the last
  round, which matches the survival measure.
- **Undefined values (D7).** New findings at r need both r−1 and r to have booted.
  Regressions need r to have booted. Survival needs D−1, D and the later round to have
  booted, and D to have fixed something. Undefined values print as `n/a`, or `dnb`
  when the round itself did not boot. They are left out of R2's means, and each mean
  shows its n beside it. Did-not-boot rounds are counted in their own column.
- **Labels and links.** Each finding instance is kept or dropped by the label of its own
  key, and only then renamed by `links.csv` (per app, transitive, to the smallest
  key). Instances with no final label are left out and counted in `tables.md`, so a
  gap in the labelling is visible rather than silently zero.
- **Repeat chains** (`DCBA-rep`) are left out of R1 to R3. They feed R5.
- **R3 columns:** chains, checkpoints booted, baseline findings (min–max across the
  app's chains, which also shows whether the round-0 re-runs agree, D9b), fixed by D
  (total and range), chains where D fixed nothing, final survival range, and total new
  findings and regressions.
- `--unlabelled` counts everything, for checking the pipeline. It writes to
  `results/dev/tables/` and every file says UNLABELLED.

**Tested.** `analysis/tests/test_tables.py` (8 hand-computed cases: a round that did not
boot, a linked key, false and unlabelled keys, a broken_test transition, an npm finding
confirmed by construction, a repeat chain). A random 16-chain dataset gives the
expected 8 and 4 applications per request type.

## 2026-11-27 — Figures F1 to F3: what each one draws (Wuth, Wuth-6) — PROVISIONAL

**Decision.** `analysis/figures.py` draws F1 to F3 from the same `tables.load` as R1 to R3,
so a figure and its table cannot disagree. It writes a PDF (for the paper) and a PNG of
each into `results/figures/`.

- **F1 survival.** One panel per app, one line per chain that has a round after D
  (BDAC, CADB, DCBA), at x = 0 to 3 rounds after D. No smoothing. A point is drawn only
  where survival is defined, so a round that did not boot leaves a gap in the line.
  A chain where D fixed nothing has no line. The n printed at each x is the number of
  chains measured there: 12, 8 and 4 with full data, fewer when rounds did not boot.
- **F2 damage.** Stacked bars per request type: reintroduced, other new findings
  (new − reintroduced), regressions. D8 makes new include reintroduced, so stacking
  reintroduced on top of new would count it twice. Bars are means over the rounds
  where all three parts are defined (n printed above each bar, plus did-not-boot
  rounds). The n can be smaller than R2's per-column n, which is counted per measure.
  Two panels: every round after D, and the D9a first round after D.
- **F3 grid.** One row per chain, one column per round. Each cell shows the request
  letter, then new findings / regressions. Shading is the sum of the two, on one blue
  scale. Did-not-boot cells are hatched grey and labelled `dnb`, and the D round is
  outlined.
- **Colours.** The first three slots of the dataviz reference palette, in fixed order
  (blue, orange, aqua). They pass the validator all-pairs on white (worst CVD ΔE 9.2,
  normal vision 24.0). Aqua is below 3:1 contrast, so every coloured series is also
  labelled directly, F1's orders also differ by marker, and R1 to R3 are the table
  view.
- `--unlabelled` writes to `results/dev/figures/` with "UNLABELLED - not for
  reporting" across every figure.
