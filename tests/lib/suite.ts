// tests/lib/suite.ts
// T01..T09: identical for every app. Per-app differences live in apps.ts.
// Test titles START with the ID: M3's parser takes the key from the first word.
import { test, expect } from '@playwright/test';
import { apps, TEST_PASSWORD, type AppId } from './apps';
import { apiLoginStatus, createItem, uniqueEmail, uniqueTitle, withUser } from './auth';
import { clickable, uiLogin, uiLogout, uiRegister } from './ui';

export function defineStandardTests(appId: AppId): void {
  const app = apps[appId];

  test('T01 home page loads', async ({ page }) => {
    const res = await page.goto('/');
    expect(res?.status()).toBe(200);
    await expect(page.getByRole('heading').first()).toBeVisible();
  });

  test('T02 register new user via UI', async ({ page }) => {
    const email = uniqueEmail();
    await uiRegister(page, appId, email);
    // Judge success through the API, so it does not depend on what the UI does after sign-up.
    await expect.poll(() => apiLoginStatus(appId, email, TEST_PASSWORD)).toBeLessThan(300);
  });

  test('T03 log in via UI', async ({ page }) => {
    await withUser(appId, async (user) => {
      await uiLogin(page, appId, user);
    });
  });

  test('T04 create item via UI', async ({ page }) => {
    await withUser(appId, async (user) => {
      const title = uniqueTitle();
      await uiLogin(page, appId, user);
      await page.goto(app.pages.list);
      if (app.ui.addItem) await clickable(page, app.ui.addItem).click();
      await page.getByLabel(app.ui.itemTitle).fill(title);
      await page.getByRole('button', { name: app.ui.saveItem }).click();
      await expect(page.getByText(title).first()).toBeVisible();
    });
  });

  test('T05 item appears in the list', async ({ page }) => {
    await withUser(appId, async (user) => {
      const { title } = await createItem(appId, user);
      await uiLogin(page, appId, user);
      await page.goto(app.pages.list);
      await expect(page.getByText(title).first()).toBeVisible();
    });
  });

  test('T06 edit item and the change shows', async ({ page }) => {
    await withUser(appId, async (user) => {
      const { title } = await createItem(appId, user);
      const newTitle = uniqueTitle('edited');
      await uiLogin(page, appId, user);
      await page.goto(app.pages.list);
      await expect(page.getByText(title).first()).toBeVisible();
      await clickable(page, app.ui.editItem).click();
      if (app.ui.editReady) await expect(page.getByRole('button', { name: app.ui.editReady })).toBeVisible();
      await page.getByLabel(app.ui.itemTitle).fill(newTitle);
      await page.getByRole('button', { name: app.ui.saveItem }).click();
      await expect(page.getByText(newTitle).first()).toBeVisible();
      await expect(page.getByText(title)).toHaveCount(0);
    });
  });

  test('T07 delete item and it disappears', async ({ page }) => {
    // Playwright DISMISSES confirm() dialogs by default, which would cancel the delete.
    page.on('dialog', (dialog) => void dialog.accept());
    await withUser(appId, async (user) => {
      const { title } = await createItem(appId, user);
      await uiLogin(page, appId, user);
      await page.goto(app.pages.list);
      await expect(page.getByText(title).first()).toBeVisible();
      await clickable(page, app.ui.deleteItem).click();
      await expect(page.getByText(title)).toHaveCount(0);
    });
  });

  test('T08 log out and the protected view is unreachable', async ({ page }) => {
    await withUser(appId, async (user) => {
      await uiLogin(page, appId, user);
      await uiLogout(page, appId);
      await page.goto(app.pages.list);
      await expect(page.getByLabel(app.ui.password)).toBeVisible(); // login prompt shown instead
    });
  });

  test('T09 log in again and earlier data is still there', async ({ page }) => {
    await withUser(appId, async (user) => {
      const { title } = await createItem(appId, user);
      await uiLogin(page, appId, user);
      await uiLogout(page, appId);
      await uiLogin(page, appId, user);
      await page.goto(app.pages.list);
      await expect(page.getByText(title).first()).toBeVisible();
    });
  });
}