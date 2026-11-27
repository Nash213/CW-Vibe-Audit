"""Self-checks for analysis/tables.py on a hand-computed synthetic results folder.

g1/DCBA (D at r1):
  r0 {a, b, c, n}      n is an npm finding (confirmed without a label)
  r1 D {c, n}          fixed by D = 2 (a, b)
  r2 C {c, a, x, n}    new 2 (a, x); a reintroduced -> survival +1 = 0.50
  r3 B  did not boot
  r4 A {a2, b, c, n}   a2 is linked to a; reintroduced a, b -> survival +3 = 0.00
       new at r4 is undefined (r3 did not boot)
  regressions: T04 at r2 real_break (counts), T07 at r4 broken_test (does not)
  plus y (labelled false) at r0 and z (no label) at r2: never counted
g1/ABCD (D at r4, no later round): r0..r3 {a, b, c, n}, r4 {n}: fixed 3
g1/DCBA-rep: a repeat chain, left out of R1-R3
"""

import csv
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import tables  # noqa: E402

F = {
    ("DCBA", 0): ["a", "b", "c", "y"], ("DCBA", 1): ["c"], ("DCBA", 2): ["c", "a", "x", "z"],
    ("DCBA", 4): ["a2", "b", "c"],
    ("ABCD", 0): ["a", "b", "c"], ("ABCD", 1): ["a", "b", "c"], ("ABCD", 2): ["a", "b", "c"],
    ("ABCD", 3): ["a", "b", "c"], ("ABCD", 4): [],
    ("DCBA-rep", 0): ["a"], ("DCBA-rep", 1): [],
}
NOT_BOOTED = {("DCBA", 3)}


def write(path, cols, rows):
    with path.open("w", encoding="utf-8", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=cols, lineterminator="\n")
        w.writeheader()
        w.writerows(rows)


@pytest.fixture
def results(tmp_path):
    cps, findings = [], []
    for chain, n in (("DCBA", 4), ("ABCD", 4), ("DCBA-rep", 1)):
        for r in range(n + 1):
            cid = f"g1/{chain}/r{r}"
            booted = (chain, r) not in NOT_BOOTED
            cps.append({"checkpoint_id": cid, "app": "g1", "chain": chain, "round": r,
                        "request": "" if r == 0 else chain[r - 1], "boot": "ok" if booted else "fail"})
            if not booted:
                continue
            for key in F.get((chain, r), []):
                findings.append({"checkpoint_id": cid, "tool": "semgrep", "rule": "r", "key": key})
            findings.append({"checkpoint_id": cid, "tool": "npm-audit", "rule": "adv", "key": "n"})
    write(tmp_path / "checkpoints.csv", ["checkpoint_id", "app", "chain", "round", "request", "boot"], cps)
    write(tmp_path / "findings.csv", ["checkpoint_id", "tool", "rule", "key"], findings)
    labels = [{"app": "g1", "kind": "finding", "key_or_test": k, "checkpoint_id": "", "final": "true"}
              for k in ("a", "a2", "b", "c", "x")]
    labels.append({"app": "g1", "kind": "finding", "key_or_test": "y", "checkpoint_id": "", "final": "false"})
    labels += [
        {"app": "g1", "kind": "test_transition", "key_or_test": "T04", "checkpoint_id": "g1/DCBA/r2",
         "final": "real_break"},
        {"app": "g1", "kind": "test_transition", "key_or_test": "T07", "checkpoint_id": "g1/DCBA/r4",
         "final": "broken_test"},
    ]
    write(tmp_path / "labels.csv", ["app", "kind", "key_or_test", "checkpoint_id", "final"], labels)
    write(tmp_path / "links.csv", ["app", "key_a", "key_b", "reason", "linked_by"],
          [{"app": "g1", "key_a": "a2", "key_b": "a", "reason": "same sink, moved", "linked_by": "t"}])
    write(tmp_path / "triage.csv", ["checkpoint_id", "app", "chain", "round", "test_id"], [
        {"checkpoint_id": "g1/DCBA/r2", "app": "g1", "chain": "DCBA", "round": 2, "test_id": "T04"},
        {"checkpoint_id": "g1/DCBA/r4", "app": "g1", "chain": "DCBA", "round": 4, "test_id": "T07"},
        {"checkpoint_id": "g1/ABCD/r2", "app": "g1", "chain": "ABCD", "round": 2, "test_id": "T09"},
    ])
    return tmp_path


def rows_by(rows, *keys):
    return {tuple(r[k] for k in keys): r for r in rows}


