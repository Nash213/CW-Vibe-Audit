// tests/specs/g1/ac.spec.ts
// Access-control probe for g1 (TaskFlow). Rules: meta/g1/ROUTES.md.
//
//   AC1  unauthenticated request to a protected route        -> refused
//   AC2  Bob reads Alice's resource by id                    -> refused or not found
//   AC3  Bob modifies/deletes Alice's resource by id         -> refused; Alice's data unchanged
//   AC4  normal user calls an admin-only route               -> not applicable (g1 has no roles)
//   AC5  token signed with a guessable secret                -> rejected
//
// Test ids look like "AC2-tasks-read": check, then route or resource.
//
// Rules this file follows:
//  * Alice and Bob are two users of the SAME role, each created through the API
//    with a unique email, so a role-only check is caught.
//  * Every test makes its own users and cleans up after itself, so one failing
//    test cannot cascade and a second run gives the same result.
//  * A test that cannot run (set-up failed, route renamed or removed) is NOT
//    "secure". It is annotated `not_run` with a reason and skipped. The triage
//    script must count not_run separately and report how many could not run.
//  * Only our own app on localhost with throw-away test users (BASE_URL).
import { test, expect, request, type APIRequestContext, type APIResponse } from '@playwright/test';
import { createHmac } from 'node:crypto';
import { apps } from '../../lib/apps';
import { createItem, createUser, uniqueTitle, type TestUser } from '../../lib/auth';
import { GUESSABLE_JWT_SECRETS } from '../../lib/jwt_secrets';

const APP = 'g1' as const;
const ITEMS = apps[APP].api.items; // /api/tasks
const ME = '/api/auth/me';

// ---------------------------------------------------------------- not_run ---

function notRun(reason: string, detail = ''): never {
  test.info().annotations.push({ type: 'not_run', description: detail ? `${reason}: ${detail}` : reason });
  test.skip(true, `not_run (${reason}) ${detail}`.trim());
  throw new Error('unreachable'); // test.skip(true) already aborted the test
}

// A 404/405 while setting up means the baseline route is gone: route_changed.
function reasonFor(err: unknown): string {
  return /HTTP (404|405)\b/.test(String(err)) ? 'route_changed' : 'setup_failed';
}

// ------------------------------------------------------------------ world ---

interface World {
  alice: TestUser;
  bob: TestUser;
  taskId: number | string;
  taskTitle: string;
  anon: APIRequestContext; // no cookies, no token
  dispose(): Promise<void>;
}

