"""Official assessment batch: run tools/assess.py on every checkpoint (plan Wuth-4, make assess).

Usage (on the batch host, WSL):
    python3 tools/assess_batch.py [--apps g1 g2 ...] [--chains ABCD DCBA-rep ...]
                                  [--raw results/raw] [--dry-run]

  1. Checkpoints come from the round tags in each study app's repo (apps/<id>, ids from
     meta/apps.json): a tag <chain>-r<k> gives checkpoint <chain>/r<k>, and every chain
     also gets r0 (= `baseline`). Pilot chains (a suffix containing "pilot") are left
     out; their outputs live in results/pilot/raw.
  2. In order app, chain, round, run assess.py on each one. It skips a checkpoint whose
     `stage` file says done, so re-running this batch after a stop resumes it.
  3. After each checkpoint, print and append to <raw>/assess_batch.log one line:
     app, chain, round, stage, boot status, tests passed/total, seconds.
     A checkpoint not `done` afterwards is a failure; the batch carries on with the rest
     and exits 1 at the end, naming them, so one re-run retries just those.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TAG_RE = re.compile(r"^(?P<chain>[A-D]{4}(?:-[a-z0-9]+)?)-r(?P<k>[1-9][0-9]*)$")


def checkpoints(tags: list[str]) -> list[tuple[str, int]]:
    """(chain, round) for every round tag plus r0 per chain; pilot chains left out."""
    rounds: dict[str, set[int]] = {}
    for t in tags:
        m = TAG_RE.match(t.strip())
        if not m or "pilot" in m["chain"]:
            continue
        rounds.setdefault(m["chain"], {0}).add(int(m["k"]))
    return [(c, k) for c in sorted(rounds) for k in sorted(rounds[c])]


def app_tags(repo: Path) -> list[str]:
    out = subprocess.run(["git", "-C", str(repo), "tag"], check=True, capture_output=True,
                         text=True).stdout
    return out.split()


def read(p: Path) -> str:
    return p.read_text(encoding="utf-8").strip() if p.exists() else "-"


def tests_summary(out: Path) -> str:
    pj = out / "playwright.json"
    if not pj.exists() or pj.stat().st_size == 0:
        return "-"
    sys.path.insert(0, str(ROOT / "tools"))
    from parse_playwright import parse_report
    rows = parse_report(pj)
    return f"{sum(r.status == 'pass' for r in rows)}/{len(rows)}"


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--apps", nargs="+")
    ap.add_argument("--chains", nargs="+")
    ap.add_argument("--raw", type=Path, default=ROOT / "results" / "raw")
    ap.add_argument("--dry-run", action="store_true", help="list the checkpoints, run nothing")
    args = ap.parse_args(argv)

    apps = [a for a in json.loads((ROOT / "meta" / "apps.json").read_text(encoding="utf-8"))
            if not a.startswith("_")]
    if args.apps:
        apps = [a for a in apps if a in args.apps]
    plan = []
    for app in apps:
        for chain, k in checkpoints(app_tags(ROOT / "apps" / app)):
            if not args.chains or chain in args.chains:
                plan.append((app, chain, k))

    done = [p for p in plan
            if read(args.raw / p[0] / p[1] / f"r{p[2]}" / "stage") == "done"]
    print(f"{len(plan)} checkpoints, {len(done)} already done, {len(plan) - len(done)} to run")
    if args.dry_run:
        for app, chain, k in plan:
            print(f"  {app}/{chain}/r{k}")
        return 0

    log = args.raw / "assess_batch.log"
    log.parent.mkdir(parents=True, exist_ok=True)
    failed = []
    for i, (app, chain, k) in enumerate(plan, 1):
        out = args.raw / app / chain / f"r{k}"
        t0 = time.monotonic()
        rc = subprocess.run([sys.executable, str(ROOT / "tools" / "assess.py"), app, chain,
                             str(k), "--raw", str(args.raw.resolve())],
                            cwd=str(ROOT), check=False).returncode
        stage = read(out / "stage")
        line = (f"{dt.datetime.now(dt.timezone.utc):%Y-%m-%dT%H:%M:%SZ}\t{app}\t{chain}\tr{k}\t"
                f"stage={stage}\tboot={read(out / 'boot_status')}\t"
                f"tests={tests_summary(out)}\t{time.monotonic() - t0:.0f}s\texit={rc}")
        print(f"[{i}/{len(plan)}] {line}", flush=True)
        with log.open("a", encoding="utf-8") as f:
            f.write(line + "\n")
        if stage != "done":
            failed.append(f"{app}/{chain}/r{k}")

    if failed:
        print(f"FAILED ({len(failed)}): {' '.join(failed)}; re-run to retry them")
        return 1
    print("all checkpoints done")
    return 0


if __name__ == "__main__":
    sys.exit(main())
