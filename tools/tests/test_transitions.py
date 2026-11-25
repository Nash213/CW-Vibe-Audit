"""Self-check cases for the transition lister (plan Section 7.3, Wuth-3)."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from transitions import list_transitions  # noqa: E402


def _run(test_id, statuses, no_boot=()):
    cps, tests = [], []
    for rnd, status in enumerate(statuses):
        cid = f"g1/DCBA/r{rnd}"
        cps.append({"checkpoint_id": cid, "app": "g1", "chain": "DCBA", "round": str(rnd),
                    "boot": "fail" if rnd in no_boot else "ok"})
        tests.append({"checkpoint_id": cid, "test_id": test_id, "status": status,
                      "error_first_line": f"err r{rnd}"})
    return list_transitions(cps, tests)


def _rounds(rows):
    return [int(r["round"]) for r in rows]


def test_streak_listed_once():
    assert _rounds(_run("T04", ["pass", "pass", "fail", "fail", "fail"])) == [2]


def test_alternating():
    assert _rounds(_run("T04", ["pass", "fail", "pass", "fail", "pass"])) == [1, 3]


def test_ta_fails_on_baseline_by_design():
    assert _rounds(_run("TA", ["fail", "fail", "pass", "pass", "fail"])) == [4]


def test_previous_round_did_not_boot():
    # Provisional rule: compare r3 with r1, the last round where the test ran.
    rows = _run("T05", ["pass", "pass", "not_run", "fail", "fail"], no_boot={2})
    assert _rounds(rows) == [3]
    assert rows[0]["prev_checkpoint_id"] == "g1/DCBA/r1"
    assert rows[0]["prev_adjacent"] == "no"


def test_not_run_at_later_round_gives_no_row():
    assert _run("T06", ["pass", "not_run", "not_run"]) == []


def test_round_that_did_not_boot_is_never_listed():
    # even if a stale "fail" status sits in tests.csv for that round
    assert _run("T07", ["pass", "fail"], no_boot={1}) == []


def test_flaky_counts_as_pass():
    assert _rounds(_run("T08", ["flaky", "fail"])) == [1]


def test_error_line_comes_from_failing_round():
    rows = _run("T04", ["pass", "fail"])
    assert rows[0]["error_first_line"] == "err r1"
    assert rows[0]["prev_adjacent"] == "yes"
