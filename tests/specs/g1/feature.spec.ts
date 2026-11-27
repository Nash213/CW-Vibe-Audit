import { test, expect, type Locator, type Page } from '@playwright/test';
import { apps } from '../../lib/apps';
import { createItem, uniqueTitle, withUser } from '../../lib/auth';
import { defineStandardTests } from '../../lib/suite';
import { clickable, field, uiLogin } from '../../lib/ui';

const APP = 'g1' as const;

defineStandardTests(APP); // T01 to T09

const COMMENT_BOX = /comment/i;

/** Open the task so its comment box shows: the box may already be on the list, or behind a
 *  Comments control, the task's title, or its Edit button (the agent picks the design). */
async function openComments(page: Page, title: string): Promise<Locator> {
  await expect(page.getByText(title).first()).toBeVisible();
  const box = field(page, COMMENT_BOX);
  const card = page.getByText(title).first().locator('xpath=ancestor::*[.//button][1]');
  const tries = [
    async () => {},
    async () => clickable(card, /comment/i).click({ timeout: 3000 }),
    async () => page.getByText(title).first().click({ timeout: 3000 }),
    async () => clickable(card, apps[APP].ui.editItem).click({ timeout: 3000 }),
  ];
  for (const attempt of tries) {
    await attempt().catch(() => undefined);
    if (await box.isVisible().catch(() => false)) return box;
  }
  throw new Error('no comment box found for the task');
}

// TA: the feature requested in meta/g1/A_SPEC.md (comments on a task). Must FAIL on baseline.
test('TA requested feature works', async ({ page }) => {
  await withUser(APP, async (user) => {
    const { title } = await createItem(APP, user);
    const comment = uniqueTitle('comment');
    await uiLogin(page, APP, user);
    await page.goto(apps[APP].pages.list);

    const box = await openComments(page, title);
    await box.fill(comment);
    const near = box.locator('xpath=ancestor::*[.//button][1]');
    await clickable(near, /add|post|save|send|comment|submit/i).click();
    await expect(page.getByText(comment).first()).toBeVisible();

    await page.reload();
    await openComments(page, title);
    await expect(page.getByText(comment).first()).toBeVisible();
  });
});

// TB: the seeded bug in meta/g1/BUG.md is gone (status filter shows the other tasks). Must FAIL on baseline.
test('TB seeded bug is gone', async () => {
  await withUser(APP, async (user) => {
    const items = apps[APP].api.items;
    const open = await createItem(APP, user, uniqueTitle('open'));
    const done = await createItem(APP, user, uniqueTitle('done'));
    const id = done.body?.id ?? done.body?.task?.id;
    const put = await user.api.put(`${items}/${id}`, {
      data: { title: done.title, description: 'created by test', status: 'done' },
    });
    expect(put.ok(), `mark done: HTTP ${put.status()}`).toBeTruthy();

    const res = await user.api.get(`${items}?status=done`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    const titles: string[] = (Array.isArray(body) ? body : body.tasks ?? []).map((t: { title: string }) => t.title);
    expect(titles).toContain(done.title);
    expect(titles).not.toContain(open.title);
  });
});