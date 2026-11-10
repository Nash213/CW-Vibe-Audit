// tests/lib/ui.ts
// Browser helpers. Wording-tolerant: locators come from the regexes in apps.ts.
import { expect, type Locator, type Page } from '@playwright/test';
import { apps, TEST_PASSWORD, type AppId } from './apps';

/** A button OR a link whose accessible name matches. */
export function clickable(page: Page, name: RegExp): Locator {
  return page.getByRole('button', { name }).or(page.getByRole('link', { name })).first();
}

async function fillAuthForm(
  page: Page,
  appId: AppId,
  mode: 'register' | 'login',
  email: string,
  password: string,
): Promise<void> {
  const { ui, pages } = apps[appId];
  await page.goto(mode === 'register' ? pages.register : pages.login);

  const toggle = mode === 'register' ? ui.switchToRegister : ui.switchToLogin;
  if (toggle) await clickable(page, toggle).click();

  const extras = mode === 'register' ? (ui.extraRegisterFields ?? []) : [];
  for (const field of extras) await page.getByLabel(field.label).fill(field.value);

  await page.getByLabel(ui.email).fill(email);
  await page.getByLabel(ui.password).fill(password);
  await page.getByRole('button', { name: mode === 'register' ? ui.registerButton : ui.loginButton }).click();
}

export async function uiRegister(page: Page, appId: AppId, email: string, password = TEST_PASSWORD): Promise<void> {
  await fillAuthForm(page, appId, 'register', email, password);
}

/** Log in through the form and wait until the logout control shows (= logged in). */
export async function uiLogin(page: Page, appId: AppId, user: { email: string; password: string }): Promise<void> {
  await fillAuthForm(page, appId, 'login', user.email, user.password);
  await expect(clickable(page, apps[appId].ui.logout)).toBeVisible();
}

export async function uiLogout(page: Page, appId: AppId): Promise<void> {
  const logout = clickable(page, apps[appId].ui.logout);
  await logout.click();
  // Wait until we are really logged out. Navigating while the logout request is
  // still in flight made T08 flaky.
  await expect(logout).toBeHidden();
}