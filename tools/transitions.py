"""Pass-to-fail transition lister (plan Section 7.3, Wuth-3).

Reads tests.csv and checkpoints.csv, writes triage.csv: one row per pass-to-fail
transition, for Faris to give a cause and for the labellers (real_break | broken_test).

Rules:
  - Compare each round with the previous round of the same chain.
  - flaky counts as pass.
  - List only the first failing round of a streak.
  - Never list a round that did not boot, and never a test that is not_run there.
  - PROVISIONAL (to confirm with Nazrul, see docs/DECISIONS.md): when the previous
    round did not boot (or the test was not_run there), compare with the last
    earlier round of the chain where the test has a result. Such rows have
    prev_adjacent = no, and the summary counts them.

Usage:
  python tools/transitions.py [--results results]
"""

from __future__ import annotations

import argparse
import csv
import sys
from collections import defaultdict
from pathlib import Path
from typing import Iterable

TRIAGE_COLS = [
    "checkpoint_id", "app", "chain", "round", "test_id", "prev_checkpoint_id",
    "prev_adjacent", "error_first_line", "cause_guess",
]

PASSING = {"pass", "flaky"}
HAS_RESULT = {"pass", "flaky", "fail"}


def list_transitions(
    checkpoints: Iterable[dict[str, str]], tests: Iterable[dict[str, str]]
) -> list[dict[str, str]]:
    cps = {c["checkpoint_id"]: c for c in checkpoints}

    # (app, chain) -> test_id -> {round: (status, error)}
    series: dict[tuple[str, str], dict[str, dict[int, tuple[str, str]]]] = defaultdict(
        lambda: defaultdict(dict)
    )
    for t in tests:
        cp = cps.get(t["checkpoint_id"])
        if cp is None:
            raise ValueError(f"tests.csv row for unknown checkpoint {t['checkpoint_id']}")
        status = t["status"]
        if cp["boot"] != "ok":
            status = "not_run"  # never trust a result from a round that did not boot
        series[(cp["app"], cp["chain"])][t["test_id"]][int(cp["round"])] = (
            status,
            t.get("error_first_line", ""),
        )

    rows: list[dict[str, str]] = []
    for (app, chain), by_test in series.items():
        for test_id, by_round in by_test.items():
            prev_round: int | None = None  # last round with a result for this test
            for rnd in sorted(by_round):
                status, err = by_round[rnd]
                if status not in HAS_RESULT:
                    continue
                if prev_round is not None and status == "fail":
                    prev_status = by_round[prev_round][0]
                    if prev_status in PASSING:
                        rows.append({
                            "checkpoint_id": f"{app}/{chain}/r{rnd}",
                            "app": app,
                            "chain": chain,
                            "round": str(rnd),
                            "test_id": test_id,
                            "prev_checkpoint_id": f"{app}/{chain}/r{prev_round}",
                            "prev_adjacent": "yes" if prev_round == rnd - 1 else "no",
                            "error_first_line": err,
                            "cause_guess": "",
                        })
                prev_round = rnd
    rows.sort(key=lambda r: (r["app"], r["chain"], int(r["round"]), r["test_id"]))
    return rows


def _read(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8", newline="") as fh:
        return list(csv.DictReader(fh))


def main(argv: list[str] | None = None) -> int:
    root = Path(__file__).resolve().parents[1]
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--results", type=Path, default=root / "results")
    args = ap.parse_args(argv)

    rows = list_transitions(
        _read(args.results / "checkpoints.csv"), _read(args.results / "tests.csv")
    )
    out = args.results / "triage.csv"
    with out.open("w", encoding="utf-8", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=TRIAGE_COLS, lineterminator="\n")
        w.writeheader()
        w.writerows(rows)
    gaps = sum(1 for r in rows if r["prev_adjacent"] == "no")
    print(f"{len(rows)} transitions ({gaps} compared across a non-booted round) -> {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
