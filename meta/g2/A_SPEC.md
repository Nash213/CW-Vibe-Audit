# Request A (frozen)
"Can I attach a file to a note? I want to upload a file from my computer and download it again later from the note."
## TA checks
Logged in via UI: open a note, attach a text file, reload, open the note, download it; content must match.
## Baseline notes
No note attachments. The app already has an image-only avatar upload (POST /api/profile/avatar, 5 MB, image/* only), so an upload route exists before A.