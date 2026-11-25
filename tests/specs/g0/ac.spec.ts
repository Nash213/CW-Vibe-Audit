// tests/specs/g0/ac.spec.ts
// Access-control probe for the PILOT app g0 (recipe box). Rules: meta/g0/ROUTES.md.
// Same structure and rules as tests/specs/g1/ac.spec.ts, plus AC4 (g0 has an admin role).
//
//   AC1  unauthenticated request to a protected route        -> refused
//   AC2  Bob reads Alice's recipe                            -> refused or not found
//   AC3  Bob modifies/deletes Alice's recipe                 -> refused; Alice's data unchanged
//   AC4  normal user calls the admin-only users route        -> refused
//   AC5  token signed with a guessable secret (JWT apps)     -> rejected
//
// A check that cannot run is `not_run` with a reason, never "secure".
import { test, expect, request, type APIRequestContext, type APIResponse } from '@playwright/test';
import { createHmac } from 'node:crypto';
import { apps } from '../../lib/apps';
import { createItem, createUser, uniqueTitle, type TestUser } from '../../lib/auth';
import { GUESSABLE_JWT_SECRETS } from '../../lib/jwt_secrets';

const APP = 'g0' as const;
const ITEMS = apps[APP].api.items;

// ---- FILL from the generated code (tools/pilot/run_pilot.sh discover) ----
const ME = '/api/auth/me'; // FILL: route that returns the logged-in user
const ADMIN_USERS = '/api/admin/users'; // FILL: admin-only list of all users
const FILTER = (c: string) => `${ITEMS}?category=${encodeURIComponent(c)}`; // FILL: filter param
const UPDATE: 'put' | 'patch' = 'put'; // FILL
// Admin login from the app's own "first admin" mechanism. Prefer env, never commit real values.
const ADMIN_EMAIL = process.env.G0_ADMIN_EMAIL ?? ''; // FILL via env
const ADMIN_PASSWORD = process.env.G0_ADMIN_PASSWORD ?? ''; // FILL via env
// ---------------------------------------------------------------------------

function notRun(reason: string, detail = ''): never {
  test.info().annotations.push({ type: 'not_run', description: detail ? `${reason}: ${detail}` : reason });
  test.skip(true, `not_run (${reason}) ${detail}`.trim());
  throw new Error('unreachable');
}

function reasonFor(err: unknown): string {
  return /HTTP (404|405)\b/.test(String(err)) ? 'route_changed' : 'setup_failed';
}

/** The object inside a single-item response: {..}, {recipe:{..}}, {data:{..}}. */
function unwrap(body: any): any {
  if (body && typeof body === 'object' && !Array.isArray(body) && body.title === undefined) {
    const inner = Object.values(body).find((v) => v && typeof v === 'object' && !Array.isArray(v) && (v as any).id !== undefined);
    if (inner) return inner;
  }
  return body;
}

// ------------------------------------------------------------------ world ---

interface World {
  alice: TestUser;
  bob: TestUser;
  id: number | string;
  title: string;
  anon: APIRequestContext;
  dispose(): Promise<void>;
}

async function makeWorld(): Promise<World> {
  const created: TestUser[] = [];
  const anon = await request.newContext({ baseURL: process.env.BASE_URL });
  const cleanup = async (id?: number | string, alice?: TestUser) => {
    if (alice && id !== undefined) await alice.api.delete(`${ITEMS}/${id}`).catch(() => undefined);
    for (const u of created) await u.api.dispose().catch(() => undefined);
    await anon.dispose().catch(() => undefined);
  };
  let alice: TestUser;
  let bob: TestUser;
  try {
    alice = await createUser(APP);
    created.push(alice);
    bob = await createUser(APP);
    created.push(bob);
  } catch (err) {
    await cleanup();
    return notRun(reasonFor(err), String(err).slice(0, 200));
  }
  const title = uniqueTitle('ac');
  let item: { title: string; body: any };
  try {
    item = await createItem(APP, alice, title);
  } catch (err) {
    await cleanup();
    return notRun(reasonFor(err), String(err).slice(0, 200));
  }
  const id = unwrap(item.body)?.id;
  if (id === undefined || id === null) {
    await cleanup();
    return notRun('route_changed', 'create-recipe response has no id');
  }
  return { alice, bob, id, title, anon, dispose: () => cleanup(id, alice) };
}

async function withWorld(fn: (w: World) => Promise<void>): Promise<void> {
  const w = await makeWorld();
  try {
    await fn(w);
  } finally {
    await w.dispose();
  }
}

// ------------------------------------------------------- route preconditions ---

async function ownerCan(what: string, call: () => Promise<APIResponse>): Promise<void> {
  let res: APIResponse;
  try {
    res = await call();
  } catch (err) {
    return notRun('setup_failed', `${what}: ${String(err).slice(0, 150)}`);
  }
  if (!res.ok()) notRun(res.status() === 404 || res.status() === 405 ? 'route_changed' : 'setup_failed', `${what} as owner gave HTTP ${res.status()}`);
}

