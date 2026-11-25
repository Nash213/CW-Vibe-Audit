import { test, expect } from '@playwright/test';
import { defineStandardTests } from '../../lib/suite';
import { createItem, uniqueTitle, withUser } from '../../lib/auth';
import { apps } from '../../lib/apps';
import { readFile } from 'node:fs/promises';
import { clickable, editScope, openItem, uiLogin } from '../../lib/ui';

const APP = 'g2' as const;

defineStandardTests(APP); // T01 to T15

// TA: request A = attach a file to a note (prompts/g2/A.md). Must FAIL on baseline.
test('TA requested feature works', async ({ page }) => {
  await withUser(APP, async (user) => {
    const { title } = await createItem(APP, user);
    const name = `${uniqueTitle('attach')}.txt`;
    const content = `attachment ${name}`;
    await uiLogin(page, APP, user);
    await openItem(page, APP, title);
    const fileInput = (s: Awaited<ReturnType<typeof editScope>>) =>
      s.locator('input[type="file"]:not([accept^="image"])'); // skip the existing avatar upload
    let scope = await editScope(page);
    if (!(await fileInput(scope).count())) {
      await clickable(page, apps[APP].ui.editItem).click();
      scope = await editScope(page);
    }
    await fileInput(scope).first().setInputFiles({ name, mimeType: 'text/plain', buffer: Buffer.from(content) });
    const save = clickable(scope, /upload|attach|save|update note/i);
    if (await save.isVisible()) await save.click();

    await page.reload();
    await openItem(page, APP, title);
    const link = page.getByRole('link', { name: new RegExp(name) }).or(clickable(page, /download/i)).first();
    const href = await link.getAttribute('href', { timeout: 5000 });
    let body: string;
    if (href && !href.startsWith('blob:')) {
      body = await (await page.request.get(href)).text();
    } else {
      const [dl] = await Promise.all([page.waitForEvent('download'), link.click()]);
      body = await readFile((await dl.path())!, 'utf8');
    }
    expect(body, 'downloaded file should match the upload').toBe(content);
  });
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