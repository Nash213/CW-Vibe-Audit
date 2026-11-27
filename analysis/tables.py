"""Tables R1 to R3 from the result CSVs (plan Wuth-6, Table 3 with D7, D8 and D9a).

Reads only results/*.csv: checkpoints, findings, labels, links and triage. Never the
raw folder. Writes R1.csv, R2.csv, R3.csv and tables.md (all three, for reading) into
results/tables/.

Rules:
  - Confirmed findings: npm-audit and ac findings always count; Semgrep and Gitleaks
    findings count only when labels.csv marks their own key `true` for that app.
    Instances whose key has no final label are left out and counted as a warning.
  - links.csv: after labelling, keys linked as the same finding (per app, transitive)
    are merged under one name before anything is compared.
  - Regressions: triage.csv rows whose labels.csv test_transition label is real_break.
  - D7: a round that did not boot has no findings or regressions. New findings at r
    need both r-1 and r to have booted; otherwise the value is undefined (n/a) and is
    left out of means, which report how many rounds they are over.
  - D8: new findings include reintroduced ones. Damage = new findings + regressions.
  - Reintroduced at a round (R2) = instances reintroduced at r that were not already
    reintroduced at r-1, so a finding that stays back is charged to the request that
    brought it back, once.
  - R2 covers only rounds after D (the question is what later requests do to D's
    fixes): with all 16 chains, each of A, B and C is applied 8 times after D. The
    D9a version uses only the first round after D (4 each).
  - Repeat chains (ids with a suffix, e.g. DCBA-rep) are left out; they feed R5.
  - No p-values (16 chains do not support them); min and max across chains instead.

Usage:
  python analysis/tables.py [--results results] [--out results/tables] [--unlabelled]

--unlabelled counts every finding and transition, for checking the pipeline before
labels exist. Its output goes to results/dev/tables unless --out is given, and every
file says UNLABELLED. Never report those numbers.
"""

from __future__ import annotations

import argparse
import csv
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from measures import fix_survival, fixed_by_d, fmt, new_findings, reintroduced, size  # noqa: E402

CONFIRMED_BY_CONSTRUCTION = {"npm-audit", "ac"}
DAMAGE_REQUESTS = ("A", "B", "C")
MAX_K = 3


def read_csv(path: Path) -> list[dict[str, str]]:
    if not path.exists():
        return []
    with path.open(encoding="utf-8", newline="") as fh:
        return list(csv.DictReader(fh))


# --- links -----------------------------------------------------------------------


def link_map(links: list[dict[str, str]]) -> dict[tuple[str, str], str]:
    """(app, key) -> canonical key: the smallest key in its linked group (transitive)."""
    parent: dict[tuple[str, str], tuple[str, str]] = {}

    def find(x):
        parent.setdefault(x, x)
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for row in links:
        a, b = (row["app"], row["key_a"]), (row["app"], row["key_b"])
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[max(ra, rb)] = min(ra, rb)
    return {x: find(x)[1] for x in parent}


# --- per chain -------------------------------------------------------------------


@dataclass
class Chain:
    app: str
    chain: str
    requests: dict[int, str]                 # round -> request letter ("" for r0)
    booted: dict[int, bool]
    F: dict[int, Counter | None]             # confirmed findings; None if not booted
    regs: dict[int, int | None]
    d_round: int | None = None
    fixed: int | None = None
    survival: dict[int, float | None] = field(default_factory=dict)   # k -> value
    reint_total: dict[int, int | None] = field(default_factory=dict)  # k -> cumulative

    @property
    def last(self) -> int:
        return max(self.requests)

    def new(self, r: int) -> int | None:
        if r < 1 or self.F.get(r) is None or self.F.get(r - 1) is None:
            return None
        return size(new_findings(self.F[r - 1], self.F[r]))

    def newly_reintroduced(self, r: int) -> int | None:
        """Reintroduced at r and not already at r-1. Needs D, r-1 and r measured."""
        rd = self.d_round
        if rd is None or self.fixed is None or r <= rd:
            return None
        if self.F.get(r) is None or self.F.get(r - 1) is None:
            return None
        before, after = self.F[rd - 1], self.F[rd]
        now = reintroduced(before, after, self.F[r])
        prev = Counter() if r - 1 == rd else reintroduced(before, after, self.F[r - 1])
        return size(now - prev)

    def not_booted(self) -> list[int]:
        return [r for r in sorted(self.booted) if not self.booted[r]]


