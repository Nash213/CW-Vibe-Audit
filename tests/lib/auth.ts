// tests/lib/auth.ts
// Shared by the feature specs AND M4's access probe. Keep it small and boring.
import { request, type APIRequestContext, type APIResponse } from '@playwright/test';
import { apps, TEST_PASSWORD, type AppId } from './apps';

export { TEST_PASSWORD };

export interface TestUser {
  email: string;
  password: string;
  api: APIRequestContext; // already logged in (cookie jar or Authorization header)
}

function baseURL(): string {
  const url = process.env.BASE_URL;
  if (!url) throw new Error('BASE_URL is not set');
  return url;
}

function rand(n: number): string {
  return Math.random().toString(36).slice(2, 2 + n);
}

export function uniqueEmail(prefix = 'm2'): string {
  return `${prefix}-${Date.now()}-${rand(6)}@example.test`;
}

export function uniqueTitle(prefix = 'item'): string {
  return `${prefix}-${Date.now()}-${rand(4)}`;
}

async function failure(what: string, res: APIResponse): Promise<string> {
  // Never include the request body: it holds the password.
  return `${what} failed: HTTP ${res.status()} ${(await res.text()).slice(0, 200)}`;
}

/** Register + log in through the API. Caller must dispose user.api (or use withUser). */
export async function createUser(appId: AppId): Promise<TestUser> {
  const cfg = apps[appId].api;
  const email = uniqueEmail();
  const password = TEST_PASSWORD;
  const ctx = await request.newContext({ baseURL: baseURL() });
  try {
    const reg = await ctx.post(cfg.register, { data: cfg.registerBody(email, password) });
    if (!reg.ok()) throw new Error(await failure('register', reg));

    const login = await ctx.post(cfg.login, { data: cfg.loginBody(email, password) });
    if (!login.ok()) throw new Error(await failure('login', login));

    if (cfg.authStyle === 'cookie') return { email, password, api: ctx }; // jar keeps the cookie

    const token = (await login.json())[cfg.tokenField ?? 'token'];
    if (typeof token !== 'string') throw new Error('login response has no token field');
    const authed = await request.newContext({
      baseURL: baseURL(),
      extraHTTPHeaders: { Authorization: `Bearer ${token}` },
    });
    await ctx.dispose();
    return { email, password, api: authed };
  } catch (err) {
    await ctx.dispose();
    throw err;
  }
}

/** Create a user, run fn, always dispose. Preferred over calling createUser directly. */
export async function withUser<T>(appId: AppId, fn: (user: TestUser) => Promise<T>): Promise<T> {
  const user = await createUser(appId);
  try {
    return await fn(user);
  } finally {
    await user.api.dispose();
  }
}

/** Create one item through the API as this user. */
export async function createItem(
  appId: AppId,
  user: TestUser,
  title: string = uniqueTitle(),
): Promise<{ title: string; body: any }> {
  const cfg = apps[appId].api;
  const res = await user.api.post(cfg.items, { data: cfg.itemBody(title) });
  if (!res.ok()) throw new Error(await failure('create item', res));
  return { title, body: await res.json().catch(() => null) };
}

/** HTTP status of an API login with these credentials (used to prove a UI sign-up worked). */
export async function apiLoginStatus(appId: AppId, email: string, password: string): Promise<number> {
  const cfg = apps[appId].api;
  const ctx = await request.newContext({ baseURL: baseURL() });
  try {
    const res = await ctx.post(cfg.login, { data: cfg.loginBody(email, password) });
    return res.status();
  } finally {
    await ctx.dispose();
  }
}