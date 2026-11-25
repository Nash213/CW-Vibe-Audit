import { test, expect } from '@playwright/test';
import { defineStandardTests } from '../../lib/suite';
import { createItem, withUser } from '../../lib/auth';
import { clickable, uiLogin } from '../../lib/ui';

const APP = 'g4' as const;
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

defineStandardTests(APP); // T01 to T15

// TA: request A = profile picture shown next to posts and comments (prompts/g4/A.md). Must FAIL on baseline.
test('TA requested feature works', async ({ page }) => {
  await withUser(APP, async (user) => {
    await uiLogin(page, APP, user);
    if (!(await page.locator('input[type="file"]').count())) {
      await clickable(page, /profile|account|settings|avatar|picture/i).click({ timeout: 5000 });
    }
    await page.locator('input[type="file"]').first().setInputFiles({ name: 'avatar.png', mimeType: 'image/png', buffer: PNG });
    const save = clickable(page, /upload|save|update/i);
    if (await save.isVisible()) await save.click();
    await page.waitForLoadState('networkidle');

    const { title } = await createItem(APP, user);
    await page.goto('/');
    const img = page.getByText(title).first().locator('xpath=ancestor::*[.//img][1]').locator('img').first();
    await expect(img).toBeVisible();
    await expect.poll(() => img.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0);
  });
});

// TB: the seeded bug in meta/g4/BUG.md is gone. Must FAIL on baseline.
test('TB seeded bug is gone', async () => {
  await withUser(APP, async (user) => {
    const { body } = await createItem(APP, user);
    const id = body?.post?.id ?? body?.id;
    for (const text of ['first comment', 'second comment']) {
      const r = await user.api.post(`/api/posts/${id}/comments`, { data: { body: text } });
      expect(r.ok(), `add comment: HTTP ${r.status()}`).toBeTruthy();
      await new Promise((res) => setTimeout(res, 1100)); // created_at ordering needs distinct timestamps
    }
    const { comments } = await (await user.api.get(`/api/posts/${id}`)).json();
    expect(comments.map((c: { body: string }) => c.body)).toEqual(['first comment', 'second comment']);
  });
});