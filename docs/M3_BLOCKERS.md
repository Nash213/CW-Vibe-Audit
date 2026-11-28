# 📌 M3 blockers: waiting on other people's work (pinned 2026-11-17)

Status of Wuth's M3-1, M3-3 and M3-4 on Tue 17 Nov. Everything M3 can do alone is
done; the items below are pinned until the named person delivers. Tick an item
and date it when it is unblocked.

## 📌 Jarred (corpus and agent runner) — blocks the pilot, M3-4

- [x] **App repos with tags.** `apps/*` are plain folders, not git repositories, and
      have no `baseline` tag. `tools/assess.py` clones `apps/<app>` at `baseline` /
      `<chain>-r<k>` and stops without them.
      *(27 Nov: g1–g4 done by Wuth with `tools/init_app_repos.py`; g1 is the restored
      `task-manager-corpus`, see DECISIONS.md, 2026-11-27.)*
- [x] **Frozen prompts A–D** (Jarred-4). *(27 Nov: g1–g4 frozen in
      `prompts/MANIFEST.sha256` by Wuth.)*
- [x] **App ids.** *(27 Nov: `meta/apps.json` maps g1–g4 to their source folders; the
      repos are `apps/g1` … `apps/g4`.)*
- [x] **g1 stability run** with the new TA/TB and seeded filter bug
      (`tools/stability.sh g1 apps/g1 3`). Needs the batch host (below).
      *(27 Nov: `RESULT: OK`, 3 of 3, `results/stability/g1-20261127T195845Z.txt`.
      T01–T15 and all AC probes pass; TA fails with "no comment box found", TB fails
      because `?status=done` returns only the open task.)*
      *(27 Nov, later: g2, g3 and g4 baselines also `RESULT: OK` 3 of 3 on the batch host;
      g2 first needed build tools in its Dockerfile, see DECISIONS.md, 2026-11-27.)* The folders are named `task-manager-corpus`, `notex---notes-&-workspace`,
      `novastore` and `community-board`; the plan expects `apps/g1` … `apps/g4`
      (or i1/i2). The dev scans assume g1 = task manager, g2 = notes,
      g3 = shop, g4 = community board. Please confirm or rename.
      *(24 Nov: still open. `origin/m2/playwright-project` renamed
      `task-manager-corpus` → `taskmanager`, but no folder is named g1 … g4.)*
- [x] **g2 has no Compose file or Dockerfile.** `boot_and_test.sh` will record
      `boot=fail` (no compose file) on every g2 checkpoint.
      *(Done 17 Nov by Faris, commit `314f4ab` on `origin/m2/playwright-project`;
      not merged into `main` yet.)*
- [ ] **`meta/<app>/PORT` files.** Only `meta/g1/ROUTES.md` exists; there is no PORT file
      for any app, and the boot script uses it to find the port.
      *(24 Nov: partial. `origin/m2/playwright-project` has `meta/g1/PORT` = 3001, but
      g1's compose file still publishes `3000:3000`, so every g1 baseline would be
      noted `port_changed`. g2 … g4 compose files publish `127.0.0.1:3002/3003/3004`
      but have no PORT file.)*
- [x] **Pilot chain DCBA on g1** (Gate 3, was due Fri 13 Nov): tags `DCBA-r1` … `DCBA-r4`.
      Until it exists, there is nothing to assess, ingest or measure, and no timing
      to estimate the batch from.
      *(27 Nov: run by Wuth as the throwaway `DCBA-pilot` (tags `DCBA-pilot-r1` … `-r4`),
      outputs in `results/pilot/raw/g1/DCBA-pilot/`, not study data. Real agent
      gpt-5.4-mini: all 4 rounds `done` on attempt 1, 8–12 steps, 24–48 s each, about
      725k tokens in and 29k out for the chain. All 5 checkpoints boot; assessment about
      1 min each. TB passes from r2 and TA passes at r4, so both feature tests can pass.
      Findings for the team: (1) the C (restyle) round rewrote `src/routes/tasks.js` and
      fixed the seeded filter bug as a side effect, so the later B round changed only
      `test/mockDb.js`; in orders where C comes before B, the TB transition belongs to C.
      (2) D deleted most of `test/app.test.js` (427 lines removed). Semgrep results
      12 → 12 → 18 → 18 → 22; Gitleaks and npm audit 0 throughout.)*
- [x] **`agent.json` format.** `tools/ingest.py` reads `request`, `model`, `steps`,
      `tokens_in`/`tokens_out` (or `tokens: {in, out}`). Confirm the field names
      when the runner exists.
      *(27 Nov: `agent/agent_runner.py` and the stub write exactly these fields.)*

## 📌 Faris (boot and feature tests)

