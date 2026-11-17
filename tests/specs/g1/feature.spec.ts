import { test, expect } from '@playwright/test';
import { apps } from '../../lib/apps';
import { createItem, uniqueTitle, withUser } from '../../lib/auth';
import { defineStandardTests } from '../../lib/suite';
import { uiLogin } from '../../lib/ui';

const APP = 'g1' as const;

defineStandardTests(APP); // T01 to T09

// TA: the feature requested in meta/g1/A_SPEC.md. Must FAIL on baseline (it does not exist yet).
test('TA requested feature works', async ({ page }) => {
  await withUser(APP, async (user) => {
    // FILL (API): call the new route named in A_SPEC.md and check it answers.
    const res = await user.api.get('/api/FILL-new-route');
    expect(res.status(), 'new route should exist and succeed').toBeLessThan(300);

    // FILL (UI): the new element, with wide wording alternatives (the agent picks its own text).
    await uiLogin(page, APP, user);
    await page.goto(apps[APP].pages.list);
    await expect(page.getByRole('button', { name: /FILL|FILL-alt/i })).toBeVisible();
  });
});

// TB: the seeded bug in meta/g1/BUG.md is gone. Must FAIL on baseline (the bug is there).
test('TB seeded bug is gone', async () => {
  await withUser(APP, async (user) => {
    // Example for an inverted status filter. REPLACE with the symptom in BUG.md.
    const open = await createItem(APP, user, uniqueTitle('open'));
    const done = await createItem(APP, user, uniqueTitle('done'));
    // FILL: mark `done` as done through the app's own route.
    const res = await user.api.get(`${apps[APP].api.items}?status=done`); // FILL
    expect(res.ok()).toBeTruthy();
    const titles: string[] = (await res.json()).map((t: { title: string }) => t.title);
    expect(titles).toContain(done.title);
    expect(titles).not.toContain(open.title);
  });
});