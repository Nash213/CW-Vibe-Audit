# Request A (pilot)
"Can I add a photo to a recipe? I want to upload a picture from my computer and see it on the recipe page."
## TA checks
Logged in via UI: create a recipe, open it, upload a PNG, reload, open the recipe again; the recipe page must show a loaded image.
## Baseline notes
FILL after the build: does the baseline already have any upload route? (g2 had an avatar upload before A.)
Upload checks (oversized file, HTML/script file, `../` file name) are "not applicable" before A has run.