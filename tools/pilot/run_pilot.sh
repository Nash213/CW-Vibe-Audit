#!/usr/bin/env bash
# tools/pilot/run_pilot.sh  (pilot app g0 only: meta/g0/README.md)
# Dry-runs the whole pipeline on g0 before the official batch on g1-g4.
# Everything it writes goes to results/pilot/ (git-ignored), never results/raw/.
#
# Usage (from anywhere):
#   run_pilot.sh init                      git-init apps/g0 as built, tag baseline-unseeded
#   run_pilot.sh discover                  print routes, auth, admin seed, labels to fill apps.ts
#   run_pilot.sh seed                      commit the seeded bug B, tag baseline
#   run_pilot.sh stability [runs]          tools/stability.sh on tag baseline (default 3 runs)
#   run_pilot.sh probe                     boot baseline once, print every T/AC result (reference for mutants)
#   run_pilot.sh copy <name>               fresh copy of tag baseline in work/pilot-mutants/<name>
#   run_pilot.sh mutant <name> <dir> <ids...>   boot a broken copy; listed ids must fail, the rest match probe
#   run_pilot.sh compare <report> <name> <ids...>  judge an existing report (REF= overrides the reference)
#   run_pilot.sh scan <name> <dir>         scanners only, into results/pilot/scans/<name>
#   run_pilot.sh assess <chain> <round>    tools/assess.py on tag (baseline | <chain>-r<k>)
#   run_pilot.sh start-chain <chain>       branch chain/<chain> from baseline in apps/g0
#   run_pilot.sh tag <chain> <round>       commit the agent's changes, tag <chain>-r<round>
#   run_pilot.sh ingest                    ingest + transitions over results/pilot/raw
#
# Env: PY (default "uv run --no-project python"), LINT_CMD (default tools/compose_check.py),
#      G0_ADMIN_EMAIL / G0_ADMIN_PASSWORD for AC4 (never commit them).
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
APPDIR="$ROOT/apps/g0"
PILOT="$ROOT/results/pilot"
CHECKS="$PILOT/checks"
PY="${PY:-uv run --no-project python}"
export LINT_CMD="${LINT_CMD:-$ROOT/tools/compose_check.py}"
export G0_ADMIN_EMAIL="${G0_ADMIN_EMAIL:-}" G0_ADMIN_PASSWORD="${G0_ADMIN_PASSWORD:-}"

die() { echo "run_pilot: $*" >&2; exit 2; }
# apps/g0 must be its OWN repo: without its .git, git would silently use this study repo.
is_own_repo() { [ -d "$APPDIR/.git" ] && [ "$(git -C "$APPDIR" rev-parse --show-toplevel 2>/dev/null)" = "$(cd "$APPDIR" && pwd -P)" ]; }
need_repo() { is_own_repo || die "apps/g0 is not its own git repo yet: run 'init' first"; }
need_tag() { git -C "$APPDIR" rev-parse -q --verify "refs/tags/$1" >/dev/null || die "apps/g0 has no tag '$1'"; }

# Fresh copy of a tag (no .git, no node_modules) into $2.
export_tag() {
  rm -rf "$2" && mkdir -p "$2"
  git -C "$APPDIR" archive "$1" | tar -x -C "$2"
}

# "<title>\t<status>" per test; status = pass | fail | flaky | skipped (not_run).
statuses() {
  jq -r '[ .suites[] | recurse(.suites[]?) | .specs[]? ] | .[]
         | [ .title, ( .tests[0].status | if . == "expected" then "pass" elif . == "unexpected" then "fail" else . end ) ]
         | @tsv' "$1"
}

not_run_reasons() {
  jq -r '[ .suites[] | recurse(.suites[]?) | .specs[]? ] | .[]
         | . as $s | .tests[0].annotations[]? | select(.type == "not_run") | "\($s.title)\t\(.description)"' "$1"
}

# Boot one folder with the real harness and print the path of its Playwright report.
run_checkpoint() {
  local label="$1" dir="$2" stamp out
  stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  RAW_ROOT="$CHECKS" bash "$ROOT/tools/boot_and_test.sh" g0 "$label-$stamp" 0 "$dir" >&2
  out="$CHECKS/g0/$label-$stamp/r0"
  echo "boot=$(cat "$out/boot_status" 2>/dev/null || echo missing) notes: $(tr '\n' ' ' < "$out/notes" 2>/dev/null)" >&2
  [ -s "$out/playwright.json" ] || die "no Playwright report in $out (see build.log / boot.log there)"
  echo "$out/playwright.json"
}

cmd="${1:-}"; shift || true
case "$cmd" in

