#!/usr/bin/env bash
# tools/boot_and_test.sh  (M2)
# Boot one checkpoint, health-check it, run the Playwright specs, ALWAYS tear down.
#
# Usage: tools/boot_and_test.sh <app> <chain> <round> <workdir>
#   <workdir>  a throw-away clone of the app repo at the right tag (never the original)
#
# Environment (all optional):
#   LINT_CMD        executable for M4's compose safety check, called as: "$LINT_CMD" <compose file>
#                   non-zero exit = blocked. If unset the script REFUSES to boot (ALLOW_NO_LINT=1 = dev only).
#   RAW_ROOT        results root (default: <repo>/results/raw)
#   BUILD_TIMEOUT   seconds allowed for the build (default 600)
#   HEALTH_TIMEOUT  seconds allowed for the health check (default 120)
#
# Writes to $RAW_ROOT/<app>/<chain>/r<round>/ :
#   stage  boot_status  port_used  notes  commit  timings.log
#   lint.log  build.log  boot.log  compose-ps.json  teardown.log
#   playwright.json  playwright.exit  playwright.stdout.log  playwright.stderr.log
#
# Deliberately NOT "set -e": a failed step must never skip teardown.
set -u

if [ $# -ne 4 ]; then
  echo "usage: $0 <app> <chain> <round> <workdir>" >&2
  exit 2
fi
APP="$1"; CHAIN="$2"; ROUND="$3"; WORK="$4"

for tool in docker jq curl npx; do
  command -v "$tool" >/dev/null 2>&1 || { echo "missing tool: $tool" >&2; exit 2; }
done
[ -d "$WORK" ] || { echo "workdir not found: $WORK" >&2; exit 2; }
docker info >/dev/null 2>&1 || { echo "docker daemon not reachable" >&2; exit 2; }

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RAW_ROOT="${RAW_ROOT:-$REPO_ROOT/results/raw}"
OUT="$RAW_ROOT/$APP/$CHAIN/r$ROUND"
CHAIN_LC="$(printf '%s' "$CHAIN" | tr '[:upper:]' '[:lower:]')"
PROJECT="vc-${APP}-${CHAIN_LC}-r${ROUND}"
BUILD_TIMEOUT="${BUILD_TIMEOUT:-600}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-120}"
EXPECTED_PORT="$(tr -d '[:space:]' < "$REPO_ROOT/meta/$APP/PORT" 2>/dev/null || true)"

mkdir -p "$OUT" || exit 2

# Resumable: a finished checkpoint is skipped.
if [ "$(cat "$OUT/stage" 2>/dev/null || true)" = "done" ]; then
  echo "[$PROJECT] already done, skipping"
  exit 0
fi
: > "$OUT/notes"
: > "$OUT/timings.log"

stage()  { printf '%s\n' "$1" > "$OUT/stage"; printf '%s %s (t=%ss)\n' "$(date -u +%FT%TZ)" "$1" "$SECONDS" >> "$OUT/timings.log"; }
note()   { printf '%s\n' "$1" >> "$OUT/notes"; }
finish() { printf '%s\n' "$1" > "$OUT/boot_status"; }
save_logs() { ( cd "$WORK" && docker compose -p "$PROJECT" logs --no-color --tail=300 ) > "$OUT/boot.log" 2>&1; }

COMPLETE=0      # becomes 1 only when the checkpoint reached a real outcome
TORN_DOWN=0
end_checkpoint() { COMPLETE=1; exit 0; }

# shellcheck disable=SC2329  # invoked indirectly by the EXIT trap below
teardown() {
  [ "$TORN_DOWN" = 1 ] && return
  TORN_DOWN=1
  stage teardown
  ( cd "$WORK" && docker compose -p "$PROJECT" down -v --remove-orphans ) > "$OUT/teardown.log" 2>&1
  local left_c left_v
  left_c="$(docker ps -a -q --filter "label=com.docker.compose.project=$PROJECT" 2>/dev/null | wc -l | tr -d ' ')"
  left_v="$(docker volume ls -q --filter "label=com.docker.compose.project=$PROJECT" 2>/dev/null | wc -l | tr -d ' ')"
  if [ "$left_c" != "0" ] || [ "$left_v" != "0" ]; then
    note "LEFTOVER after teardown: containers=$left_c volumes=$left_v"
    echo "[$PROJECT] WARNING: leftovers (containers=$left_c volumes=$left_v)" >&2
  fi
  # Only a real outcome counts as done; an abort or Ctrl-C must be re-run.
  if [ "$COMPLETE" = 1 ]; then stage "done"; else stage "aborted"; fi
}
trap teardown EXIT
trap 'exit 130' INT TERM

git -C "$WORK" rev-parse HEAD > "$OUT/commit" 2>/dev/null || note "no commit hash (workdir is not a git clone?)"

# --- find the compose file -------------------------------------------------
COMPOSE_FILE=""
for f in docker-compose.yml docker-compose.yaml compose.yml compose.yaml; do
  if [ -f "$WORK/$f" ]; then COMPOSE_FILE="$WORK/$f"; break; fi
done
if [ -z "$COMPOSE_FILE" ]; then
  finish fail; note "cause_hint: port or config (no compose file)"; end_checkpoint
fi

# --- lint (M4's compose safety check) --------------------------------------
stage lint
if [ -n "${LINT_CMD:-}" ]; then
  if ! "$LINT_CMD" "$COMPOSE_FILE" > "$OUT/lint.log" 2>&1; then
    finish lint_blocked; note "compose lint flagged the file (see lint.log)"; end_checkpoint
  fi
elif [ "${ALLOW_NO_LINT:-0}" = 1 ]; then
  note "WARNING: lint skipped (ALLOW_NO_LINT=1, dev only)"
else
  echo "LINT_CMD is not set: refusing to boot an unchecked compose file (ALLOW_NO_LINT=1 for dev)." >&2
  note "refused: no lint command"
  exit 2   # COMPLETE stays 0, so the checkpoint is not marked done
fi

# --- build and start -------------------------------------------------------
stage build
( cd "$WORK" && timeout "$BUILD_TIMEOUT" docker compose -p "$PROJECT" up -d --build ) > "$OUT/build.log" 2>&1
rc=$?
if [ $rc -ne 0 ]; then
  finish fail
  if [ $rc -eq 124 ]; then note "cause_hint: timeout (build over ${BUILD_TIMEOUT}s)"; else note "cause_hint: build error (exit $rc)"; fi
  save_logs; end_checkpoint
fi

# --- which port did the app really publish? --------------------------------
stage port
( cd "$WORK" && docker compose -p "$PROJECT" ps -a --format json ) > "$OUT/compose-ps.json" 2>/dev/null
# Newer Compose prints one JSON object per line, older prints one array: handle both.
PORTS="$(jq -rs '[ .[] | if type=="array" then .[] else . end | (.Publishers // [])[] | select((.PublishedPort // 0) > 0) | .PublishedPort ] | unique | .[]' "$OUT/compose-ps.json" 2>/dev/null)"
PORT=""
if [ -n "$EXPECTED_PORT" ] && printf '%s\n' "$PORTS" | grep -qx "$EXPECTED_PORT"; then
  PORT="$EXPECTED_PORT"
elif [ -n "$PORTS" ]; then
  PORT="$(printf '%s\n' "$PORTS" | head -n 1)"
  note "port_changed: expected ${EXPECTED_PORT:-none}, published: $(printf '%s' "$PORTS" | tr '\n' ' ')"
else
  PORT="$EXPECTED_PORT"
  note "no published port found; using meta PORT file"
fi
if [ -z "$PORT" ]; then
  finish fail; note "cause_hint: port or config (no port known)"; save_logs; end_checkpoint
fi
printf '%s\n' "$PORT" > "$OUT/port_used"

# --- health check: homepage returns HTTP 200 within HEALTH_TIMEOUT ---------
# No -L on purpose: a redirect is NOT a 200. Change only with the whole team (DECISIONS.md).
stage health
URL="http://127.0.0.1:${PORT}/"
deadline=$((SECONDS + HEALTH_TIMEOUT))
code="000"
while [ "$SECONDS" -lt "$deadline" ]; do
  code="$(curl -s -o /dev/null -m 5 -w '%{http_code}' "$URL" 2>/dev/null)"
  [ "$code" = "200" ] && break
  sleep 2
done
if [ "$code" != "200" ]; then
  finish fail
  ( cd "$WORK" && docker compose -p "$PROJECT" ps -a --format json ) > "$OUT/compose-ps-after.json" 2>/dev/null
  if grep -qi '"State":"exited"' "$OUT/compose-ps-after.json" 2>/dev/null; then
    note "cause_hint: runtime crash (a container exited; last HTTP code $code)"
  else
    note "cause_hint: timeout (no HTTP 200 within ${HEALTH_TIMEOUT}s; last code $code)"
  fi
  save_logs; end_checkpoint
fi
finish ok

# --- feature + probe specs -------------------------------------------------
stage tests
run_playwright() {
  rm -f "$OUT/playwright.json"
  ( cd "$REPO_ROOT/tests" \
    && BASE_URL="http://127.0.0.1:${PORT}" PLAYWRIGHT_JSON_OUTPUT_NAME="$OUT/playwright.json" \
       npx playwright test "specs/$APP" --reporter=json ) \
    > "$OUT/playwright.stdout.log" 2> "$OUT/playwright.stderr.log"
  echo $? > "$OUT/playwright.exit"
}
run_playwright   # exit 0 = all passed, 1 = some failed: both are RESULTS, not errors
if [ ! -s "$OUT/playwright.json" ]; then
  note "playwright wrote no report; retrying once"
  run_playwright
fi
if [ ! -s "$OUT/playwright.json" ]; then
  note "tests_status: not_run (playwright crashed twice)"
fi

end_checkpoint