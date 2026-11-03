# Vibe Audit

Repository scaffold for the vibe-audit project.

## Repository layout

- `docs/` — project decisions, contributions, review protocol, and run metadata.
- `prompts/` — frozen prompts and their SHA-256 manifest.
- `apps/` — independently versioned application repositories; app directories are ignored here.
- `meta/` — provenance, routes, bugs, specifications, and test notes for each app.
- `agent/` — agent runner and stub agent.
- `tools/` — project checks, assessment, chain, and ingestion utilities.
- `rules/` — pinned Semgrep rules.
- `tests/` — Playwright specs.
- `results/` — raw run outputs and generated tables and figures.
- `analysis/` — analysis scripts and tests.
- `paper/` — ACM paper source.

Create app-specific directories under `prompts/`, `meta/`, and `tests/specs/` using
the app's identifier. Each corresponding application repository belongs under
`apps/` and is managed separately from this repository.

The workflow targets planned for the `Makefile` are `setup`, `generate`,
`assess`, `ingest`, `tables`, `figures`, `all`, and `demo`. Their implementations
will be added as the project tools are developed.
