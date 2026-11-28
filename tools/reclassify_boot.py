"""Re-check boot failures recorded as "timeout" for hidden crash loops (Faris, M2).

Before 28 Nov, tools/boot_and_test.sh called a failed health check a crash only when a
container had *exited*. A restart policy keeps a crashing app "running" (Status
"Restarting", or "Up" for a few seconds after a 120 s wait), so crash loops were
recorded as timeouts. This script reads the compose-ps-after.json each such checkpoint
already saved and, with --write, appends one line to its notes file:

    cause_hint_revised: runtime crash (restart loop: app Restarting (1) 12 seconds ago)

The original cause_hint line is kept. Nothing is re-run. Conservative: only
"Restarting ..." or "Up N seconds" / "Up Less than a second" count, because the
health check waited HEALTH_TIMEOUT (120 s) before this snapshot was taken.

Usage: python3 tools/reclassify_boot.py [--raw results/raw] [--write]
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MARK = "cause_hint_revised:"
SHORT_UP = re.compile(r"^Up (Less than a second|\d+ seconds?)\b", re.I)


def services(path: Path) -> list[dict]:
    """compose ps --format json: one object per line (new) or one array (old)."""
    out: list[dict] = []
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = line.strip()
        if not line:
            continue
        data = json.loads(line)
        out.extend(data if isinstance(data, list) else [data])
    return out


def looping(svcs: list[dict]) -> list[str]:
    hits = []
    for s in svcs:
        status = str(s.get("Status", ""))
        if status.lower().startswith("restarting") or SHORT_UP.match(status):
            hits.append(f"{s.get('Service', '?')} {status}")
    return hits


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--raw", type=Path, default=ROOT / "results" / "raw")
    ap.add_argument("--write", action="store_true", help="append the revised line (default: dry run)")
    args = ap.parse_args()

    checked = changed = 0
    for notes in sorted(args.raw.glob("*/*/r*/notes")):
        text = notes.read_text(encoding="utf-8", errors="replace")
        if "cause_hint: timeout (no HTTP 200" not in text or MARK in text:
            continue
        checked += 1
        cp = notes.parent.relative_to(args.raw).as_posix()
        after = notes.parent / "compose-ps-after.json"
        if not after.is_file():
            print(f"{cp}: no compose-ps-after.json, left as timeout")
            continue
        try:
            hits = looping(services(after))
        except (json.JSONDecodeError, OSError) as e:
            print(f"{cp}: unreadable compose-ps-after.json ({e}), left as timeout")
            continue
        if not hits:
            print(f"{cp}: no restart evidence, left as timeout")
            continue
        line = f"{MARK} runtime crash (restart loop: {'; '.join(hits)})"
        print(f"{cp}: {line}")
        changed += 1
        if args.write:
            with notes.open("a", encoding="utf-8") as f:
                f.write(("" if text.endswith("\n") or not text else "\n") + line + "\n")
    print(f"\n{checked} timeout checkpoint(s) checked, {changed} reclassified"
          + ("" if args.write else " (dry run: add --write to save)"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())