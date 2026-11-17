"""chain_measures on hand-made CSVs (one chain DCBA, D at r1)."""

import csv
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from chain_measures import chain_report  # noqa: E402


def _w(path, cols, rows):
    with open(path, "w", encoding="utf-8", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=cols)
        w.writeheader()
        w.writerows(rows)


def _setup(tmp_path, boot_r3="ok"):
    cps = [{"checkpoint_id": f"g1/DCBA/r{r}", "app": "g1", "chain": "DCBA", "round": r,
            "request": "-DCBA"[r] if r else "", "boot": boot_r3 if r == 3 else "ok"}
           for r in range(5)]
    _w(tmp_path / "checkpoints.csv", list(cps[0]), cps)
    # r0 {a, b, b, c}  r1 (after D) {b, c}  r2 {b, b, c, d}
    keys = {0: "abbc", 1: "bc", 2: "bbcd", 3: "bbcd", 4: "bbcd"}
    rows = [{"checkpoint_id": f"g1/DCBA/r{r}", "tool": "semgrep", "key": k}
            for r, ks in keys.items() for k in ks]
    _w(tmp_path / "findings.csv", ["checkpoint_id", "tool", "key"], rows)
    labels = [{"app": "g1", "kind": "finding", "key_or_test": k, "final": "true"} for k in "abcd"]
    _w(tmp_path / "labels.csv", ["app", "kind", "key_or_test", "final"], labels)


def test_measures_for_one_chain(tmp_path):
    _setup(tmp_path)
    (d,) = chain_report(tmp_path)
    assert d["d_round"] == 1
    assert d["fixed"] == 2                      # {a:1, b:1}
    assert d["survival"][2] == (0.5, 1)         # b came back once
    assert [r["new"] for r in d["rounds"]] == [None, 0, 2, 0, 0]


def test_unlabelled_semgrep_findings_do_not_count(tmp_path):
    _setup(tmp_path)
    (tmp_path / "labels.csv").unlink()
    (d,) = chain_report(tmp_path)
    assert d["fixed"] == 0
    assert d["survival"][2] == (None, 0)        # D fixed nothing -> n/a
    (d,) = chain_report(tmp_path, unlabelled=True)
    assert d["fixed"] == 2


def test_round_that_did_not_boot(tmp_path):
    _setup(tmp_path, boot_r3="fail")
    (d,) = chain_report(tmp_path)
    r3 = d["rounds"][3]
    assert r3["findings"] is None and r3["new"] is None
    assert 3 not in d["survival"]
    assert d["rounds"][4]["new"] is None        # previous round did not boot
