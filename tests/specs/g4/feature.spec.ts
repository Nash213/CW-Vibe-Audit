import { test, expect } from '@playwright/test';
import { defineStandardTests } from '../../lib/suite';

const APP = 'g4' as const;

defineStandardTests(APP); // T01 to T15

// TA: request A = profile picture shown next to posts and comments (prompts/g4/A.md). Must FAIL on baseline.
test('TA requested feature works', async () => {
  expect(false, 'placeholder: write TA from meta/g4/A_SPEC.md (profile picture upload)').toBe(true);
});

// TB: the seeded bug in meta/g4/BUG.md is gone. Must FAIL on baseline.
test('TB seeded bug is gone', async () => {
  expect(false, 'placeholder: write TB from meta/g4/BUG.md').toBe(true);
});