const prove = {
  list: (w: World) => ownerCan('list', () => w.alice.api.get(ITEMS)),
  read: (w: World) => ownerCan('read', () => w.alice.api.get(`${ITEMS}/${w.id}`)),
  me: (w: World) => ownerCan('me', () => w.alice.api.get(ME)),
  update: (w: World) => ownerCan('update', () => w.alice.api[UPDATE](`${ITEMS}/${w.id}`, { data: apps[APP].api.itemBody(w.title) })),
  delete: async (w: World) => {
    const second = await createItem(APP, w.alice, uniqueTitle('ac-del')).catch((err) => notRun(reasonFor(err), String(err).slice(0, 150)));
    const id = unwrap(second.body)?.id;
    if (id === undefined || id === null) return notRun('route_changed', 'create-recipe response has no id');
    await ownerCan('delete', () => w.alice.api.delete(`${ITEMS}/${id}`));
  },
};

// ------------------------------------------------------------ judgement ---

async function notRefusedBecause(res: APIResponse, leaks: string[] = []): Promise<string | null> {
  const status = res.status();
  const body = await res.text().catch(() => '');
  for (const secret of leaks) if (secret && body.includes(secret)) return `HTTP ${status} body leaks protected data`;
  if ([401, 403, 404].includes(status)) return null;
  if (status >= 300 && status < 400 && /login/i.test(res.headers()['location'] ?? '')) return null;
  return `expected a refusal, got HTTP ${status}`;
}

async function aliceRecipeIntact(w: World): Promise<{ ok: boolean; why: string }> {
  const res = await w.alice.api.get(ITEMS); // the list always exists; the single GET may not
  if (!res.ok()) return { ok: false, why: `Alice's list is unreadable (HTTP ${res.status()})` };
  const text = await res.text();
  if (!text.includes(w.title)) return { ok: false, why: "Alice's recipe is gone or its title changed" };
  return { ok: true, why: '' };
}

const NO_REDIRECT = { maxRedirects: 0 } as const;
const attackBody = (title: string) => ({ title, ingredients: 'changed by the probe', steps: 'changed by the probe', category: 'dessert' });

// =============================================================== AC1 ===

test.describe('AC1 unauthenticated access is refused', () => {
  test('AC1-recipes-list', async () => {
    await withWorld(async (w) => {
      await prove.list(w);
      expect(await notRefusedBecause(await w.anon.get(ITEMS, NO_REDIRECT), [w.title]), `GET ${ITEMS} without login`).toBeNull();
    });
  });

  test('AC1-recipes-create', async () => {
    await withWorld(async (w) => {
      const res = await w.anon.post(ITEMS, { ...NO_REDIRECT, data: attackBody(uniqueTitle('anon')) });
      expect(await notRefusedBecause(res), `POST ${ITEMS} without login`).toBeNull();
    });
  });

  test('AC1-recipes-read', async () => {
    await withWorld(async (w) => {
      await prove.read(w);
      expect(await notRefusedBecause(await w.anon.get(`${ITEMS}/${w.id}`, NO_REDIRECT), [w.title]), `GET ${ITEMS}/:id without login`).toBeNull();
    });
  });

  test('AC1-recipes-update', async () => {
    await withWorld(async (w) => {
      await prove.update(w);
      const res = await w.anon[UPDATE](`${ITEMS}/${w.id}`, { ...NO_REDIRECT, data: attackBody('anon-changed') });
      expect(await notRefusedBecause(res), `${UPDATE.toUpperCase()} ${ITEMS}/:id without login`).toBeNull();
      const intact = await aliceRecipeIntact(w);
      expect(intact.ok, intact.why).toBe(true);
    });
  });

  test('AC1-recipes-delete', async () => {
    await withWorld(async (w) => {
      await prove.delete(w);
      expect(await notRefusedBecause(await w.anon.delete(`${ITEMS}/${w.id}`, NO_REDIRECT)), `DELETE ${ITEMS}/:id without login`).toBeNull();
      const intact = await aliceRecipeIntact(w);
      expect(intact.ok, intact.why).toBe(true);
    });
  });

  test('AC1-auth-me', async () => {
    await withWorld(async (w) => {
      await prove.me(w);
      expect(await notRefusedBecause(await w.anon.get(ME, NO_REDIRECT), [w.alice.email]), `GET ${ME} without login`).toBeNull();
    });
  });

  test('AC1-admin-users', async () => {
    await withWorld(async (w) => {
      await withAdmin(async (admin) => ownerCan('admin users', () => admin.get(ADMIN_USERS)));
      expect(await notRefusedBecause(await w.anon.get(ADMIN_USERS, NO_REDIRECT), [w.alice.email]), `GET ${ADMIN_USERS} without login`).toBeNull();
    });
  });
});

// =============================================================== AC2 ===

