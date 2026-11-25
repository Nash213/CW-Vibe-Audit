# g2 notex: test notes
- Item = note. Edit/delete are icon buttons ("Edit note", "Delete note"); edit happens in a dialog (editScope).
- TA skips file inputs that only accept images, so it never uses the existing avatar upload.
- TB needs a 1 s gap between the two notes (updated_at has 1 s resolution).
- Runs in node:22-slim (better-sqlite3 needs Node >= 22).
- Stability: 3/3 on seeded baseline, 25 Nov.