init)
  [ -d "$APPDIR" ] || die "put the generated app in apps/g0 first (meta/g0/README.md step 1)"
  [ -f "$APPDIR/docker-compose.yml" ] || [ -f "$APPDIR/compose.yml" ] || echo "WARNING: no compose file in apps/g0 (boot will fail: record it, like g2)"
  [ -d "$APPDIR/.git" ] || git -C "$APPDIR" init -q
  is_own_repo || die "git init in apps/g0 failed"
  # Keep dependencies and local data out of the app's history without editing app files.
  printf 'node_modules/\n.env\n' >> "$APPDIR/.git/info/exclude"
  git -C "$APPDIR" add -A
  git -C "$APPDIR" -c user.name=pilot -c user.email=pilot@example.test commit -qm "g0 as built (prompts/g0/BUILD.md)" || true
  git -C "$APPDIR" tag -f baseline-unseeded >/dev/null
  echo "apps/g0 tagged baseline-unseeded at $(git -C "$APPDIR" rev-parse --short HEAD)"
  ;;

discover)
  [ -d "$APPDIR" ] || die "apps/g0 not found"
  src() { grep -rnE "$1" "$APPDIR" --include='*.js' --include='*.ts' --include='*.mjs' --include='*.cjs' \
          --include='*.jsx' --include='*.tsx' --include='*.html' --include='*.yml' --include='*.yaml' --include='*.env*' \
          --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist 2>/dev/null | sed "s|$APPDIR/||" | head -n "${2:-60}"; }
  echo "== compose ports (lint blocks 0.0.0.0; bind 127.0.0.1:$(cat "$ROOT/meta/g0/PORT"):<container port>)"; src 'ports:|- *"?[0-9.:]+:[0-9]+' 20
  echo; echo "== API routes -> apps.ts api.*, ac.spec.ts ME / ADMIN_USERS / UPDATE"; src "\.(get|post|put|patch|delete)\(['\"\`]/" 80
  echo; echo "== routers mounted"; src "app\.use\(['\"\`]/api" 20
  echo; echo "== auth style -> authStyle / tokenField"; src 'jsonwebtoken|jwt\.sign|express-session|cookie-session|res\.cookie\(|Authorization|Bearer' 30
  echo; echo "== first admin -> G0_ADMIN_EMAIL / G0_ADMIN_PASSWORD"; src "ADMIN_|role *[:=] *['\"]admin|isAdmin|seed" 30
  echo; echo "== list order -> meta/g0/BUG.md"; src 'ORDER BY|orderBy|\.sort\(' 20
  echo; echo "== category filter param -> ac.spec.ts FILTER"; src "category" 20
  echo; echo "== labels, placeholders, buttons -> apps.ts ui.*"; src '<label|placeholder=|<button|aria-label=' 80
  ;;

seed)
  need_repo
  git -C "$APPDIR" diff --quiet && die "no change in apps/g0: seed the bug as in meta/g0/BUG.md first"
  echo "diff to be committed as the seeded bug:"; git -C "$APPDIR" --no-pager diff --stat
  git -C "$APPDIR" add -A
  git -C "$APPDIR" -c user.name=pilot -c user.email=pilot@example.test commit -qm "seed bug B (meta/g0/BUG.md)"
  git -C "$APPDIR" tag -f baseline >/dev/null
  echo "tagged baseline at $(git -C "$APPDIR" rev-parse --short HEAD)"
  ;;

stability)
  need_repo; need_tag baseline
  dir="$ROOT/work/pilot-baseline"; export_tag baseline "$dir"
  bash "$ROOT/tools/stability.sh" g0 "$dir" "${1:-3}"; rc=$?
  rm -rf "$dir"; exit $rc
  ;;

probe)
  need_repo; need_tag baseline
  dir="$ROOT/work/pilot-probe"; export_tag baseline "$dir"
  report="$(run_checkpoint probe "$dir")"; rm -rf "$dir"
  mkdir -p "$PILOT"; cp "$report" "$PILOT/probe-baseline.json"
  echo "== results on seeded baseline (reference for mutants: $PILOT/probe-baseline.json)"
  statuses "$report"
  echo "== not_run (skipped) and why"; not_run_reasons "$report"
  echo "Expected: T01-T15 pass, TA/TB fail, every AC pass. Fix not_run ones (FILL values, admin env) before mutants."
  ;;

