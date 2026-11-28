// tests/lib/auth.ts
// Shared by the feature specs AND M4's access probe. Keep it small and boring.
//
// Test-user setup has to survive what request D tends to change in an app, so that a
// changed login scheme is not recorded as a broken feature (see docs/DECISIONS.md):
//   - token moved from the JSON body into a cookie (often Secure, which a plain-HTTP
//     client drops): fall back to the cookies the app set, sent as an explicit Cookie header
//   - CSRF protection (403 mentioning csrf/xsrf): fetch a token the way the app's own
//     pages do, then repeat the request with the token header
//   - rate limit (429): wait once if the app says it is short, otherwise give up
// Every failure here starts with "SETUP(<step>):", so results can tell "the test could
// not log in" apart from "the feature is broken". A failure is never turned into a pass.
import { request, type APIRequestContext, type APIResponse } from '@playwright/test';
import { apps, TEST_PASSWORD, type AppId } from './apps';

export { TEST_PASSWORD };

export interface TestUser {
  email: string;
  password: string;
  api: APIRequestContext; // already logged in (cookie jar, Cookie header or Authorization header)
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

// ------------------------------------------------------------ setup session ---

/** Routes where apps commonly hand out a CSRF token (tried in order, GET). */
const CSRF_ROUTES = ['/api/auth/csrf', '/api/csrf', '/api/csrf-token', '/api/auth/csrf-token', '/csrf-token', '/api/auth/me', '/'];
/** Header names apps commonly read the CSRF token from. All are sent. */
const CSRF_HEADERS = ['X-CSRF-Token', 'X-XSRF-Token', 'CSRF-Token'];
/** Longest rate-limit wait (seconds) worth sitting out once. */
const MAX_RATE_WAIT_S = 65;

class SetupError extends Error {
  constructor(step: string, detail: string) {
    super(`SETUP(${step}): ${detail}`);
  }
}

/** Cookies and headers collected while registering and logging in one test user. */
class Session {
  readonly cookies = new Map<string, string>();
  csrf: string | null = null;
  adapted: string[] = []; // which fallbacks were needed, for the record

  constructor(readonly ctx: APIRequestContext) {}

