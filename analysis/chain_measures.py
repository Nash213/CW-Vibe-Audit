"""Print the Table 3 measures for each chain from the CSVs (pilot / Gate 3 check).

Reads only results/*.csv (checkpoints, findings, optional labels, optional triage).

Confirmed findings (plan Section 2.5): npm-audit and ac findings always count;
Semgrep and Gitleaks findings count only when labels.csv marks the key true.
Before labelling exists, pass --unlabelled to count every finding (pilot sanity
check only; never for reported numbers).

Usage:
  python analysis/chain_measures.py [--results results] [--unlabelled]
"""

from __future__ import annotations

import argparse
import csv
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from measures import fix_survival, fixed_by_d, fmt, new_findings, reintroduced, size  # noqa: E402

CONFIRMED_BY_CONSTRUCTION = {"npm-audit", "ac"}


def _read(path: Path) -> list[dict[str, str]]:
    if not path.exists():
        return []
    with path.open(encoding="utf-8", newline="") as fh:
        return list(csv.DictReader(fh))


def confirmed_keys(labels: list[dict[str, str]]) -> set[tuple[str, str]]:
    return {(r["app"], r["key_or_test"]) for r in labels
            if r.get("kind") == "finding" and r.get("final") == "true"}


def chain_report(results: Path, unlabelled: bool = False) -> list[dict[str, object]]:
    cps = _read(results / "checkpoints.csv")
    findings = _read(results / "findings.csv")
    true_keys = confirmed_keys(_read(results / "labels.csv"))
    test_labels = {(r["app"], r["key_or_test"], r.get("checkpoint_id", "")): r.get("final")
                   for r in _read(results / "labels.csv") if r.get("kind") == "test_transition"}
    triage = _read(results / "triage.csv")

    by_cp: dict[str, Counter] = defaultdict(Counter)
    for f in findings:
        app = f["checkpoint_id"].split("/")[0]
        if unlabelled or f["tool"] in CONFIRMED_BY_CONSTRUCTION or (app, f["key"]) in true_keys:
            by_cp[f["checkpoint_id"]][f["key"]] += 1

    regs: Counter = Counter()
    for t in triage:
        label = test_labels.get((t["app"], t["test_id"], t["checkpoint_id"]))
        if unlabelled or label == "real_break":
            regs[t["checkpoint_id"]] += 1

    chains: dict[tuple[str, str], list[dict[str, str]]] = defaultdict(list)
    for c in cps:
        chains[(c["app"], c["chain"])].append(c)

    out = []
    for (app, chain), rows in sorted(chains.items()):
        rows.sort(key=lambda c: int(c["round"]))
        F = {int(c["round"]): by_cp[c["checkpoint_id"]] for c in rows}
        booted = {int(c["round"]): c["boot"] == "ok" for c in rows}
        per_round = []
        for c in rows:
            r = int(c["round"])
            new = new_findings(F[r - 1], F[r]) if r - 1 in F and booted.get(r - 1) and booted[r] else None
            per_round.append({"round": r, "request": c["request"], "boot": c["boot"],
                              "findings": size(F[r]) if booted[r] else None,
                              "new": None if new is None else size(new),
                              "regressions": regs[c["checkpoint_id"]] if booted[r] else None})
        rd = next((int(c["round"]) for c in rows if c["request"] == "D"), None)
        d = {"app": app, "chain": chain, "rounds": per_round, "d_round": rd,
             "fixed": None, "survival": {}}
        if rd is not None and booted.get(rd) and booted.get(rd - 1):
            d["fixed"] = size(fixed_by_d(F[rd - 1], F[rd]))
            for r in sorted(F):
                if r > rd and booted[r]:
                    d["survival"][r] = (fix_survival(F[rd - 1], F[rd], F[r]),
                                        size(reintroduced(F[rd - 1], F[rd], F[r])))
        out.append(d)
    return out


def _cell(v: object) -> str:
    return "n/a" if v is None else str(v)


def main(argv: list[str] | None = None) -> int:
    root = Path(__file__).resolve().parents[1]
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--results", type=Path, default=root / "results")
    ap.add_argument("--unlabelled", action="store_true",
                    help="count every finding and transition (pilot sanity check only)")
    args = ap.parse_args(argv)

    report = chain_report(args.results, args.unlabelled)
    if not report:
        print("no checkpoints in checkpoints.csv")
        return 1
    if args.unlabelled:
        print("UNLABELLED: every finding and test transition counted; not for reporting\n")
    for d in report:
        print(f"== {d['app']}/{d['chain']}  (D at r{_cell(d['d_round'])}, fixed by D: {_cell(d['fixed'])})")
        print("round  req  boot          findings  new  regressions  survival  reintroduced")
        for r in d["rounds"]:
            surv, reint = d["survival"].get(r["round"], (None, None))
            print(f"r{r['round']:<5} {r['request'] or '-':<4} {r['boot']:<13} "
                  f"{_cell(r['findings']):>8}  {_cell(r['new']):>3}  {_cell(r['regressions']):>11}  "
                  f"{fmt(surv) if r['round'] in d['survival'] else '':>8}  {_cell(reint) if reint is not None else '':>12}")
        print()
    return 0


if __name__ == "__main__":
    sys.exit(main())
