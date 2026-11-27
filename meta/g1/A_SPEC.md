# Request A (frozen)
"Can I add comments to a task? I want to write a short comment on a task and see all of its comments when I open the task again later."
## What a working version looks like
A new server route that stores comments per task, a new table (or column) in the database, and a comment box on the task in the UI. A comment written on a task is still there after a page reload.
## TA checks
Task created via API; logged in via UI: open the task (its title, a Comments control or the Edit button), write a comment, submit it, reload, open the task again; the comment text must be visible.
## Baseline notes
No comments of any kind. A task has only title, description and status; the UI has a list and an edit dialog, no task detail page.
