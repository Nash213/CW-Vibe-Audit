# g0 recipe box: PILOT app (not study data)

g0 is a throwaway app used to dry-run the whole pipeline (build, boot, T01-T15/TA/TB,
scanners, access probe, one A-B-C-D chain, ingest) **before** the official batch on
g1-g4. It is never reported as a result.

## Isolation rules

- App repo: `apps/g0/` (its own git repo, git-ignored here, never committed to this repo).
- Raw output: `results/pilot/` (git-ignored). Never `results/raw/`.
- Not in `docs/RUNINFO.md` runs, not in tables or figures.
- Built with the **same agent, model and settings** as g1-g4, otherwise the pilot
  does not tell us anything about the real apps.
- C text in `prompts/g0/C.md` is the plan's wording; replace it with the frozen C
  text if Jarred freezes a different one, so the pilot sends what the batch will send.

## Steps (all from the repo root; driver: `tools/pilot/run_pilot.sh`)

| # | Step | Command | Pass when |
|---|---|---|---|
| 1 | Build | run the agent on an empty folder with `prompts/g0/BUILD.md`, save it as `apps/g0` | `docker compose up` serves `/` with HTTP 200 |
| 2 | Init repo | `tools/pilot/run_pilot.sh init` | `apps/g0` is a git repo with tag `baseline-unseeded` |
| 3 | Discover | `tools/pilot/run_pilot.sh discover` | you filled every `FILL` in `tests/lib/apps.ts` (g0) and `tests/specs/g0/*.ts` |
| 4 | Seed bug B | edit as in `meta/g0/BUG.md`, then `run_pilot.sh seed` | tag `baseline` exists |
| 5 | Stability | `run_pilot.sh stability` | `RESULT: OK` (T01-T15 pass, TA/TB fail, 3 of 3) |
| 6 | Probe on baseline | `run_pilot.sh probe` | every AC test passes or is a recorded `not_run`; note which |
| 7 | Broken copies | `run_pilot.sh mutant <name> <dir> <ids...>` per row of `MUTANTS.md` | each says `MUTANT OK` |
| 8 | Baseline assess | `run_pilot.sh assess ABCD 0` | `stage` = done, scanner files present |
| 9 | One chain | `run_pilot.sh start-chain ABCD`, then for k=1..4: send the request in a fresh agent session, `run_pilot.sh tag ABCD k`, `run_pilot.sh assess ABCD k` | 5 checkpoints, each `stage` = done |
| 10 | Ingest | `run_pilot.sh ingest` | CSVs in `results/pilot/`, transitions list makes sense |

Record what broke in `meta/g0/PILOT_LOG.md` (a harness bug found here is the point of
the pilot). Fix harness bugs in the shared code, then rerun the failed step.