@dataclass
class Loaded:
    chains: list[Chain]
    unlabelled_instances: int
    unlabelled_keys: int
    unlabelled_transitions: int
    skipped_repeat: list[str]


def load(results: Path, unlabelled: bool = False) -> Loaded:
    cps = read_csv(results / "checkpoints.csv")
    findings = read_csv(results / "findings.csv")
    labels = read_csv(results / "labels.csv")
    canon = link_map(read_csv(results / "links.csv"))
    triage = read_csv(results / "triage.csv")

    finding_label = {(r["app"], r["key_or_test"]): r.get("final", "").strip()
                     for r in labels if r.get("kind") == "finding"}
    test_label = {(r["app"], r["key_or_test"], r.get("checkpoint_id", "")): r.get("final", "").strip()
                  for r in labels if r.get("kind") == "test_transition"}

    by_cp: dict[str, Counter] = defaultdict(Counter)
    missing_inst, missing_keys = 0, set()
    for f in findings:
        app = f["checkpoint_id"].split("/")[0]
        key = f["key"]
        if not unlabelled and f["tool"] not in CONFIRMED_BY_CONSTRUCTION:
            label = finding_label.get((app, key), "")
            if label not in ("true", "false"):
                missing_inst += 1
                missing_keys.add((app, key))
                continue
            if label != "true":
                continue
        by_cp[f["checkpoint_id"]][canon.get((app, key), key)] += 1

    regs: Counter = Counter()
    missing_tr = 0
    for t in triage:
        label = test_label.get((t["app"], t["test_id"], t["checkpoint_id"]), "")
        if unlabelled or label == "real_break":
            regs[t["checkpoint_id"]] += 1
        elif label not in ("real_break", "broken_test"):
            missing_tr += 1

    grouped: dict[tuple[str, str], list[dict[str, str]]] = defaultdict(list)
    for c in cps:
        grouped[(c["app"], c["chain"])].append(c)

    chains, skipped = [], []
    for (app, chain_id), rows in sorted(grouped.items()):
        if "-" in chain_id:
            skipped.append(f"{app}/{chain_id}")
            continue
        rows.sort(key=lambda c: int(c["round"]))
        booted = {int(c["round"]): c["boot"] == "ok" for c in rows}
        ch = Chain(
            app=app, chain=chain_id,
            requests={int(c["round"]): c["request"] for c in rows},
            booted=booted,
            F={int(c["round"]): (by_cp[c["checkpoint_id"]] if booted[int(c["round"])] else None)
               for c in rows},
            regs={int(c["round"]): (regs[c["checkpoint_id"]] if booted[int(c["round"])] else None)
                  for c in rows},
        )
        ch.d_round = next((r for r, q in sorted(ch.requests.items()) if q == "D"), None)
        rd = ch.d_round
        if rd is not None and ch.F.get(rd - 1) is not None and ch.F.get(rd) is not None:
            ch.fixed = size(fixed_by_d(ch.F[rd - 1], ch.F[rd]))
        if rd is not None:
            for k in range(1, MAX_K + 1):
                r = rd + k
                if r not in ch.requests:
                    continue
                if ch.fixed is None or ch.F.get(r) is None:
                    ch.survival[k], ch.reint_total[k] = None, None
                else:
                    before, after = ch.F[rd - 1], ch.F[rd]
                    ch.survival[k] = fix_survival(before, after, ch.F[r])
                    ch.reint_total[k] = size(reintroduced(before, after, ch.F[r]))
        chains.append(ch)
    return Loaded(chains, missing_inst, len(missing_keys), missing_tr, skipped)


