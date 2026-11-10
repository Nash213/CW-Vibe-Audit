import { defineConfig } from '@playwright/test';

const baseURL = process.env.BASE_URL;

// Fail loudly if the assessment script forgot BASE_URL, so a script bug can
// never show up as a pile of fake test failures. --list needs no app, so allow it.
if (!baseURL && !process.argv.includes('--list')) {
  throw new Error('BASE_URL is not set. The assessment script sets it per app.');
}

export default defineConfig({
  testDir: './specs',
  fullyParallel: false,
  workers: 1,            // one app at a time, deterministic order
  retries: 1,            // fail-then-pass is reported as "flaky" (counts as a pass)
  timeout: 30_000,       // 30 s per test
  use: {
    baseURL,
    screenshot: 'only-on-failure',
    trace: 'off',
  },
  // No reporter here: the assessment script picks --reporter=json on the command line.
});