/** Create Alice, Bob and one task owned by Alice. Always call dispose(). */
async function makeWorld(): Promise<World> {
  const created: TestUser[] = [];
  const baseURL = process.env.BASE_URL;
  const anon = await request.newContext({ baseURL });
  const cleanup = async (taskId?: number | string, alice?: TestUser) => {
    if (alice && taskId !== undefined) await alice.api.delete(`${ITEMS}/${taskId}`).catch(() => undefined);
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

  const taskTitle = uniqueTitle('ac');
  let item: { title: string; body: any };
  try {
    item = await createItem(APP, alice, taskTitle);
  } catch (err) {
    await cleanup();
    return notRun(reasonFor(err), String(err).slice(0, 200));
  }
  const taskId = item.body?.id;
  if (taskId === undefined || taskId === null) {
    await cleanup();
    return notRun('route_changed', 'create-task response has no id');
  }
  return {
    alice,
    bob,
    taskId,
    taskTitle,
    anon,
    dispose: () => cleanup(taskId, alice),
  };
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
// A refusal only means something if the route exists. Each helper proves, as the
// legitimate owner, that the route works; otherwise the test is not_run.

async function ownerCan(w: World, what: string, call: () => Promise<APIResponse>): Promise<void> {
  let res: APIResponse;
  try {
    res = await call();
  } catch (err) {
    return notRun('setup_failed', `${what}: ${String(err).slice(0, 150)}`);
  }
  if (!res.ok()) notRun(res.status() === 404 || res.status() === 405 ? 'route_changed' : 'setup_failed', `${what} as owner gave HTTP ${res.status()}`);
}

const prove = {
  list: (w: World) => ownerCan(w, 'list', () => w.alice.api.get(ITEMS)),
  read: (w: World) => ownerCan(w, 'read', () => w.alice.api.get(`${ITEMS}/${w.taskId}`)),
  me: (w: World) => ownerCan(w, 'me', () => w.alice.api.get(ME)),
  // Same values, so a successful PUT changes nothing.
  update: (w: World) =>
    ownerCan(w, 'update', () => w.alice.api.put(`${ITEMS}/${w.taskId}`, { data: apps[APP].api.itemBody(w.taskTitle) })),
  // Alice creates and deletes a second task, so the delete route is proven without
  // touching the task the attacker will aim at.
  delete: async (w: World) => {
    const second = await createItem(APP, w.alice, uniqueTitle('ac-del')).catch((err) => notRun(reasonFor(err), String(err).slice(0, 150)));
    const id = second.body?.id;
    if (id === undefined || id === null) return notRun('route_changed', 'create-task response has no id');
    await ownerCan(w, 'delete', () => w.alice.api.delete(`${ITEMS}/${id}`));
  },
};

// ------------------------------------------------------------ judgement ---

/** null = refused (secure). A string = why it was NOT refused. */
async function notRefusedBecause(res: APIResponse, leaks: string[] = []): Promise<string | null> {
  const status = res.status();
  const body = await res.text().catch(() => '');
  for (const secret of leaks) if (secret && body.includes(secret)) return `HTTP ${status} body leaks Alice's data`;
  if ([401, 403, 404].includes(status)) return null;
  if (status >= 300 && status < 400 && /login/i.test(res.headers()['location'] ?? '')) return null;
  return `expected a refusal, got HTTP ${status}`;
}

async function aliceTaskIntact(w: World): Promise<{ ok: boolean; why: string }> {
  const res = await w.alice.api.get(`${ITEMS}/${w.taskId}`);
  if (!res.ok()) return { ok: false, why: `Alice's task is gone or unreadable (HTTP ${res.status()})` };
  const body = await res.json().catch(() => null);
  if (body?.title !== w.taskTitle) return { ok: false, why: `Alice's task title changed to ${JSON.stringify(body?.title)}` };
  if (body?.status !== apps[APP].api.itemBody(w.taskTitle).status) {
    return { ok: false, why: `Alice's task status changed to ${JSON.stringify(body?.status)}` };
  }
  return { ok: true, why: '' };
}

const NO_REDIRECT = { maxRedirects: 0 } as const;
const attackBody = (title: string) => ({ title, description: 'changed by the probe', status: 'done' });

// =============================================================== AC1 ===
// Unauthenticated request to each protected route.

test.describe('AC1 unauthenticated access is refused', () => {
  test('AC1-tasks-list', async () => {
    await withWorld(async (w) => {
      await prove.list(w);
      const res = await w.anon.get(ITEMS, NO_REDIRECT);
      expect(await notRefusedBecause(res, [w.taskTitle]), 'GET /api/tasks without login').toBeNull();
    });
  });

  test('AC1-tasks-create', async () => {
    await withWorld(async (w) => {
      const res = await w.anon.post(ITEMS, { ...NO_REDIRECT, data: attackBody(uniqueTitle('anon')) });
      expect(await notRefusedBecause(res), 'POST /api/tasks without login').toBeNull();
    });
  });

  test('AC1-tasks-read', async () => {
    await withWorld(async (w) => {
      await prove.read(w);
      const res = await w.anon.get(`${ITEMS}/${w.taskId}`, NO_REDIRECT);
      expect(await notRefusedBecause(res, [w.taskTitle]), 'GET /api/tasks/:id without login').toBeNull();
    });
  });

  test('AC1-tasks-update', async () => {
    await withWorld(async (w) => {
      await prove.update(w);
      const res = await w.anon.put(`${ITEMS}/${w.taskId}`, { ...NO_REDIRECT, data: attackBody('anon-changed') });
      expect(await notRefusedBecause(res), 'PUT /api/tasks/:id without login').toBeNull();
      const intact = await aliceTaskIntact(w);
      expect(intact.ok, intact.why).toBe(true);
    });
  });

  test('AC1-tasks-delete', async () => {
    await withWorld(async (w) => {
      await prove.delete(w);
      const res = await w.anon.delete(`${ITEMS}/${w.taskId}`, NO_REDIRECT);
      expect(await notRefusedBecause(res), 'DELETE /api/tasks/:id without login').toBeNull();
      const intact = await aliceTaskIntact(w);
      expect(intact.ok, intact.why).toBe(true);
    });
  });

  test('AC1-auth-me', async () => {
    await withWorld(async (w) => {
      await prove.me(w);
      const res = await w.anon.get(ME, NO_REDIRECT);
      expect(await notRefusedBecause(res, [w.alice.email]), 'GET /api/auth/me without login').toBeNull();
    });
  });
});

// =============================================================== AC2 ===
// Bob reads Alice's resource by id.

test.describe("AC2 another user cannot read Alice's data", () => {
  test('AC2-tasks-read', async () => {
    await withWorld(async (w) => {
      await prove.read(w);
      const res = await w.bob.api.get(`${ITEMS}/${w.taskId}`, NO_REDIRECT);
      expect(await notRefusedBecause(res, [w.taskTitle]), "Bob GET /api/tasks/:id of Alice's task").toBeNull();
    });
  });

  test('AC2-tasks-list', async () => {
    await withWorld(async (w) => {
      await prove.list(w);
      // Plain list and the filtered list: Alice's task must never show up for Bob.
      for (const url of [ITEMS, `${ITEMS}?status=all`, `${ITEMS}?status=to%20do`]) {
        const res = await w.bob.api.get(url, NO_REDIRECT);
        const body = await res.text();
        expect(body.includes(w.taskTitle), `Bob's list ${url} contains Alice's task`).toBe(false);
      }
    });
  });
});

// =============================================================== AC3 ===
// Bob modifies or deletes Alice's resource by id. Alice's data stays unchanged.

test.describe("AC3 another user cannot change Alice's data", () => {
  test('AC3-tasks-update', async () => {
    await withWorld(async (w) => {
      await prove.update(w);
      const res = await w.bob.api.put(`${ITEMS}/${w.taskId}`, { ...NO_REDIRECT, data: attackBody('bob-changed-it') });
      expect(await notRefusedBecause(res, ['bob-changed-it']), "Bob PUT /api/tasks/:id on Alice's task").toBeNull();
      const intact = await aliceTaskIntact(w);
      expect(intact.ok, intact.why).toBe(true);
    });
  });

  test('AC3-tasks-delete', async () => {
    await withWorld(async (w) => {
      await prove.delete(w);
      const res = await w.bob.api.delete(`${ITEMS}/${w.taskId}`, NO_REDIRECT);
      expect(await notRefusedBecause(res), "Bob DELETE /api/tasks/:id on Alice's task").toBeNull();
      const intact = await aliceTaskIntact(w);
      expect(intact.ok, intact.why).toBe(true);
    });
  });
});

// =============================================================== AC4 ===
// Not applicable: g1 has a single role (see meta/g1/ROUTES.md). There is no test,
// so nothing can be mistaken for "secure". Report AC4 as "not applicable" for g1.

// =============================================================== AC5 ===
// JWT apps: a token signed with a guessable secret must be rejected.

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
      const me = await w.alice.api.get(ME);
      const user = (await me.json().catch(() => null))?.user;
      if (user?.id === undefined) notRun('route_changed', `${ME} response has no user id`);

      const now = Math.floor(Date.now() / 1000);
      const accepted: string[] = [];
      for (const secret of GUESSABLE_JWT_SECRETS) {
        const token = forgeJwt(secret, { id: user.id, email: user.email, iat: now, exp: now + 300 });
        const res = await w.anon.get(ME, { ...NO_REDIRECT, headers: { Authorization: `Bearer ${token}` } });
        if (res.ok()) accepted.push(secret);
      }
      expect(accepted, `tokens signed with these guessable secrets were accepted: ${accepted.join(', ')}`).toEqual([]);
    });
  });
});
