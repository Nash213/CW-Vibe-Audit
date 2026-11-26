// tests/lib/suite.ts
// T01..T15: identical for every app. Per-app differences live in apps.ts.
// Test titles START with the ID: M3's parser takes the key from the first word.
// Apps with crud: false skip T04-T07, T09, T10 and T15 and define their own versions.
import { test, expect } from '@playwright/test';
import { apps, TEST_PASSWORD, type AppId } from './apps';
import { apiLoginStatus, apiRegisterStatus, createItem, uniqueEmail, uniqueTitle, withUser } from './auth';
import {
  clickable, editScope, field, loggedInMarker, openItem, passwordField,
  showList, submitIn, uiCreateItem, uiLogin, uiLogout, uiRegister,
} from './ui';

export function defineStandardTests(appId: AppId): void {
  const app = apps[appId];
  const loggedIn = loggedInMarker(appId);

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

  if (app.crud) {
    test('T04 create item via UI', async ({ page }) => {
      await withUser(appId, async (user) => {
        await uiLogin(page, appId, user);
        await uiCreateItem(page, appId, uniqueTitle());
      });
    });

    test('T05 item appears in the list', async ({ page }) => {
      await withUser(appId, async (user) => {
        const { title } = await createItem(appId, user);
        await uiLogin(page, appId, user);
        await showList(page, appId);
        await expect(page.getByText(title).first()).toBeVisible();
      });
    });

    test('T06 edit item and the change shows', async ({ page }) => {
      await withUser(appId, async (user) => {
        const { title } = await createItem(appId, user);
        const newTitle = uniqueTitle('edited');
        await uiLogin(page, appId, user);
        await showList(page, appId);
        await openItem(page, appId, title);
        await clickable(page, app.ui.editItem).click();
        const scope = await editScope(page); // the edit dialog if there is one
        if (app.ui.editReady) await expect(scope.getByRole('button', { name: app.ui.editReady })).toBeVisible();
        const titleInput = field(scope, app.ui.itemTitle);
        await titleInput.fill(newTitle);
        await submitIn(page, titleInput, app.ui.saveItem);
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
        await showList(page, appId);
        await openItem(page, appId, title);
        await clickable(page, app.ui.deleteItem).click();
        if (app.ui.confirmDelete) await clickable(page, app.ui.confirmDelete).click();
        await expect(page.getByText(title)).toHaveCount(0);
      });
    });
  }

  test('T08 log out and the protected view is unreachable', async ({ page }) => {
    await withUser(appId, async (user) => {
      await uiLogin(page, appId, user);
      await uiLogout(page, appId);
      await page.goto(app.pages.list);
      await expect(clickable(page, loggedIn)).toBeHidden();
      // Shown a way to log in instead: a login form, or a "Log in" button/link (public lists, g4).
      await expect(passwordField(page, app.ui.password).or(clickable(page, app.ui.loginButton)).first()).toBeVisible();
    });
  });

  if (app.crud) {
    test('T09 log in again and earlier data is still there', async ({ page }) => {
      await withUser(appId, async (user) => {
        const { title } = await createItem(appId, user);
        await uiLogin(page, appId, user);
        await uiLogout(page, appId);
        await uiLogin(page, appId, user);
        await showList(page, appId);
        await expect(page.getByText(title).first()).toBeVisible();
      });
    });

    // Catches double-escaping (&amp; shown literally) or broken encoding, e.g. after D "sanitises everything".
    test('T10 special characters are shown as typed', async ({ page }) => {
      await withUser(appId, async (user) => {
        const title = `${uniqueTitle('chars')} Ünïcødé & "quotes" it's 🙂`;
        await createItem(appId, user, title);
        await uiLogin(page, appId, user);
        await showList(page, appId);
        await expect(page.getByText(title).first()).toBeVisible();
      });
    });
  }

  // Catches C splitting files and breaking script or stylesheet paths.
  test('T11 no script errors and no broken assets while using the app', async ({ page }) => {
    const origin = new URL(process.env.BASE_URL ?? 'http://invalid').origin;
    const problems: string[] = [];
    page.on('pageerror', (err) => problems.push(`uncaught error: ${err.message}`));
    page.on('response', (res) => {
      const url = new URL(res.url());
      if (url.origin === origin && res.status() >= 400 && /\.(m?js|css)$/.test(url.pathname)) {
        problems.push(`${res.status()} ${url.pathname}`);
      }
    });
    await withUser(appId, async (user) => {
      await uiLogin(page, appId, user);
      await showList(page, appId);
      await page.waitForLoadState('networkidle');
    });
    expect(problems).toEqual([]);
  });

  // Catches D adding Secure cookies (rejected on plain http) or changing how the session is stored.
  test('T12 still logged in after a page reload', async ({ page }) => {
    await withUser(appId, async (user) => {
      await uiLogin(page, appId, user);
      await page.reload();
      await expect(clickable(page, loggedIn)).toBeVisible();
    });
  });

  // API on purpose: the negative path is more reliable there than reading UI error text.
  test('T13 wrong password is rejected and the right one still works', async () => {
    await withUser(appId, async (user) => {
      expect(await apiLoginStatus(appId, user.email, 'Wrong-pass-999!')).toBeGreaterThanOrEqual(400);
      expect(await apiLoginStatus(appId, user.email, user.password)).toBeLessThan(300);
    });
  });

  test('T14 the same e-mail cannot register twice', async () => {
    await withUser(appId, async (user) => {
      expect(await apiRegisterStatus(appId, user.email, TEST_PASSWORD)).toBeGreaterThanOrEqual(400);
    });
  });

  if (app.crud) {
    // Catches over-strict validation added by D that blocks normal use.
    test('T15 a normal 100-character title is still accepted', async ({ page }) => {
      await withUser(appId, async (user) => {
        const title = `${uniqueTitle('long')}-`.padEnd(100, 'x');
        await uiLogin(page, appId, user);
        await uiCreateItem(page, appId, title);
      });
    });
  }
}