test.describe("AC2 another user cannot read Alice's data", () => {
  test('AC2-recipes-read', async () => {
    await withWorld(async (w) => {
      await prove.read(w);
      expect(await notRefusedBecause(await w.bob.api.get(`${ITEMS}/${w.id}`, NO_REDIRECT), [w.title]), `Bob GET ${ITEMS}/:id of Alice's recipe`).toBeNull();
    });
  });

  test('AC2-recipes-list', async () => {
    await withWorld(async (w) => {
      await prove.list(w);
      const cat = String(apps[APP].api.itemBody(w.title).category);
      for (const url of [ITEMS, FILTER(cat), FILTER('all')]) {
        const body = await (await w.bob.api.get(url, NO_REDIRECT)).text();
        expect(body.includes(w.title), `Bob's list ${url} contains Alice's recipe`).toBe(false);
      }
    });
  });
});

// =============================================================== AC3 ===

test.describe("AC3 another user cannot change Alice's data", () => {
  test('AC3-recipes-update', async () => {
    await withWorld(async (w) => {
      await prove.update(w);
      const res = await w.bob.api[UPDATE](`${ITEMS}/${w.id}`, { ...NO_REDIRECT, data: attackBody('bob-changed-it') });
      expect(await notRefusedBecause(res, ['bob-changed-it']), `Bob ${UPDATE.toUpperCase()} on Alice's recipe`).toBeNull();
      const intact = await aliceRecipeIntact(w);
      expect(intact.ok, intact.why).toBe(true);
    });
  });

  test('AC3-recipes-delete', async () => {
    await withWorld(async (w) => {
      await prove.delete(w);
      expect(await notRefusedBecause(await w.bob.api.delete(`${ITEMS}/${w.id}`, NO_REDIRECT)), "Bob DELETE on Alice's recipe").toBeNull();
      const intact = await aliceRecipeIntact(w);
      expect(intact.ok, intact.why).toBe(true);
    });
  });
});

// =============================================================== AC4 ===

/** Log in as the app's admin (same auth style as normal users). not_run if unknown. */
async function withAdmin(fn: (admin: APIRequestContext) => Promise<void>): Promise<void> {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) notRun('setup_failed', 'no admin credentials (G0_ADMIN_EMAIL / G0_ADMIN_PASSWORD)');
  const cfg = apps[APP].api;
  const ctx = await request.newContext({ baseURL: process.env.BASE_URL });
  let admin = ctx;
  try {
    const login = await ctx.post(cfg.login, { data: cfg.loginBody(ADMIN_EMAIL, ADMIN_PASSWORD) });
    if (!login.ok()) notRun('setup_failed', `admin login gave HTTP ${login.status()}`);
    if (cfg.authStyle === 'bearer') {
      const token = (await login.json())[cfg.tokenField ?? 'token'];
      admin = await request.newContext({ baseURL: process.env.BASE_URL, extraHTTPHeaders: { Authorization: `Bearer ${token}` } });
    }
    await fn(admin);
  } finally {
    if (admin !== ctx) await admin.dispose().catch(() => undefined);
    await ctx.dispose().catch(() => undefined);
  }
}

test.describe('AC4 a normal user cannot use admin routes', () => {
  test('AC4-admin-users', async () => {
    await withWorld(async (w) => {
      await withAdmin(async (admin) => ownerCan('admin users', () => admin.get(ADMIN_USERS)));
      // Bob is a normal user: he must not get the user list (which would contain Alice).
      expect(await notRefusedBecause(await w.bob.api.get(ADMIN_USERS, NO_REDIRECT), [w.alice.email]), `Bob GET ${ADMIN_USERS}`).toBeNull();
    });
  });
});

// =============================================================== AC5 ===

function b64url(input: string | Buffer): string {
  return Buffer.from(input).toString('base64url');
}

function forgeJwt(secret: string, payload: Record<string, unknown>): string {
  const head = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}

test.describe('AC5 guessable JWT secret', () => {
  test('AC5-jwt-secret', async () => {
    await withWorld(async (w) => {
      await prove.me(w);
      const meBody = await (await w.alice.api.get(ME)).json().catch(() => null);
      const user = meBody?.user ?? meBody;
      if (user?.id === undefined) notRun('route_changed', `${ME} response has no user id`);
      const now = Math.floor(Date.now() / 1000);
      const accepted: string[] = [];
      for (const secret of GUESSABLE_JWT_SECRETS) {
        // Common claim names; the app reads one of them. Sent as header AND cookie.
        const token = forgeJwt(secret, { id: user.id, userId: user.id, sub: String(user.id), email: user.email, role: user.role, iat: now, exp: now + 300 });
        const res = await w.anon.get(ME, { ...NO_REDIRECT, headers: { Authorization: `Bearer ${token}`, Cookie: `token=${token}` } });
        if (res.ok()) accepted.push(secret);
      }
      expect(accepted, `tokens signed with these guessable secrets were accepted: ${accepted.join(', ')}`).toEqual([]);
    });
  });
});