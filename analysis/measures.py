"""Measures (plan Section 2.5, Table 3, with D8 applied).

Every finding quantity is a multiset of keys (collections.Counter), never a set:
the same key can occur twice in one checkpoint and both instances count.

  Fixed by D              instances in F_{rD-1} not in F_{rD}
  Reintroduced (round r)  instances fixed by D that are back at r
  Fix survival (rD + k)   1 - |reintroduced| / |fixed|; undefined if D fixed nothing
  New findings (round r)  instances in F_r not in F_{r-1} (includes reintroduced, D8)
  Feature regression      passed at r-1, fails at r, labelled real_break
  Damage of request X     sum(new + regressions over rounds where X applied) / times applied
"""

from __future__ import annotations

from collections import Counter
from typing import Iterable, Mapping

Multiset = Counter  # Counter[str]: key -> instance count

NA = "n/a"


def as_multiset(keys: Iterable[str] | Mapping[str, int]) -> Counter:
    """Build a Counter from a list of keys or a key->count mapping."""
    if isinstance(keys, Mapping):
        return Counter({k: v for k, v in keys.items() if v > 0})
    return Counter(keys)


def size(m: Counter) -> int:
    return sum(v for v in m.values() if v > 0)


def fixed_by_d(before_d: Counter, after_d: Counter) -> Counter:
    """Instances present right before D and gone right after it."""
    return before_d - after_d


def new_findings(prev: Counter, cur: Counter) -> Counter:
    """Instances at round r that were not at round r-1 (includes reintroduced)."""
    return cur - prev


def reintroduced(before_d: Counter, after_d: Counter, later: Counter) -> Counter:
    """Instances fixed by D that are back at a later round.

    A key comes back only by the amount it grew since right after D, and only
    up to the amount D removed.
    """
    return (later - after_d) & fixed_by_d(before_d, after_d)


def fix_survival(before_d: Counter, after_d: Counter, later: Counter) -> float | None:
    """1 - reintroduced/fixed at the later round. None when D fixed nothing."""
    fixed = size(fixed_by_d(before_d, after_d))
    if fixed == 0:
        return None
    return 1 - size(reintroduced(before_d, after_d, later)) / fixed


def regressions(
    passing_before: Iterable[str],
    failing_now: Iterable[str],
    labels: Mapping[str, str] | None = None,
) -> set[str]:
    """Tests that passed at r-1 and fail at r.

    With `labels` (test id -> final label), keep only those labelled real_break;
    without labels, return the unlabelled candidates (for triage).
    """
    cand = set(passing_before) & set(failing_now)
    if labels is None:
        return cand
    return {t for t in cand if labels.get(t) == "real_break"}


def damage(rounds: Iterable[tuple[str, int, int]]) -> dict[str, float]:
    """Damage per request type.

    `rounds` yields (request, new_findings_count, regressions_count) for every
    round; the result maps request -> mean (new + regressions) per application.
    """
    total: Counter = Counter()
    times: Counter = Counter()
    for request, new, regs in rounds:
        total[request] += new + regs
        times[request] += 1
    return {r: total[r] / times[r] for r in sorted(times)}


def fmt(value: float | None, digits: int = 2) -> str:
    """Format a measure for a table; undefined values print as n/a."""
    return NA if value is None else f"{value:.{digits}f}"
