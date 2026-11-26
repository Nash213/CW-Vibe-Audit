// PILOT app g0 (recipe box). Not study data: meta/g0/README.md.
import { test, expect } from '@playwright/test';
import { defineStandardTests } from '../../lib/suite';
import { createItem, uniqueTitle, withUser } from '../../lib/auth';
import { apps } from '../../lib/apps';
import { clickable, openItem, showList, uiLogin } from '../../lib/ui';

const APP = 'g0' as const;
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

/** Titles from a list response, whatever its shape: [..], {recipes:[..]}, {data:[..]}, ... */
function titlesOf(body: unknown): string[] {
  const list = Array.isArray(body)
    ? body
    : Object.values((body ?? {}) as Record<string, unknown>).find(Array.isArray) ?? [];
  return (list as { title?: string }[]).map((r) => String(r?.title));
}

defineStandardTests(APP); // T01 to T15

// TA: request A = photo on a recipe (prompts/g0/A.md). Must FAIL on baseline.
test('TA requested feature works', async ({ page }) => {
  await withUser(APP, async (user) => {
    const { title } = await createItem(APP, user);
    await uiLogin(page, APP, user);
    await showList(page, APP);
    await page.getByText(title).first().click(); // the recipe page (or its edit view)
    const fileInput = page.locator('input[type="file"]');
    if (!(await fileInput.count())) {
      await openItem(page, APP, title);
      await clickable(page, apps[APP].ui.editItem).click({ timeout: 5000 });
    }
    await fileInput.first().setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: PNG });
    const save = clickable(page, /upload|save|update/i).first();
    if (await save.isVisible()) await save.click();
    await page.waitForLoadState('networkidle');

    await showList(page, APP);
    await page.getByText(title).first().click();
    const img = page.locator('main img, [role="dialog"] img, body img').filter({ visible: true }).first();
    await expect(img).toBeVisible();
    await expect.poll(() => img.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0);
  });
});

// TB: the seeded bug in meta/g0/BUG.md is gone (newest recipe first). Must FAIL on baseline.
test('TB seeded bug is gone', async () => {
  await withUser(APP, async (user) => {
    const first = await createItem(APP, user, uniqueTitle('older'));
    await new Promise((r) => setTimeout(r, 1100)); // 1 s timestamp resolution (API level, not a UI wait)
    const second = await createItem(APP, user, uniqueTitle('newer'));
    const titles = titlesOf(await (await user.api.get(apps[APP].api.items)).json());
    expect(titles, 'both recipes should be in the list').toEqual(expect.arrayContaining([first.title, second.title]));
    expect(titles.indexOf(second.title), 'newer recipe should be listed first').toBeLessThan(titles.indexOf(first.title));
  });
});