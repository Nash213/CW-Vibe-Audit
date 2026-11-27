# Contributions

Record weekly hours and contribution links here. Every Friday each person adds their
own hours; the report's contribution percentages come from these hours plus a small
credit for reviews, cross-checked against the repository history (plan, Section 3.4).

**How this was filled (27 Nov 2026).** The *what* and *links* columns come from the git
history of `main` (`git log origin/main`) and the merge commits. **Hours are left for each
person to fill in themselves.** Nobody else's hours were guessed. Commits that appear twice
in the history (same message, rebased) are listed once.

Weeks follow the plan's calendar: Week 1 = Tue 3 – Mon 9 Nov, Week 2 = Tue 10 – Mon 16 Nov,
Week 3 = Tue 17 – Mon 23 Nov, Week 4 = Tue 24 – Mon 30 Nov, write-up = Tue 1 – Wed 9 Dec.
The plan's estimate is 12 / 14 / 14 / 12 hours per person for Weeks 1–4.

Commit links: `https://github.com/Nash213/CW-Vibe-Audit/commit/<hash>`.

## Who is who in the history

| Member | Role (plan Section 3.1) | Git identities |
|---|---|---|
| Wuth (Nadthawuth Ketnukkunn) | Static scans and data pipeline | `Nadthawuth Ketnukkunn` |
| Faris (Muhammad Faris Bin Jafer Sadig) | Dynamic harness (boot and feature tests) | `CluelessFrosting`, `Muhammad Faris Bin Jafer Sadig` |
| Nazrul | Access probe, review pipeline and validity | `Nash213` (repo owner); `mnmf1g24` |
| Jarred (Jarred Looi Xien Hong) | Corpus and agent runner | N/A |

## Week 1 (3 – 9 Nov)

| Member | Hours | What | Links |
|---|---|---|---|
| Wuth | | Repo scaffold (folder layout, README, Makefile stub, .gitignore, docs stubs) | `c02cd68` |
| Faris | | Playwright config, T01–T09 suite, TA and TB for g1 | `ee3e7b2`, `d54825d`, `d7530b5`, `dcdfebe` |
| Nazrul | | No commits this week | |
| Jarred | | No commits. Jarred-0 agent spike (due Wed 4 Nov) and the four baseline apps (due Fri 6 Nov) not delivered | |

## Week 2 (10 – 16 Nov)

| Member | Hours | What | Links |
|---|---|---|---|
| Wuth | | App 3: small shop (novastore) | `4b8cd0a` |
| Faris | | Pushed two corpus apps (task manager, notes), commit message says "me and jared's app"; test suite first iteration; merged PRs #1 and #2 | `9fe6079`, `a9dc75b`, `3da28b8`, `79dcdcb` |
| Nazrul | | Overleaf link for the report draft; community-board app (Express + PostgreSQL); compose safety check, g1 ROUTES.md, review protocol draft, Heilmeier notes; merged PR #3 | `6f13ada`, `c777cfb`, `201c6e7`, `9a9db67` |
| Jarred | | No commits. Stub agent (due Mon 9 Nov) and pilot chain DCBA on g1 (Gate 3, due Fri 13 Nov) not delivered | |

## Week 3 (17 – 23 Nov)

| Member | Hours | What | Links |
|---|---|---|---|
| Wuth | | Finding-key and measures modules with self-check tests; definition of "reintroduced"; Playwright parser and ingest; vendored Semgrep rules; pinned Docker scanners, scan step, checkpoint wrapper, Makefile targets, RUNINFO; pass-to-fail transition lister; chain measures script and dev scans of the four baselines; scanner/npm/transition decisions and the M3 blockers list; merged PR #4 | `296358e`, `1bb8180`, `d86682b`, `a48bc45`, `ead55ba`, `c75551a`, `f188fdb`, `15f9b0c`, `10c7c61`, `92bff55`, `c7f059d` |
| Faris | | Fixed stability script; more tests, Dockerfiles and port fixes for the app corpus; g1 aligned with AI Studio; first real Playwright reports (g1, g4) | `3424736`, `aa8554d`, `ffb995c` |
| Nazrul | | g1 shared app config fix; guessable JWT secrets list (AC5, placeholder); g1 access probe (AC1, AC2, AC3, AC5) and its validation on baseline and broken copies; labelling-sheet generator with fixtures and self-test | `c851ac3`, `ccfbd67`, `907d0e2`, `c481bed`, `b5064e9`, `9950042`, `7e334e3`, `ea71a44`, `793ef17` |
| Jarred | | No commits. Finished chains (due Mon 16 – Fri 20 Nov) not delivered | |

## Week 4 (24 – 30 Nov, in progress)

| Member | Hours | What | Links |
|---|---|---|---|
| Wuth | | Updated the M3 blockers list; merged PRs #5, #6 and #11. Agent runner for Jarred-0: tools, Docker sandbox, `agent.json` contract, Azure / Vertex / AI Studio backends, 25 tests, reliability check, model decision in DECISIONS.md (branch `m4/agent-runner`, not merged yet) | `ede4a1b`, `6eb60f4`, `93d1cff`, `838472c`, `4fbf3b3` |
| Faris | | Patched g2 and g3 package.json and Docker config so they boot; seeded B bugs for g2–g4 with BUG.md; TB for g2–g4; TA for g3 and g4, stability 3/3; A_SPEC and TESTNOTES for g2–g4; g0 for a preliminary test run; merged PRs #9 and #10 | `15201e9`, `897ec49`, `5ec3bbf`, `1fc308d`, `74e6eb3`, `1f0ad90`, `2aea92a`, `d87d041`, `657b30a` |
| Nazrul | | Adapted the labelling-sheet generator to the real findings and triage CSVs | `b1e8761` |
| Jarred | | No commits. Test-transition labels (due Fri 27 Nov) not delivered | |

## Reviews

Merging a pull request is the only review visible in git. The GitHub PR pages show who
approved and commented; add those here.

| Member | PRs merged |
|---|---|
| Wuth | #4, #5, #6, #11 |
| Faris | #1, #2, #9, #10 |
| Nazrul | #3 |
| Jarred | none |

## Jarred's tasks moved to other members

The plan says that when a member falls behind, the group moves their tasks and records
this honestly (Section 13.3). So far:

| Task (owner in plan: Jarred) | Done by | Where |
|---|---|---|
| Baseline apps g1–g4 | Faris (task manager, notes; committed by Faris), Wuth (novastore), Nazrul (community board) | `9fe6079`, `4b8cd0a`, `c777cfb` |
| Making the apps boot (Dockerfiles, ports, compose) | Faris | `aa8554d`, `15201e9` |
| Seeded B bugs, BUG.md, A_SPEC.md | Faris | `897ec49`, `74e6eb3` |
| Agent runner (Jarred-0, guide B.5) | Wuth | branch `m4/agent-runner` |
| Still open: stub agent, chain driver, frozen prompts, the 16 + 1 chain runs, test-transition labels | — | `docs/M3_BLOCKERS.md` |

Jarred, or anyone else, can add a dissenting line below.
