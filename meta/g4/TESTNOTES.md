# g4 community-board: test notes
- Item = post. The list on the home page is public; edit/delete are only on the post's own page, so openItem navigates there.
- Edit control matched as a whole word (/\bedit\b/i): T06's "edited-..." titles otherwise matched and stranded T07 on the list page.
- TB needs a 1 s gap between the two comments (created_at ordering).
- Stability: 3/3 on seeded baseline, 25 Nov.