copy)
  [ $# -eq 1 ] || die "usage: copy <name>"
  need_repo; need_tag baseline
  export_tag baseline "$ROOT/work/pilot-mutants/$1"
  echo "work/pilot-mutants/$1 = clean copy of baseline. Make ONE change (meta/g0/MUTANTS.md), then run 'mutant'."
  ;;

mutant)
  [ $# -ge 3 ] || die "usage: mutant <name> <dir> <must-fail ids...>"
  name="$1"; dir="$(cd "$2" && pwd)" || die "no folder $2"; shift 2
  [ -s "$PILOT/probe-baseline.json" ] || die "run 'probe' first (reference results)"
  report="$(run_checkpoint "mut-$name" "$dir")"
  exec bash "$0" compare "$report" "$name" "$@"
  ;;

compare)
  # compare <report> <name> <must-fail ids...>: judge a broken copy's report against probe-baseline.json
  [ $# -ge 3 ] || die "usage: compare <report> <name> <must-fail ids...>"
  report="$1"; name="$2"; shift 2
  ref="${REF:-$PILOT/probe-baseline.json}"; [ -s "$ref" ] || die "no reference report $ref (run 'probe')"
  base="$(statuses "$ref")"; now="$(statuses "$report")"
  matches() { # $1 = test title, $2 = id; an id ending in "-" is a prefix
    local first="${1%% *}"
    if [ "${2%-}" != "$2" ]; then case "$first" in "$2"*) return 0;; esac; return 1; fi
    [ "$first" = "$2" ]
  }
  problems=0
  for id in "$@"; do
    hit=0
    while IFS=$'\t' read -r title st; do matches "$title" "$id" && [ "$st" = fail ] && hit=1; done <<< "$now"
    if [ $hit = 1 ]; then echo "caught  $id"; else echo "PROBLEM: $id did not fail on the broken copy (checker is blind)"; problems=$((problems+1)); fi
  done
  # Everything not listed must keep its baseline result (flaky counts as pass).
  while IFS=$'\t' read -r title st; do
    listed=0; for id in "$@"; do matches "$title" "$id" && listed=1; done
    [ $listed = 1 ] && continue
    b="$(printf '%s\n' "$base" | awk -F'\t' -v t="$title" '$1==t {print $2; exit}')"
    [ "$b" = flaky ] && b=pass; [ "$st" = flaky ] && st=pass
    [ "$b" = "$st" ] || { echo "PROBLEM: ${title%% *} changed ${b:-missing} -> $st (should be unaffected)"; problems=$((problems+1)); }
  done <<< "$now"
  echo "== not_run on this copy"; not_run_reasons "$report"
  if [ $problems -eq 0 ]; then echo "MUTANT OK: $name"; else echo "MUTANT FAILED: $name ($problems problem(s))"; fi
  [ $problems -eq 0 ]
  ;;

scan)
  [ $# -eq 2 ] || die "usage: scan <name> <dir>"
  out="$PILOT/scans/$1"; mkdir -p "$out"
  $PY "$ROOT/tools/scan.py" "$2" "$out" && echo "scan output: $out" && cat "$out/scan.log"
  ;;

assess)
  [ $# -eq 2 ] || die "usage: assess <chain> <round>"
  need_repo
  $PY "$ROOT/tools/assess.py" g0 "$1" "$2" --raw "$PILOT/raw"
  out="$PILOT/raw/g0/$1/r$2"
  echo "stage=$(cat "$out/stage" 2>/dev/null) boot=$(cat "$out/boot_status" 2>/dev/null) files: $(ls "$out" 2>/dev/null | tr '\n' ' ')"
  ;;

start-chain)
  [ $# -eq 1 ] || die "usage: start-chain <chain>, e.g. ABCD"
  need_repo; need_tag baseline
  git -C "$APPDIR" checkout -q -B "chain/$1" baseline || die "checkout failed (uncommitted changes in apps/g0?)"
  echo "apps/g0 on chain/$1 from baseline. Round 1 request: prompts/g0/${1:0:1}.md"
  echo "Send it in a FRESH agent session that sees only apps/g0, then: run_pilot.sh tag $1 1"
  ;;

tag)
  [ $# -eq 2 ] || die "usage: tag <chain> <round>"
  chain="$1"; k="$2"; need_repo
  [ "$(git -C "$APPDIR" branch --show-current)" = "chain/$chain" ] || die "apps/g0 is not on chain/$chain (run start-chain)"
  letter="${chain:$((k-1)):1}"
  git -C "$APPDIR" add -A
  git -C "$APPDIR" -c user.name=pilot -c user.email=pilot@example.test commit -qm "$chain r$k: request $letter (prompts/g0/$letter.md)" >/dev/null \
    || echo "WARNING: the agent changed nothing in round $k (tagging anyway; record it)"
  git -C "$APPDIR" tag -f "$chain-r$k" >/dev/null
  echo "tagged $chain-r$k. Next: run_pilot.sh assess $chain $k"
  [ "$k" -lt "${#chain}" ] && echo "Then round $((k+1)) request: prompts/g0/${chain:$k:1}.md"
  ;;

ingest)
  $PY "$ROOT/tools/ingest.py" --raw "$PILOT/raw" --out "$PILOT" && $PY "$ROOT/tools/transitions.py" --results "$PILOT"
  ;;

*)
  sed -n '2,23p' "$0"; exit 2 ;;
esac