# --- tables ----------------------------------------------------------------------


def cell(v) -> str:
    return "n/a" if v is None else str(v)


def survival_cell(ch: Chain, k: int) -> str:
    """'' when the chain has no round D+k; 'dnb' when that round did not boot."""
    if k not in ch.survival:
        return ""
    r = ch.d_round + k
    if not ch.booted.get(r, False):
        return "dnb"
    return fmt(ch.survival[k])


def table_r1(chains: list[Chain]) -> list[dict[str, str]]:
    rows = []
    for ch in chains:
        rounds = [r for r in sorted(ch.requests) if r >= 1]
        row = {"app": ch.app, "chain": ch.chain, "d_round": cell(ch.d_round),
               "fixed_by_d": cell(ch.fixed)}
        for k in range(1, MAX_K + 1):
            row[f"survival_+{k}"] = survival_cell(ch, k)
        last_k = max((k for k in ch.reint_total), default=None)
        row["reintroduced_final"] = "" if last_k is None else cell(ch.reint_total[last_k])
        row["new_per_round"] = " ".join(cell(ch.new(r)) for r in rounds)
        row["regressions_per_round"] = " ".join(cell(ch.regs.get(r)) for r in rounds)
        dnb = ch.not_booted()
        row["did_not_boot"] = " ".join(f"r{r}" for r in dnb) or "-"
        rows.append(row)
    return rows


def _mean(values: list[int]) -> str:
    return "n/a" if not values else f"{sum(values) / len(values):.2f}"


def table_r2(chains: list[Chain]) -> list[dict[str, str]]:
    rows = []
    for scope in ("after D", "first after D"):
        for x in DAMAGE_REQUESTS:
            rounds = []
            for ch in chains:
                if ch.d_round is None:
                    continue
                last = ch.d_round + 1 if scope == "first after D" else ch.last
                for r in range(ch.d_round + 1, last + 1):
                    if ch.requests.get(r) == x:
                        rounds.append((ch, r))
            reint = [v for ch, r in rounds if (v := ch.newly_reintroduced(r)) is not None]
            new = [v for ch, r in rounds if (v := ch.new(r)) is not None]
            regs = [v for ch, r in rounds if (v := ch.regs.get(r)) is not None]
            damage = [ch.new(r) + ch.regs[r] for ch, r in rounds
                      if ch.new(r) is not None and ch.regs.get(r) is not None]
            rows.append({
                "scope": scope, "request": x, "times_applied": str(len(rounds)),
                "did_not_boot": str(sum(not ch.booted.get(r, False) for ch, r in rounds)),
                "reintroduced_mean": _mean(reint), "reintroduced_n": str(len(reint)),
                "new_mean": _mean(new), "new_n": str(len(new)),
                "regressions_mean": _mean(regs), "regressions_n": str(len(regs)),
                "damage_mean": _mean(damage), "damage_n": str(len(damage)),
            })
    return rows


def _range(values: list) -> str:
    values = [v for v in values if v is not None]
    if not values:
        return "n/a"
    lo, hi = min(values), max(values)
    f = (lambda v: f"{v:.2f}") if any(isinstance(v, float) for v in values) else str
    return f(lo) if lo == hi else f"{f(lo)}-{f(hi)}"


