# Decisions

Record each project decision with its date, owner, and rationale.

## 2026-11-17 — Definition of "reintroduced" (Wuth, M3)

**Decision.** For a chain where request D is applied at round r_D, the findings
reintroduced at a later round r are

    reintroduced(r) = (F_r − F_{r_D}) ∩ fixed_by_D,   fixed_by_D = F_{r_D − 1} − F_{r_D}

with multiset difference and intersection (`collections.Counter` `-` and `&`).
A key counts as reintroduced only by the amount it grew since right after D, and
never by more than D removed. Fix survival at r is `1 − |reintroduced| / |fixed_by_D|`,
reported as `n/a` when D fixed nothing.

**Why.** It is the only reading that gives both expected answers in the plan's
self-checks (Section 7.3): before {a:1, b:2, c:1}, after D {b:1, c:1}, later
{b:2, c:1, d:1} → reintroduced {b:1}; and duplicates before {x:2}, after D {x:1},
later {x:2} → reintroduced {x:1}, survival 0. Comparing the later round against
`before_D` instead would miss the second case.

**Where.** `analysis/measures.py` (`reintroduced`, `fix_survival`), tested in
`analysis/tests/test_measures.py`. Nazrul's statistics scripts must use the same
definition.
