import { test, expect } from '@playwright/test';
import { defineStandardTests } from '../../lib/suite';

const APP = 'g2' as const;

defineStandardTests(APP); // T01 to T15

// TA: request A = attach a file to a note (prompts/g2/A.md). Must FAIL on baseline.
test('TA requested feature works', async () => {
  expect(false, 'placeholder: write TA from meta/g2/A_SPEC.md (attach a file to a note)').toBe(true);
});

// TB: the seeded bug in meta/g2/BUG.md is gone. Must FAIL on baseline.
test('TB seeded bug is gone', async () => {
  expect(false, 'placeholder: write TB from meta/g2/BUG.md').toBe(true);
});