def test_r1_per_chain(results):
    data = tables.load(results)
    r1 = rows_by(tables.table_r1(data.chains), "chain")
    d = r1[("DCBA",)]
    assert (d["d_round"], d["fixed_by_d"]) == ("1", "2")
    assert (d["survival_+1"], d["survival_+2"], d["survival_+3"]) == ("0.50", "dnb", "0.00")
    assert d["reintroduced_final"] == "2"
    assert d["new_per_round"] == "0 2 n/a n/a"
    assert d["regressions_per_round"] == "0 1 n/a 0"
    assert d["did_not_boot"] == "r3"
    a = r1[("ABCD",)]
    assert (a["d_round"], a["fixed_by_d"]) == ("4", "3")
    assert (a["survival_+1"], a["survival_+2"], a["survival_+3"], a["reintroduced_final"]) == ("", "", "", "")
    assert a["regressions_per_round"] == "0 0 0 0"  # T09 has no label: not a regression
    assert a["did_not_boot"] == "-"


def test_repeat_chain_and_unlabelled_are_reported(results):
    data = tables.load(results)
    assert [c.chain for c in data.chains] == ["ABCD", "DCBA"]
    assert data.skipped_repeat == ["g1/DCBA-rep"]
    assert (data.unlabelled_instances, data.unlabelled_keys) == (1, 1)  # z
    assert data.unlabelled_transitions == 1  # T09


def test_r2_damage_after_d(results):
    r2 = rows_by(tables.table_r2(tables.load(results).chains), "scope", "request")
    c = r2[("after D", "C")]
    assert (c["times_applied"], c["did_not_boot"]) == ("1", "0")
    assert (c["reintroduced_mean"], c["new_mean"], c["regressions_mean"], c["damage_mean"]) == \
        ("1.00", "2.00", "1.00", "3.00")
    b = r2[("after D", "B")]
    assert (b["times_applied"], b["did_not_boot"], b["new_mean"], b["new_n"]) == ("1", "1", "n/a", "0")
    a = r2[("after D", "A")]
    assert (a["new_mean"], a["reintroduced_mean"], a["regressions_mean"], a["regressions_n"],
            a["damage_n"]) == ("n/a", "n/a", "0.00", "1", "0")
    first = rows_by([r for r in tables.table_r2(tables.load(results).chains)
                     if r["scope"] == "first after D"], "request")
    assert [first[(x,)]["times_applied"] for x in "ABC"] == ["0", "0", "1"]


def test_r3_per_app(results):
    (row,) = tables.table_r3(tables.load(results).chains)
    assert row["chains"] == "2" and row["checkpoints_booted"] == "9/10"
    assert row["baseline_findings"] == "4"
    assert (row["fixed_by_d_total"], row["fixed_by_d_range"], row["d_fixed_nothing"]) == ("5", "2-3", "0")
    assert row["final_survival_range"] == "0.00"
    assert (row["new_total"], row["regressions_total"]) == ("2", "1")


def test_links_are_transitive_and_per_app():
    m = tables.link_map([{"app": "g1", "key_a": "k3", "key_b": "k2"},
                         {"app": "g1", "key_a": "k2", "key_b": "k1"},
                         {"app": "g2", "key_a": "k3", "key_b": "k9"}])
    assert m[("g1", "k3")] == m[("g1", "k2")] == "k1"
    assert m[("g2", "k3")] == "k3"


def test_unlabelled_mode_counts_everything(results):
    data = tables.load(results, unlabelled=True)
    d = next(c for c in data.chains if c.chain == "DCBA")
    assert d.fixed == 3  # y now counts and D removed it too
    assert d.regs[4] == 1  # broken_test transitions count when nothing is filtered


def test_build_writes_files_and_main(results, tmp_path):
    out = tmp_path / "tables-out"
    assert tables.main(["--results", str(results), "--out", str(out)]) == 0
    for name in ("R1.csv", "R2.csv", "R3.csv", "tables.md"):
        assert (out / name).is_file()
    md = (out / "tables.md").read_text(encoding="utf-8")
    assert "UNLABELLED" not in md and "DCBA-rep" in md and "1 finding instances" in md
    first = (out / "R1.csv").read_bytes()
    tables.main(["--results", str(results), "--out", str(out)])
    assert (out / "R1.csv").read_bytes() == first  # deterministic

    assert tables.main(["--results", str(results), "--out", str(out), "--unlabelled"]) == 0
    assert "UNLABELLED" in (out / "tables.md").read_text(encoding="utf-8")


def test_no_checkpoints(tmp_path):
    assert tables.main(["--results", str(tmp_path), "--out", str(tmp_path / "o")]) == 1
