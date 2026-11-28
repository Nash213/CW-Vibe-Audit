"""Self-checks for the assessment batch's checkpoint list (tools/assess_batch.py)."""

import sys
from pathlib import Path

TOOLS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TOOLS))

from assess_batch import checkpoints  # noqa: E402


def test_every_round_tag_plus_r0_per_chain():
    tags = ["baseline", "ABCD-r1", "ABCD-r2", "DCBA-r1"]
    assert checkpoints(tags) == [("ABCD", 0), ("ABCD", 1), ("ABCD", 2),
                                 ("DCBA", 0), ("DCBA", 1)]


def test_repeat_chain_kept_pilot_left_out():
    tags = ["DCBA-rep-r1", "DCBA-rep-r2", "DCBA-pilot-r1", "DCBA-pilot-r4"]
    assert checkpoints(tags) == [("DCBA-rep", 0), ("DCBA-rep", 1), ("DCBA-rep", 2)]


def test_rounds_sorted_numerically_and_other_tags_ignored():
    tags = ["ABCD-r10", "ABCD-r2", "baseline", "v1.0", "ABCD-r0", "abcd-r1"]
    assert checkpoints(tags) == [("ABCD", 0), ("ABCD", 2), ("ABCD", 10)]


def test_no_round_tags_no_checkpoints():
    assert checkpoints(["baseline"]) == []
