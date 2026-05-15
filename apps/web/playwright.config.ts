import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  // `.e2e.ts` (not `.spec.ts`) so Vitest's default `**/*.spec.ts` scan, which
  // runs alongside workspace projects when invoked from the repo root, does
  // not collect this file. Playwright's only requirement is matching this
  // testMatch.
  testMatch: /.*\.e2e\.ts$/,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  // The happy-path test mutates seed state (sets mustChangePassword=false), so
  // a retry within the same Playwright run would race against the new state.
  // The wrapper script (e2e/run-e2e.ts) starts a fresh container per
  // invocation, which is the correct retry boundary.
  retries: 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'pnpm --filter @solutio/web start',
    url: 'http://127.0.0.1:3000/api/health',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
