import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      'packages/shared/vitest.config.ts',
      'packages/db/vitest.config.ts',
      'apps/web/vitest.config.ts',
    ],
  },
});
