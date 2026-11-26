// tests/lib/ui.ts
// Browser helpers. Wording-tolerant: locators come from the regexes in apps.ts.
import { expect, type Locator, type Page } from '@playwright/test';
import { apps, TEST_PASSWORD, type AppId } from './apps';

type Scope = Page | Locator;

/** A button OR a link whose accessible name matches. */
export function clickable(scope: Scope, name: RegExp): Locator {
  return scope.getByRole('button', { name }).or(scope.getByRole('link', { name })).first();
}

/** First VISIBLE match. getByLabel/getByPlaceholder also match hidden inputs (e.g. a closed modal). */
export function visible(locator: Locator): Locator {
  return locator.filter({ visible: true }).first();
}

/** An input found by its label OR its placeholder. */
export function field(scope: Scope, name: RegExp): Locator {
  return visible(scope.getByLabel(name).or(scope.getByPlaceholder(name)));
}

/** E-mail input: label, placeholder, or failing both, the first e-mail input. */
export function emailField(scope: Scope, name: RegExp): Locator {
  return visible(scope.getByLabel(name).or(scope.getByPlaceholder(name)).or(scope.locator('input[type="email"]')));
}

/** Password input: label, placeholder, or failing both, the first password input (in page order). */
export function passwordField(scope: Scope, name: RegExp): Locator {
  return visible(scope.getByLabel(name).or(scope.getByPlaceholder(name)).or(scope.locator('input[type="password"]')));
}

/**
 * Click the submit button that belongs to the same form as `inside`.
 * Apps often have two buttons with the same name (a tab and a submit, or a nav
 * "Log In" next to the form's "Sign In"); the form decides which one we mean.
 */
export async function submitIn(page: Page, inside: Locator, name: RegExp): Promise<void> {
  const form = inside.locator('xpath=ancestor::form[1]');
  if ((await form.count()) > 0) {
    await form.getByRole('button', { name }).first().click();
  } else {
    await visible(page.getByRole('button', { name })).click();
  }
}

/** The control that shows we are logged in. */
export function loggedInMarker(appId: AppId): RegExp {
  const { ui } = apps[appId];
  return ui.loggedIn ?? ui.logout;
}

/**
 * Where the edit form lives after clicking Edit: an open dialog if the app uses one,
 * otherwise the whole page (inline editing). Wording-free, so it survives restyling.
 */
export async function editScope(page: Page): Promise<Page | Locator> {
  const dialog = page.getByRole('dialog').filter({ visible: true }).first();
  try {
    await dialog.waitFor({ state: 'visible', timeout: 2_000 });
    return dialog;
  } catch {
    return page;
  }
}

/** Make the item's Edit/Delete controls reachable: click its title if they are not on the list. */
export async function openItem(page: Page, appId: AppId, title: string): Promise<void> {
  await expect(page.getByText(title).first()).toBeVisible();
  if (!(await clickable(page, apps[appId].ui.editItem).isVisible())) {
    await page.getByText(title).first().click(); // e.g. g4: edit/delete are on the post page
    await expect(page.getByText(title).first()).toBeVisible();
  }
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

  const steps = (mode === 'register' ? ui.switchToRegister : ui.switchToLogin) ?? [];
  for (const step of steps) await clickable(page, step).click();

  if (mode === 'register') {
    for (const extra of ui.extraRegisterFields ?? []) await field(page, extra.label).fill(extra.value);
  }
  const emailInput = emailField(page, ui.email);
  await emailInput.fill(email);
  await passwordField(page, ui.password).fill(password);
  await submitIn(page, emailInput, mode === 'register' ? ui.registerButton : ui.loginButton);
}

export async function uiRegister(page: Page, appId: AppId, email: string, password = TEST_PASSWORD): Promise<void> {
  await fillAuthForm(page, appId, 'register', email, password);
}

/** Log in through the form and wait until the logged-in marker shows. */
export async function uiLogin(page: Page, appId: AppId, user: { email: string; password: string }): Promise<void> {
  await fillAuthForm(page, appId, 'login', user.email, user.password);
  await expect(clickable(page, loggedInMarker(appId))).toBeVisible();
}

export async function uiLogout(page: Page, appId: AppId): Promise<void> {
  const { ui } = apps[appId];
  if (ui.openUserMenu) await clickable(page, ui.openUserMenu).click();
  await clickable(page, ui.logout).click();
  // Wait until we are really logged out; navigating while logout is in flight made T08 flaky.
  await expect(clickable(page, loggedInMarker(appId))).toBeHidden();
}

/**
 * Show the item list. Once logged in, apps with `ui.listNav` are navigated inside the page,
 * because a full page load drops a login kept only in memory (g0). Everyone else: page.goto.
 */
export async function showList(page: Page, appId: AppId): Promise<void> {
  const { ui, pages } = apps[appId];
  if (ui.listNav && (await clickable(page, loggedInMarker(appId)).isVisible())) {
    await clickable(page, ui.listNav).click();
  } else {
    await page.goto(pages.list);
  }
}

/** Create an item through the UI and wait until its title shows. */
export async function uiCreateItem(page: Page, appId: AppId, title: string): Promise<void> {
  const { ui } = apps[appId];
  await showList(page, appId);
  if (ui.addItem) await clickable(page, ui.addItem).click();
  const titleInput = field(page, ui.itemTitle);
  await titleInput.fill(title);
  for (const extra of ui.extraItemFields ?? []) await field(page, extra.label).fill(extra.value);
  await submitIn(page, titleInput, ui.saveItem);
  await expect(page.getByText(title).first()).toBeVisible();
}