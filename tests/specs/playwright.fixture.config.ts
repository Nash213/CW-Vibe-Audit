import { defineConfig } from '@playwright/test';

// Only for building the synthetic JSON fixture. Never used by the assessment.
export default defineConfig({
  testDir: './fixture-src',
  fullyParallel: false,
  workers: 1,
  retries: 1,
  timeout: 30_000,
});