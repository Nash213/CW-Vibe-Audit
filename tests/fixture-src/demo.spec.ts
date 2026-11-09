import { test, expect } from '@playwright/test';

// SYNTHETIC tests: they exist only to produce one of each status in the JSON report.

test('T97 synthetic pass', async () => {
  expect(1 + 1).toBe(2);
});

test('T98 synthetic flaky', async ({}, testInfo) => {
  // Fails on the first attempt, passes on the retry -> status "flaky".
  expect(testInfo.retry).toBeGreaterThan(0);
});

test('T99 synthetic fail', async () => {
  expect(1).toBe(2);
});

test.skip('T96 synthetic skipped', async () => {
  // never runs
});