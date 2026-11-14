# Review protocol

**Status:** DRAFT. These rules are fixed before anyone labels a single item.
Once labelling starts, changes need an entry in `docs/DECISIONS.md` with a date and reason.

**Owner:** Nazrul. **Worked examples:** to be added after the pilot results exist (3 per label).

## 1. Why we review

Scanners and tests report things that are not always real. A person decides
which reports are real. The rules below keep that judgement consistent and
checkable by a second person.

## 2. Who reviews what

| Item | Primary rater | Second rater (20% sample) | Never judges (built the detector or test) |
|---|---|---|---|
| Semgrep and Gitleaks findings | Nazrul | Faris | Wuth |
| Test pass→fail transitions | Jarred | Wuth | Faris |
| Access-probe and npm findings | No review (confirmed by construction) | n/a | Nazrul (probe), Wuth (npm) |

A probe finding is a failing request we can reproduce, so it needs no opinion.
This includes the extra probe checks (security headers, login rate limit, token
after logout, password hashes in responses, uploads). Upload checks before
request A has run are recorded as "not applicable". They are never counted as
"secure" and are not reviewed.

## 3. Labelling scan findings (Semgrep, Gitleaks)

One label per **unique key per app**. Keys are stable across assessment runs.

| Label | Meaning | Examples |
|---|---|---|
| `true` | A real weakness in this app, as it runs or would be deployed. | Hardcoded secret that signs tokens; user input joined into a SQL query; route with no ownership check. |
| `false` | Not a real weakness. | Test fixture; example file never used; dead code; input sanitised before the flagged line; lockfile hash flagged as a secret; rule firing on normal framework use. |
| `unsure` | Temporary only. | Resolve within 24 hours (see below). |

Rules:
- **Time-box: 3 minutes per key.** If you cannot decide, mark `unsure` and move on.
- **Resolving `unsure`:** Nazrul and Wuth decide together within 24 hours and write the reason in the note column.
- **Final labels are only `true` or `false`.** No `unsure` may remain.
- If the same finding appears under two keys, add a row to `links.csv` with the reason.

### Cut rule (decided in advance)

On **Fri 20 Nov**, count the unique Semgrep keys across all apps.

- 400 or fewer: review all Semgrep keys.
- More than 400: review only severity `ERROR` and `WARNING`. `INFO` findings are
  left out of the confirmed set, and the paper says so.

The decision uses **only the count**, taken before anyone reads the findings.
**All Gitleaks keys are always reviewed.**

## 4. Labelling test transitions

A transition is a test that passed in one round and fails in the next.

| Label | Meaning |
|---|---|
| `real_break` | The app genuinely no longer does what the test checks. |
| `broken_test` | The app still works for a human, but the test cannot find the element or route (renamed label, restyled control, moved path). |

How to decide: **reproduce it by hand in the browser first, read the diff second.**
Broken tests are reported as a count. They are not regressions.

Rules:
- Only the **first failing round of a streak** is reviewed. If the same test keeps
  failing for the same cause later, no new label is needed.
- Rounds that did not boot get **no labels**. Faris records the cause.
- `unsure` is allowed temporarily and must be resolved to `real_break` or `broken_test`.

## 5. Avoiding bias

- Sheets are ordered **by app, then key**, never by round. Reading in round order
  makes you assume "the fix worked".
- The second rater **never sees the first label**.
- Nobody reviews findings from a detector or test they built (table in section 2).

## 6. Second rating and agreement

1. After all primary labels exist, draw a **random 20% sample** with the seeded
   sampler. Record the seed in `docs/DECISIONS.md`.
2. Stratify so each app and each kind (finding, test transition) is represented.
3. The second rater labels from sheets with the first label hidden.
4. **Cohen's kappa** is computed on the two independent first labels.
   **Always print raw percent agreement next to kappa.** When one label dominates,
   kappa can look very low even though the raters mostly agree.
5. Disagreements are then discussed. The agreed label goes in the `final` column.

## 7. Labelling sheet columns

**Finding sheet** (one row per unique key per app): app, key, tool, rule, severity,
example location (path and line), code snippet, checkpoints where it appears,
label (`true` / `false` / `unsure`), note.

**Test-transition sheet** (one row per pass→fail transition): checkpoint, test,
first error line, `git -C apps/<app> diff <previous tag> <tag>`, label
(`real_break` / `broken_test` / `unsure`), note.

Labels use dropdown validation so they cannot be mistyped.

## 8. Worked examples

To be added from real pilot findings: 3 for each of `true`, `false`,
`real_break`, `broken_test`.
