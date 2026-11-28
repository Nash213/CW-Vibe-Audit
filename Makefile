# Vibe Audit workflow. Target names and meanings are fixed (plan Wuth-1, step 2).
# Targets whose scripts do not exist yet say so and fail, rather than doing nothing.

PY      ?= uv run --no-project python
PYPLOT  ?= uv run --no-project --with-requirements analysis/requirements.txt python
PYSHEET ?= uv run --no-project --with-requirements tools/requirements.txt python
PYTEST  ?= uv run --no-project --with pytest --with-requirements analysis/requirements.txt --with-requirements tools/requirements.txt python -m pytest -p no:cacheprovider
RAW     ?= results/raw
OUT     ?= results

.PHONY: setup test generate assess ingest sheets labels tables figures all demo

## setup: pull the pinned scanner images (versions in docs/RUNINFO.md)
setup:
	docker pull semgrep/semgrep:1.184.0
	docker pull ghcr.io/gitleaks/gitleaks:v8.30.1
	docker pull node:20.20.2-alpine
	cd tests && npm ci

## test: unit tests for keys, measures, parser, ingest and the transition lister
test:
	$(PYTEST) -q tools/tests analysis/tests

## generate: one chain through the agent: make generate APP=g1 CHAIN=DCBA [AGENT=stub] [SUFFIX=-rep]
## (resumable: re-run the same command after a crash; see tools/run_chain.py)
AGENT   ?= real
SUFFIX  ?=
AGENTPY ?= uv run --no-project --with-requirements agent/requirements.txt python
generate:
	@test -n "$(APP)" -a -n "$(CHAIN)" || { echo "usage: make generate APP=g1 CHAIN=DCBA [AGENT=stub] [SUFFIX=-rep]" >&2; exit 1; }
	$(AGENTPY) tools/run_chain.py $(APP) $(CHAIN) --agent $(AGENT) $(if $(SUFFIX),--suffix=$(SUFFIX))

## assess: official assessment batch over every checkpoint (Wuth)
## (every round tag of g1-g4 plus r0 per chain; resumable; on WSL: make assess PY=python3)
## one checkpoint: $(PY) tools/assess.py <app> <chain> <round>
assess:
	$(PY) tools/assess_batch.py --raw $(RAW) $(if $(APPS),--apps $(APPS)) $(if $(CHAINS),--chains $(CHAINS))

## ingest: raw results -> checkpoints.csv, findings.csv, tests.csv, then triage.csv
ingest:
	$(PY) tools/ingest.py --raw $(RAW) --out $(OUT)
	$(PY) tools/transitions.py --results $(OUT)

## sheets: blank labelling sheets into results/sheets/ (tools/make_label_sheets.py)
sheets:
	$(PYSHEET) tools/make_label_sheets.py findings --findings $(OUT)/findings.csv --raw $(RAW) --out $(OUT)/sheets/findings.xlsx
	$(PYSHEET) tools/make_label_sheets.py transitions --triage $(OUT)/triage.csv --out $(OUT)/sheets/transitions.xlsx

## labels: completed sheets -> results/labels.csv (tools/import_labels.py)
## second-rater sheets: make labels FSECOND=<sheet>.xlsx TSECOND=<sheet>.xlsx
## settled disagreements and resolved unsures go in results/resolutions.csv
labels:
	$(PYSHEET) tools/import_labels.py --findings $(OUT)/sheets/findings.xlsx --transitions $(OUT)/sheets/transitions.xlsx $(if $(FSECOND),--findings-second $(FSECOND)) $(if $(TSECOND),--transitions-second $(TSECOND)) --resolutions $(OUT)/resolutions.csv --out $(OUT)/labels.csv

## tables: R1 to R3 from the CSVs into results/tables/ (analysis/tables.py, Wuth-6)
## R4/R5 come from Nazrul's scripts (not in the repo yet)
tables:
	$(PY) analysis/tables.py --results $(OUT) --out $(OUT)/tables

## figures: F1 to F3 as PDF and PNG into results/figures/ (analysis/figures.py, Wuth-6)
figures:
	$(PYPLOT) analysis/figures.py --results $(OUT) --out $(OUT)/figures

## all: ingest + tables + figures from existing raw results and labels
all: ingest tables figures

## demo: short end-to-end demo (Wuth-7)
demo:
	@echo "demo: not written yet (Wuth-7)" >&2; exit 1