  absorb(res: APIResponse): void {
    for (const h of res.headersArray()) {
      if (h.name.toLowerCase() !== 'set-cookie') continue;
      const pair = h.value.split(';')[0];
      const eq = pair.indexOf('=');
      if (eq > 0) this.cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  }

  cookieHeader(): string {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  headers(): Record<string, string> {
    const h: Record<string, string> = {};
    if (this.csrf) for (const name of CSRF_HEADERS) h[name] = this.csrf;
    return h;
  }

  async get(url: string): Promise<APIResponse> {
    const res = await this.ctx.get(url, { headers: this.headers(), maxRedirects: 0 });
    this.absorb(res);
    return res;
  }

  /** POST with the CSRF and rate-limit fallbacks. Returns the final response. */
  async post(step: string, url: string, data: unknown): Promise<APIResponse> {
    let res = await this.send(url, data);
    if (res.status() === 403 && /csrf|xsrf/i.test(await res.text()) && !this.csrf) {
      if (!(await this.findCsrf())) throw new SetupError(step, `HTTP 403 CSRF, and no CSRF token found at ${CSRF_ROUTES.join(', ')}`);
      this.adapted.push('csrf');
      res = await this.send(url, data);
    }
    if (res.status() === 429) {
      const wait = retryAfterSeconds(res);
      if (wait === null || wait > MAX_RATE_WAIT_S) {
        throw new SetupError(step, `HTTP 429 rate limited${wait === null ? '' : ` for ${wait}s`}: ${(await res.text()).slice(0, 120)}`);
      }
      this.adapted.push(`rate-wait-${wait}s`);
      await new Promise((r) => setTimeout(r, (wait + 1) * 1000));
      res = await this.send(url, data);
      if (res.status() === 429) throw new SetupError(step, 'HTTP 429 rate limited again after waiting');
    }
    return res;
  }

  private async send(url: string, data: unknown): Promise<APIResponse> {
    const res = await this.ctx.post(url, { data, headers: this.headers() });
    this.absorb(res);
    return res;
  }

  /** Get a CSRF token like the app's own pages would: a JSON field or a cookie. */
  private async findCsrf(): Promise<boolean> {
    for (const route of CSRF_ROUTES) {
      const res = await this.get(route).catch(() => null);
      if (!res) continue;
      const body = await res.json().catch(() => null);
      const fromBody = findCsrfField(body);
      const fromCookie = [...this.cookies].find(([k]) => /csrf|xsrf/i.test(k))?.[1];
      const token = fromBody ?? (fromCookie ? decodeURIComponent(fromCookie) : undefined);
      if (token) {
        this.csrf = token;
        return true;
      }
    }
    return false;
  }
}

function findCsrfField(body: unknown, depth = 0): string | undefined {
  if (!body || typeof body !== 'object' || depth > 2) return undefined;
  for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
    if (/csrf|xsrf/i.test(k) && typeof v === 'string' && v) return v;
    const inner = findCsrfField(v, depth + 1);
    if (inner) return inner;
  }
  return undefined;
}

function retryAfterSeconds(res: APIResponse): number | null {
  const h = res.headers();
  for (const name of ['retry-after', 'ratelimit-reset', 'x-ratelimit-reset']) {
    const v = Number(h[name]);
    if (Number.isFinite(v) && v >= 0) return v > 1e9 ? Math.max(0, Math.ceil(v - Date.now() / 1000)) : Math.ceil(v);
  }
  return null;
}

// ------------------------------------------------------------------ users ---

/** Register + log in through the API. Caller must dispose user.api (or use withUser). */
export async function createUser(appId: AppId): Promise<TestUser> {
  const cfg = apps[appId].api;
  const email = uniqueEmail();
  const password = TEST_PASSWORD;
  const ctx = await request.newContext({ baseURL: baseURL() });
  const s = new Session(ctx);
  try {
    const reg = await s.post('register', cfg.register, cfg.registerBody(email, password));
    if (!reg.ok()) throw new SetupError('register', await failure('register', reg));

    const login = await s.post('login', cfg.login, cfg.loginBody(email, password));
    if (!login.ok()) throw new SetupError('login', await failure('login', login));

    const token = cfg.authStyle === 'bearer' ? (await login.json().catch(() => ({})))[cfg.tokenField ?? 'token'] : undefined;
    const headers = s.headers();

    if (typeof token === 'string' && token) {
      headers.Authorization = `Bearer ${token}`;
    } else if (cfg.authStyle === 'cookie' && !s.csrf) {
      return { email, password, api: ctx }; // unchanged baseline path: the jar keeps the cookie
    } else {
      // Cookie login (configured, or the token moved out of the body). Send the cookies the
      // app set explicitly, so a Secure cookie is not dropped over plain HTTP.
      if (s.cookies.size === 0) {
        throw new SetupError('login', `login response has no ${cfg.tokenField ?? 'token'} field and set no cookie`);
      }
      if (cfg.authStyle === 'bearer') s.adapted.push('cookie-login');
      headers.Cookie = s.cookieHeader();
    }
    const authed = await request.newContext({ baseURL: baseURL(), extraHTTPHeaders: headers });
    await ctx.dispose();
    return { email, password, api: authed };
  } catch (err) {
    await ctx.dispose();
    throw err instanceof SetupError ? err : new SetupError('user', String(err).slice(0, 200));
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

/** Create one item through the API as this user. A failure here is the app's, not setup's. */
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
    return (await new Session(ctx).post('login', cfg.login, cfg.loginBody(email, password))).status();
  } finally {
    await ctx.dispose();
  }
}

/** HTTP status of an API registration with these credentials (used by T14). */
export async function apiRegisterStatus(appId: AppId, email: string, password: string): Promise<number> {
  const cfg = apps[appId].api;
  const ctx = await request.newContext({ baseURL: baseURL() });
  try {
    return (await new Session(ctx).post('register', cfg.register, cfg.registerBody(email, password))).status();
  } finally {
    await ctx.dispose();
  }
}