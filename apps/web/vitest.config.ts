import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'web-unit',
    include: ['**/__tests__/*.test.ts', '**/__tests__/*.test.tsx'],
    exclude: ['**/e2e/**', '**/node_modules/**'],
    environment: 'node',
  },
});
