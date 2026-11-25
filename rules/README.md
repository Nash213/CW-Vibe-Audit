# Vendored Semgrep rules (third-party, not written by this project)

Everything in this folder except this README is copied unchanged from the
open-source **semgrep-rules** repository:

- Source: https://github.com/semgrep/semgrep-rules
- Commit: `a5ad1714f00c9f7fde980cab0ea1d6dc6d414fd2` (2026-11-10)
- Copied on: 2026-11-17
- Licence: Semgrep Rules License v1.0 (see `LICENSE`, https://semgrep.dev/legal/rules-license)

**Why it is here.** The plan (Wuth-1, step 4) requires a pinned copy of the rules so
scan results stay reproducible; the online registry changes over time.

**What was copied.** The rule files (YAML files containing `rules:`) from the
`javascript`, `typescript`, `generic`, `yaml` and `dockerfile` folders: 593 files.
Test targets (`*.test.*`, `*.fixed.*`) and non-rule files were left out.

**One rule left out on purpose.** `generic/secrets/security/detected-slack-webhook.yaml`
contains an example Slack webhook URL, and GitHub push protection rejects it as a
secret. It was removed (2026-11-17) rather than bypassing push protection. Slack
webhooks are still covered by Gitleaks' default `slack-webhook-url` rule.

**How it is used.** `tools/scan.py` runs Semgrep (`semgrep/semgrep:1.184.0`, pinned
by digest) with `--config rules/ --metrics=off`. Do not edit these files; to update,
re-copy at a new pinned commit and record it in `docs/RUNINFO.md` and
`docs/DECISIONS.md`.
