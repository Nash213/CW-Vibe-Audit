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