def table_r3(chains: list[Chain]) -> list[dict[str, str]]:
    by_app: dict[str, list[Chain]] = defaultdict(list)
    for ch in chains:
        by_app[ch.app].append(ch)
    rows = []
    for app, chs in sorted(by_app.items()):
        rounds = [(ch, r) for ch in chs for r in ch.requests]
        finals = []
        for ch in chs:
            if ch.survival:
                k = max(ch.survival)
                finals.append(ch.survival[k] if ch.booted.get(ch.d_round + k, False) else None)
        rows.append({
            "app": app,
            "chains": str(len(chs)),
            "checkpoints_booted": f"{sum(ch.booted[r] for ch, r in rounds)}/{len(rounds)}",
            "baseline_findings": _range([size(ch.F[0]) if ch.F.get(0) is not None else None for ch in chs]),
            "fixed_by_d_total": str(sum(ch.fixed or 0 for ch in chs)),
            "fixed_by_d_range": _range([ch.fixed for ch in chs]),
            "d_fixed_nothing": str(sum(ch.fixed == 0 for ch in chs)),
            "final_survival_range": _range(finals),
            "new_total": str(sum(v for ch in chs for r in ch.requests if (v := ch.new(r)) is not None)),
            "regressions_total": str(sum(v for ch in chs for r in ch.requests if r >= 1
                                         and (v := ch.regs.get(r)) is not None)),
        })
    return rows


# --- output ----------------------------------------------------------------------


def write_csv(path: Path, rows: list[dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as fh:
        if not rows:
            fh.write("")
            return
        w = csv.DictWriter(fh, fieldnames=list(rows[0]), lineterminator="\n")
        w.writeheader()
        w.writerows(rows)


def markdown(title: str, rows: list[dict[str, str]]) -> str:
    if not rows:
        return f"## {title}\n\n(no rows)\n"
    cols = list(rows[0])
    out = [f"## {title}", "", "| " + " | ".join(cols) + " |", "|" + "---|" * len(cols)]
    out += ["| " + " | ".join(r[c] for c in cols) + " |" for r in rows]
    return "\n".join(out) + "\n"


def build(results: Path, out: Path, unlabelled: bool = False) -> Loaded:
    data = load(results, unlabelled)
    r1, r2, r3 = table_r1(data.chains), table_r2(data.chains), table_r3(data.chains)
    write_csv(out / "R1.csv", r1)
    write_csv(out / "R2.csv", r2)
    write_csv(out / "R3.csv", r3)

    notes = []
    if unlabelled:
        notes.append("**UNLABELLED: every finding and transition counted. Not for reporting.**")
    if data.unlabelled_instances:
        notes.append(f"Left out: {data.unlabelled_instances} finding instances "
                     f"({data.unlabelled_keys} keys) with no final label.")
    if data.unlabelled_transitions:
        notes.append(f"Left out: {data.unlabelled_transitions} test transitions with no final label.")
    if data.skipped_repeat:
        notes.append("Repeat chains not in R1-R3 (see R5): " + ", ".join(data.skipped_repeat) + ".")
    notes.append(f"{len(data.chains)} chains. 'n/a' = undefined (D7, or D fixed nothing); "
                 "'dnb' = that round did not boot. Means are over the n rounds where defined.")
    md = ["# Result tables (generated by analysis/tables.py; do not edit)", "",
          *[f"- {n}" for n in notes], "",
          markdown("R1: per chain", r1), markdown("R2: damage per request type after D", r2),
          markdown("R3: per app", r3)]
    (out / "tables.md").write_text("\n".join(md), encoding="utf-8")
    return data


def main(argv: list[str] | None = None) -> int:
    root = Path(__file__).resolve().parents[1]
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--results", type=Path, default=root / "results")
    ap.add_argument("--out", type=Path)
    ap.add_argument("--unlabelled", action="store_true",
                    help="count every finding and transition (pipeline check only)")
    a = ap.parse_args(argv)
    out = a.out or (root / "results" / ("dev/tables" if a.unlabelled else "tables"))
    if not (a.results / "checkpoints.csv").exists():
        print(f"no checkpoints.csv in {a.results}: run make ingest first", file=sys.stderr)
        return 1
    data = build(a.results, out, a.unlabelled)
    print(f"tables: {len(data.chains)} chains -> {out}"
          + (" (UNLABELLED)" if a.unlabelled else "")
          + (f"; {data.unlabelled_instances} unlabelled finding instances left out"
             if data.unlabelled_instances else "")
          + (f"; {data.unlabelled_transitions} unlabelled transitions left out"
             if data.unlabelled_transitions else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
