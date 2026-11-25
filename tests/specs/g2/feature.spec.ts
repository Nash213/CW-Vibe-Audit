import { test, expect } from '@playwright/test';
import { defineStandardTests } from '../../lib/suite';
import { createItem, uniqueTitle, withUser } from '../../lib/auth';
import { apps } from '../../lib/apps';

const APP = 'g2' as const;

defineStandardTests(APP); // T01 to T15

// TA: request A = attach a file to a note (prompts/g2/A.md). Must FAIL on baseline.
test('TA requested feature works', async () => {
  expect(false, 'placeholder: write TA from meta/g2/A_SPEC.md (attach a file to a note)').toBe(true);
});

// TB: the seeded bug in meta/g2/BUG.md is gone. Must FAIL on baseline.
test('TB seeded bug is gone', async () => {
  await withUser(APP, async (user) => {
    const first = await createItem(APP, user, uniqueTitle('older'));
    await new Promise((r) => setTimeout(r, 1100)); // updated_at has 1 s resolution (API level, not a UI wait)
    const second = await createItem(APP, user, uniqueTitle('newer'));
    const { notes } = await (await user.api.get(apps[APP].api.items)).json();
    const titles = (notes as { title: string }[]).map((n) => n.title);
    expect(titles.indexOf(second.title), 'newer note should be listed first').toBeLessThan(titles.indexOf(first.title));
  });
});