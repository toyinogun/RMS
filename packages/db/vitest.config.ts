import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Top-level fallback so integration containers have time to start even
    // when this config is loaded via the workspace (per-project timeout
    // overrides in `projects` below don't always propagate through the
    // workspace flattener in vitest 4).
    testTimeout: 60_000,
    hookTimeout: 60_000,
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['src/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['__tests__/**/*.integration.test.ts'],
          environment: 'node',
          testTimeout: 60_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
