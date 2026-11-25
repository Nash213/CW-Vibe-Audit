"""Self-check cases for the measures module (plan Section 7.3, Wuth-2)."""

import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from measures import (  # noqa: E402
    damage,
    fix_survival,
    fixed_by_d,
    fmt,
    new_findings,
    regressions,
    reintroduced,
)

BEFORE = Counter({"a": 1, "b": 2, "c": 1})
AFTER_D = Counter({"b": 1, "c": 1})
LATER = Counter({"b": 2, "c": 1, "d": 1})


def test_fixed_by_d():
    assert fixed_by_d(BEFORE, AFTER_D) == Counter({"a": 1, "b": 1})


def test_reintroduced():
    assert reintroduced(BEFORE, AFTER_D, LATER) == Counter({"b": 1})


def test_fix_survival():
    assert fix_survival(BEFORE, AFTER_D, LATER) == 0.5


def test_new_findings_includes_reintroduced():
    assert new_findings(AFTER_D, LATER) == Counter({"b": 1, "d": 1})


def test_survival_undefined_when_nothing_fixed():
    same = Counter({"a": 1})
    assert fix_survival(same, same, Counter({"a": 3})) is None
    assert fmt(None) == "n/a"


def test_survival_one_when_nothing_returns():
    assert fix_survival(BEFORE, AFTER_D, AFTER_D) == 1.0


def test_duplicates():
    before, after_d, later = Counter({"x": 2}), Counter({"x": 1}), Counter({"x": 2})
    assert fixed_by_d(before, after_d) == Counter({"x": 1})
    assert reintroduced(before, after_d, later) == Counter({"x": 1})
    assert fix_survival(before, after_d, later) == 0


def test_regression():
    assert regressions({"T1", "T2"}, {"T2", "T3"}) == {"T2"}


def test_regression_needs_real_break_label():
    labels = {"T2": "broken_test", "T1": "real_break"}
    assert regressions({"T1", "T2"}, {"T1", "T2"}, labels) == {"T1"}


def test_damage():
    rounds = [("C", 3, 1), ("C", 1, 0), ("D", 0, 0)]
    assert damage(rounds) == {"C": 2.5, "D": 0.0}


def test_fmt():
    assert fmt(0.5) == "0.50"
