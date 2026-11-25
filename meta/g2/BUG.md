# Seeded bug (request B)
File: server/db.ts, getNotes(): `updated_at DESC` -> `updated_at ASC`.
Symptom (request B text): "My notes list is in the wrong order: the note I edited most recently is at the bottom instead of the top."
Check (TB): two notes created in order; the newer one must be listed first.