# g0 pilot log

One line per step: date, step number (meta/g0/README.md), result, and any harness
bug found (file, symptom, fix commit).

| Date | Step | Result | Harness bug / fix |
|---|---|---|---|
| 2026-11-25 | 7 (mock) | g0 specs checked on a throwaway in-memory mock of the prompt (not the real build, no Docker): baseline T01-T15 + AC1-AC5 pass, TA/TB fail; 7 of 7 removal mutants caught; `login-broken` puts every AC in not_run | `suite.ts` T06/T07 click the first Edit/Delete on the page, so `list-all` also broke them (MUTANTS.md note 1). Not fixed (shared code). |