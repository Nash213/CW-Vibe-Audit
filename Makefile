# Vibe Audit workflow. Target names and meanings are fixed (plan Wuth-1, step 2).
# Targets whose scripts do not exist yet say so and fail, rather than doing nothing.

PY      ?= uv run --no-project python
PYTEST  ?= uv run --no-project --with pytest python -m pytest -p no:cacheprovider
RAW     ?= results/raw
OUT     ?= results

.PHONY: setup test generate assess ingest tables figures all demo

## setup: pull the pinned scanner images (versions in docs/RUNINFO.md)
setup:
	docker pull semgrep/semgrep:1.184.0
	docker pull ghcr.io/gitleaks/gitleaks:v8.30.1
	docker pull node:20.20.2-alpine
	cd tests && npm ci

## test: unit tests for keys, measures, parser, ingest and the transition lister
test:
	$(PYTEST) -q tools/tests analysis/tests

## generate: run the agent chains (Jarred, agent/)
generate:
	@echo "generate: agent runner and chain driver not in the repo yet (agent/)" >&2; exit 1

## assess: official assessment batch over every checkpoint (Wuth)
assess:
	@echo "assess: batch driver not written yet; one checkpoint: $(PY) tools/assess.py <app> <chain> <round>" >&2; exit 1

## ingest: raw results -> checkpoints.csv, findings.csv, tests.csv, then triage.csv
ingest:
	$(PY) tools/ingest.py --raw $(RAW) --out $(OUT)
	$(PY) tools/transitions.py --results $(OUT)

## tables: R1 to R5 (analysis/tables.py, Wuth-6; R4/R5 from Nazrul's scripts)
tables:
	@echo "tables: analysis/tables.py not written yet (Wuth-6, from Mon 23 Nov)" >&2; exit 1

## figures: F1 to F3 (analysis/figures.py, Wuth-6)
figures:
	@echo "figures: analysis/figures.py not written yet (Wuth-6, from Mon 23 Nov)" >&2; exit 1

## all: ingest + tables + figures from existing raw results and labels
all: ingest tables figures

## demo: short end-to-end demo (Wuth-7)
demo:
	@echo "demo: not written yet (Wuth-7)" >&2; exit 1
