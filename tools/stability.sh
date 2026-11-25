#!/usr/bin/env bash
# tools/stability.sh  (M2, Faris-4)
# Boot + test one app's baseline N times and check the rule:
#   T01..T09 pass in EVERY run, TA and TB fail in EVERY run, and none are missing.
# Also saves run 1's Playwright report as the parser fixture for M3.
#
# Usage: tools/stability.sh <app-id> <app-folder> [runs]
#   e.g. tools/stability.sh g1 apps/task-manager-corpus 3
# Dev only: set ALLOW_NO_LINT=1 until M4's compose check (LINT_CMD) exists.
set -u

if [ $# -lt 2 ]; then
  echo "usage: $0 <app-id> <app-folder> [runs]" >&2
  exit 2
fi
APP="$1"; SRC="$2"; RUNS="${3:-3}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$(cd "$SRC" && pwd)" || { echo "app folder not found" >&2; exit 2; }
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

# Raw output goes to tests/stability/ (git-ignored); the summary goes to results/stability/ (committed).
export RAW_ROOT="$REPO_ROOT/tests/stability/$STAMP"
SUMMARY_DIR="$REPO_ROOT/results/stability"
SUMMARY="$SUMMARY_DIR/${APP}-${STAMP}.txt"
mkdir -p "$SUMMARY_DIR" "$REPO_ROOT/work" "$REPO_ROOT/tests/fixtures"

for i in $(seq 1 "$RUNS"); do
  WORK="$REPO_ROOT/work/stability-${APP}-${i}"
  rm -rf "$WORK" && mkdir -p "$WORK"
  # Fresh copy every run, never the original; skip node_modules and any .git.
  ( cd "$SRC" && tar --exclude=node_modules --exclude=.git -cf - . ) | ( cd "$WORK" && tar -xf - )
  echo "=== run $i of $RUNS ==="
  bash "$REPO_ROOT/tools/boot_and_test.sh" "$APP" stability "$i" "$WORK"
  rm -rf "$WORK"
done

# One line per test: "<title>\t<status>", status = pass | fail | flaky | skipped.
statuses() {
  jq -r '
    [ .suites[] | recurse(.suites[]?) | .specs[]? ]
    | .[] | [ .title,
              ( .tests[0].status
                | if . == "expected" then "pass"
                  elif . == "unexpected" then "fail"
                  else . end ) ]
    | @tsv' "$1"
}

{
  echo "app=$APP runs=$RUNS stamp=$STAMP source=$SRC"
  for i in $(seq 1 "$RUNS"); do
    dir="$RAW_ROOT/$APP/stability/r$i"
    echo "--- run $i: boot=$(cat "$dir/boot_status" 2>/dev/null || echo missing)"
    if [ -s "$dir/playwright.json" ]; then statuses "$dir/playwright.json"; else echo "(no playwright report)"; fi
  done
} | tee "$SUMMARY"

# Check the rule across all runs. Every expected test must be PRESENT, not just "not failing".
if [ -z "${EXPECTED_IDS:-}" ]; then
  case "$APP" in
    g3) EXPECTED_IDS="T01 T02 T03 T04 T05 T06 T07 T08 T09 T11 T12 T13 T14 TA TB" ;; # crud:false, T10/T15 do not apply
    *)  EXPECTED_IDS="T01 T02 T03 T04 T05 T06 T07 T08 T09 T10 T11 T12 T13 T14 T15 TA TB" ;;
  esac
fi
PROBLEMS=0
for i in $(seq 1 "$RUNS"); do
  report="$RAW_ROOT/$APP/stability/r$i/playwright.json"
  if [ ! -s "$report" ]; then echo "PROBLEM: run $i has no report"; PROBLEMS=$((PROBLEMS + 1)); continue; fi

  # Playwright-level errors (no tests found, syntax error in a spec, ...).
  errs="$(jq -r '.errors[]?.message | split("\n")[0]' "$report")"
  if [ -n "$errs" ]; then
    printf 'PROBLEM: run %s playwright error: %s\n' "$i" "$errs"; PROBLEMS=$((PROBLEMS + 1))
  fi

  results="$(statuses "$report")"
  for id in $EXPECTED_IDS; do
    status="$(printf '%s\n' "$results" | awk -F'\t' -v id="$id" '{ split($1, w, " ") } w[1] == id { print $2; exit }')"
    if [ -z "$status" ]; then
      echo "PROBLEM: run $i $id is missing from the report"; PROBLEMS=$((PROBLEMS + 1)); continue
    fi
    case "$id" in
      T0[1-9]|T1[0-5]) [ "$status" = "pass" ] || { echo "PROBLEM: run $i $id is $status (must pass every run)"; PROBLEMS=$((PROBLEMS + 1)); } ;;
      TA|TB)           [ "$status" = "fail" ] || { echo "PROBLEM: run $i $id is $status (must fail on baseline)"; PROBLEMS=$((PROBLEMS + 1)); } ;;
    esac
  done
done | tee -a "$SUMMARY"

# The loop above ran in a pipe (because of tee), so recount the problems from the summary.
PROBLEMS="$(grep -c '^PROBLEM:' "$SUMMARY")"
if [ "$PROBLEMS" -eq 0 ]; then echo "RESULT: OK, rule holds in all $RUNS runs" | tee -a "$SUMMARY"
else echo "RESULT: $PROBLEMS problem(s), see above" | tee -a "$SUMMARY"; fi

# Real report from run 1 = the parser fixture M3 asked for.
if [ -s "$RAW_ROOT/$APP/stability/r1/playwright.json" ]; then
  cp "$RAW_ROOT/$APP/stability/r1/playwright.json" "$REPO_ROOT/tests/fixtures/${APP}-baseline.json"
  echo "fixture: tests/fixtures/${APP}-baseline.json"
fi
[ "$PROBLEMS" -eq 0 ]