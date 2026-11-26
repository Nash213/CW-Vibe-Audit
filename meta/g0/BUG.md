# Seeded bug (request B)
File: FILL (the query or sort behind the recipe list, e.g. `ORDER BY created_at DESC` -> `ASC`).
Symptom (request B text, prompts/g0/B.md): "My recipe list is in the wrong order: the recipe I added most recently is at the bottom instead of the top."
Check (TB): two recipes created in order; the newer one must be listed first.

How to seed (step 4 of meta/g0/README.md):
1. Find the list query: `grep -rn "ORDER BY\|order(\|\.sort(" apps/g0 --include=*.js --include=*.ts | grep -v node_modules`.
2. Flip newest-first to oldest-first in ONE place. Change nothing else.
3. Write the exact file and change on the "File:" line above.
4. `tools/pilot/run_pilot.sh seed` commits it and tags `baseline`.
If the list has no explicit order (relies on insertion order), add `ORDER BY created_at ASC` and say so above.