- [x] **A real Playwright report** to replace the synthetic fixture
      `tools/tests/fixtures/playwright-sample.json` (the parser is written to
      Playwright's JSON format; one real report confirms it).
      *(Done 17 Nov by Faris: `tests/fixtures/g1-baseline.json` and `g4-baseline.json`
      on `origin/m2/playwright-project`. Checked 24 Nov: `tools/parse_playwright.py`
      reads both with no error.)*
- [x] **Specs for g3 and g4.** `tests/specs/` has only `g1` and `g2`.
      *(Done 17 Nov by Faris: `tests/specs/g3/feature.spec.ts` and
      `tests/specs/g4/feature.spec.ts` on `origin/m2/playwright-project`; not merged
      into `main` yet.)*
- [x] **`tests_version`.** Nothing writes it yet; ingest reads a `tests_version` file in
      each checkpoint folder. Agree who writes it (`boot_and_test.sh` or `assess.py`).
      *(27 Nov: `assess.py` writes a content hash of the app's specs and the shared test
      code; see DECISIONS.md.)*

## 📌 Nazrul (probe, review and validity)

- [ ] **Confirm the transition rule across a round that did not boot.** Implemented
      as PROVISIONAL in `tools/transitions.py` (compare with the last round where
      the test ran; flagged `prev_adjacent = no`). See `docs/DECISIONS.md`.
- [ ] **Common-secret check (D9c, Nazrul-6).** Gitleaks v8.30.1 finds **0** secrets in
      all four baselines, although the Compose files hard-code
      `POSTGRES_PASSWORD: postgrespassword` and `JWT_SECRET: supersecret-…` (g1, g3,
      g4). The default Gitleaks rules skip low-entropy, human-chosen secrets, so the
      Invicti-style weak-secret finding needs D9c, or it is not measured at all.
- [ ] **Answer: four CSVs or three?** The plan says ingest writes "four CSVs". It writes
      checkpoints, findings and tests; labels.csv and links.csv are filled by
      reviewers (header files are now in `results/`).

## 📌 Batch host (team decision, needed before Sat 21 Nov)

- [x] **Where the official batch runs.** On the Windows dev machine: no `make`, no
      `jq` (`boot_and_test.sh` needs it), and Windows Application Control blocks
      unsigned binaries. Scanning works there (Docker only); boot and tests need a
      Linux shell, e.g. the WSL Ubuntu distribution with Docker Desktop integration.
      *(27 Nov: WSL Ubuntu has Docker (Desktop integration), git and python3, but no
      `jq`, `make` or Node; `tests/node_modules` is not installed on this machine.
      Needs `sudo apt install jq make nodejs npm`, then `npm ci` and
      `npx playwright install --with-deps chromium` in `tests/`.)*
      *(27 Nov, later: done by Wuth. WSL Ubuntu 26.04 with `jq`, `make`, Node, Docker
      Desktop WSL integration and Playwright Chromium. Boot, tests and scans run there;
      chain generation can stay on Windows.)*

## Official batch status (28 Nov)

- [x] **Generation.** All 17 chains (g1–g4 × ABCD, BDAC, CADB, DCBA, plus `g1/DCBA-rep`),
      68 rounds, every one `done` on attempt 1 with gpt-5.4-mini. Agent logs in
      `results/raw/<app>/<chain>/r<k>/`. `files=0` on `g1/CADB r4 B` and `g1/DCBA r3 B`:
      the earlier C round had already fixed the seeded bug, as in the pilot.
- [x] **Assessment.** All 85 checkpoints `done` (`results/raw/assess_batch.log`).
      34 did not boot; the causes checked so far are real agent breakage (e.g. D turned
      on SSL for a Postgres that has none; A broke `npm run build` in g3). Each assess.py
      now runs with `cwd` set to the repo: a stale `/mnt/c` cwd after a Docker boot
      broke every clone after the first.
- [x] **Ingest.** checkpoints (85), findings (3,372), tests (1,680), triage (55 pass→fail).
- [x] **Provisional tables R1–R3 and figures F1–F3.** Counts read 0 until labels exist;
      boot status is real.
- [x] **Label sheets** in `results/sheets/` (`make sheets`): findings, 388 Semgrep keys
      (under the 400 cut, so all severities; no Gitleaks keys); transitions, 55 rows.
- [ ] **Labelling.** Nazrul: findings. Jarred: transitions. Faris: causes for the 34
      non-booted checkpoints and `cause_guess` in `triage.csv`.
- [ ] **Second rating (N-8).** Seeded 20% sample (seed in DECISIONS.md), then
      `make_label_sheets.py second --keys sample.csv`. Faris: findings; Wuth: transitions.
- [ ] **Import and resolve.** `make labels` (`tools/import_labels.py`) writes
      `results/labels.csv` and prints percent agreement and kappa. Settled disagreements
      and resolved `unsure` go in `results/resolutions.csv`
      (app, kind, key_or_test, checkpoint_id, final, note).
- [ ] Then `make tables`, `make figures`, and compare with the pilot.

## Done by M3 alone (17 Nov)

- M3-1: scanners pinned as Docker images; Semgrep rules vendored (593 files,
  commit `a5ad171`) and shown to fire; RUNINFO.md filled; Makefile targets defined;
  CSV header files for labels and links.
- M3-3: Playwright parser and transition lister, with the plan's self-check cases
  as unit tests.
- M3-4 (partial): scan step (`tools/scan.py`) and one-checkpoint wrapper
  (`tools/assess.py`); dev scans of all four baselines in `results/dev/raw/`;
  scanning g1 twice gives identical keys; ingest → transitions → chain measures
  run end to end on the real scan output (`analysis/chain_measures.py`).
  Scan time per checkpoint: about 20 s (Semgrep 16–21 s, npm audit 1–17 s).
