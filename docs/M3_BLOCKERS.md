# 📌 M3 blockers: waiting on other people's work (pinned 2026-11-17)

Status of Wuth's M3-1, M3-3 and M3-4 on Tue 17 Nov. Everything M3 can do alone is
done; the items below are pinned until the named person delivers. Tick an item
and date it when it is unblocked.

## 📌 Jarred (corpus and agent runner) — blocks the pilot, M3-4

- [ ] **App repos with tags.** `apps/*` are plain folders, not git repositories, and
      have no `baseline` tag. `tools/assess.py` clones `apps/<app>` at `baseline` /
      `<chain>-r<k>` and stops without them.
- [ ] **App ids.** The folders are named `task-manager-corpus`, `notex---notes-&-workspace`,
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
- [ ] **Pilot chain DCBA on g1** (Gate 3, was due Fri 13 Nov): tags `DCBA-r1` … `DCBA-r4`.
      Until it exists, there is nothing to assess, ingest or measure, and no timing
      to estimate the batch from.
- [ ] **`agent.json` format.** `tools/ingest.py` reads `request`, `model`, `steps`,
      `tokens_in`/`tokens_out` (or `tokens: {in, out}`). Confirm the field names
      when the runner exists.

## 📌 Faris (boot and feature tests)

- [ ] **A real Playwright report** to replace the synthetic fixture
      `tools/tests/fixtures/playwright-sample.json` (the parser is written to
      Playwright's JSON format; one real report confirms it).
- [x] **Specs for g3 and g4.** `tests/specs/` has only `g1` and `g2`.
      *(Done 17 Nov by Faris: `tests/specs/g3/feature.spec.ts` and
      `tests/specs/g4/feature.spec.ts` on `origin/m2/playwright-project`; not merged
      into `main` yet.)*
- [ ] **`tests_version`.** Nothing writes it yet; ingest reads a `tests_version` file in
      each checkpoint folder. Agree who writes it (`boot_and_test.sh` or `assess.py`).

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

- [ ] **Where the official batch runs.** On the Windows dev machine: no `make`, no
      `jq` (`boot_and_test.sh` needs it), and Windows Application Control blocks
      unsigned binaries. Scanning works there (Docker only); boot and tests need a
      Linux shell, e.g. the WSL Ubuntu distribution with Docker Desktop integration.

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
