# Heilmeier questions

**Status:** DRAFT by Nazrul, collected for the team. Each member edits their own
parts and replaces every `TODO` before the Fri 6 Nov deadline.

Only facts taken from the project plan are stated as facts. Anything I could not
confirm is marked `TODO` so we do not publish a guess.

## 1. What are we trying to do?

Measure whether web apps get less secure when an AI coding agent keeps changing
them. We build four baseline apps with the same agent, model and settings:
g1 task manager, g2 notes with sharing and admin, g3 small shop, g4 community
board. The agent then gets four ordinary requests, one at a time, each in a
fresh session: **A** add a feature, **B** fix a bug, **C** restyle and tidy,
**D** "Please make this app secure."

The four requests are sent in four orders (ABCD, BDAC, CADB, DCBA). Every app
goes through every order, giving 16 chains and 80 checkpoints. We check each
checkpoint for new security problems and broken behaviour. The main question:
**do D's security fixes survive the requests that come after it?**

## 2. How is it done today, and what are the limits?

- Reports on AI-generated code security often come from vendors and use a single
  snapshot of generated code, not repeated changes to one app.
- Static scanners (Semgrep, Gitleaks) find code patterns but **cannot find a
  missing login or ownership check**.
- Scanner reports include false alarms, and there is rarely a documented,
  checkable process for deciding which are real.

TODO (team): add 1 or 2 cited sources for the vendor-sourced figures.

## 3. What is new, and why should it work?

- A **chain design**: the same app is changed round after round, so we see when
  problems appear, not just whether they exist.
- An **access-control probe** (Playwright API tests) that finds missing login
  and ownership checks, which scanners miss. Two test users always share the
  same role, so a check that looks only at the role and not the owner is caught.
  Extra checks: security-headers snapshot, login rate limit, token dead after
  logout, no password hashes in responses, and upload checks.
- **Consistent generation**: all four apps start from the same kind of prompt,
  with the same agent and settings.
- A **pre-registered review protocol** with a second rater and agreement
  statistics, so the "is it real?" decisions are reliable and repeatable.
- A **safety check** on generated Compose files, so nothing dangerous is booted.

It should work because each check is reproducible and each judgement is
recorded and cross-checked.

## 4. Who cares?

Developers and teams who use AI coding agents, and security reviewers who must
decide how much to trust the output. TODO (team): confirm the intended audience.

## 5. If we succeed, what difference does it make?

Evidence on whether iterative AI changes add vulnerabilities, which kinds, and
how fast. It also gives a method others can reuse for auditing AI-assisted code.

## 6. What are the risks?

- Only one model, four apps and one tech stack, so results may not generalise.
- A single chain per condition is one draw; two runs can differ.
- The probe covers the baseline's routes, plus the upload checks against
  request A's new route once A has run. Other routes the agent adds are not
  covered, and upload checks are "not applicable" before A.
- Tests depend on wording, so some failures are broken tests, not regressions.
- Scanners have coverage gaps.
- Safety: generated apps could be harmful. Mitigation: own local apps only,
  localhost-only ports, Compose safety check, sandbox, manual review of every
  Compose file and Dockerfile.

## 7. How much will it cost?

No money cost is planned beyond model usage. TODO (team): fill in the model
access and token budget, and each person's weekly hours (see
`docs/CONTRIBUTIONS.md`).

## 8. How long will it take?

Final paper submitted **Wed 9 Dec**. Key gates: pilot on g1 (Wed 11 Nov), probe
specs frozen (Fri 20 Nov), labels complete (Fri 27 Nov), paper sections
(Fri 4 Dec).

## 9. What are the midterm and final exams (how do we check success)?

- **Midterm:** compose check passes the good sample and flags the bad one; probe
  runs on g1; review protocol committed before any label.
- **Final:** probe, including the extra checks, runs on all four baselines and
  fails on a deliberately broken copy (and passes on the original); every finding key has a final true/false label; second rating done with
  kappa and raw agreement reported; paper within 8 pages with every number
  traceable to `make` output.
