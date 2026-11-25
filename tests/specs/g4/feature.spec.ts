import { test, expect } from '@playwright/test';
import { defineStandardTests } from '../../lib/suite';
import { createItem, withUser } from '../../lib/auth';

const APP = 'g4' as const;

defineStandardTests(APP); // T01 to T15

// TA: request A = profile picture shown next to posts and comments (prompts/g4/A.md). Must FAIL on baseline.
test('TA requested feature works', async () => {
  expect(false, 'placeholder: write TA from meta/g4/A_SPEC.md (profile picture upload)').toBe(true);
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