# Run information

Record tool versions, model identifier, and run dates here.

## Scanners (pinned 2026-11-17, Wuth)

All three scanners run in Docker images pinned by tag **and** digest, so the batch
host needs only Docker. Native Semgrep and Gitleaks binaries are blocked by Windows
Application Control on the development machine, which is a second reason for
running them in containers. The images are set in `tools/scan.py`.

| Tool | Image | Digest | Version |
|---|---|---|---|
| Semgrep | `semgrep/semgrep:1.184.0` | `sha256:cc1b68266f267878b39739373ea9985b9a78e5d64497dd875c8de100b22695ed` | 1.184.0 |
| Gitleaks | `ghcr.io/gitleaks/gitleaks:v8.30.1` | `sha256:c00b6bd0aeb3071cbcb79009cb16a60dd9e0a7c60e2be9ab65d25e6bc8abbb7f` | v8.30.1 (`dir` command scans a plain folder) |
| npm audit | `node:20.20.2-alpine` | `sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293` | Node v20.20.2, npm 10.8.2 |

**Semgrep rules.** Vendored in `rules/` from https://github.com/semgrep/semgrep-rules
at commit `a5ad1714f00c9f7fde980cab0ea1d6dc6d414fd2` (2026-11-10): the `javascript`,
`typescript`, `generic`, `yaml` and `dockerfile` folders, 593 rule files (one Slack
webhook rule left out because GitHub push protection blocks its example URL; see
`rules/README.md`). Run with
`--metrics=off`, no network (`--network none`). Checked on 2026-11-17: a file with
`res.send(eval(req.query.code))` fires `javascript.lang.security.audit.code-string-concat`
(ERROR) and `javascript.browser.security.eval-detected` (WARNING).

**Semgrep default ignores.** Semgrep's built-in ignore list applies (it skips
`node_modules/`, and test folders such as `test/` and `tests/`). Recorded as a
known scope limit: app test code is not scanned.

**npm audit.** Run on a copy of each folder's `package.json` (and lockfile, if
present). When no npm lockfile exists, one is generated with
`npm install --package-lock-only --ignore-scripts`. `scan.log` records `lock=own`
or `lock=generated`. npm audit needs network access to the registry, and its results
change as advisories are published, so the official batch runs in one window.

## Host

- Development machine: Windows 11 Pro, Docker 29.6.2 (Docker Desktop), Python via `uv`.
- Figures: `matplotlib==3.11.2` (`analysis/requirements.txt`). Tables need only the
  standard library.

## Runs

| Run | Start | End | Notes |
|---|---|---|---|
| Dev baseline scans (results/dev/) | 2026-11-17 | 2026-11-17 | Scans only, 4 app folders as they are in `apps/` (no `baseline` tags yet) |
| Official batch | — | — | Planned Sat 21 – Mon 23 Nov |

## Model

- Agent model: `gpt-5.4-mini` (served as `gpt-5.4-mini-2026-03-17`) on Azure AI Foundry,
  deployment `gpt-5.4-mini`, GlobalStandard, resource `comp3226-vibe-audit-ai`
  (Germany West Central). Changed from the plan's `gemini-3.8-flash`, see
  `docs/DECISIONS.md`, 2026-11-27.
- SDK: `openai==3.60.0` against the OpenAI-compatible v1 API (`agent/requirements.txt`).
- Settings: deployment defaults for temperature and reasoning effort, seed 3226, step cap 30
  (provisional, see `docs/DECISIONS.md`, 2026-11-27).
- Sandbox image for the agent's shell tool: `node:20.20.2-alpine`.
