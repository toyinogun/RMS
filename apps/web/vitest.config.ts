import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url)),
    },
  },
  test: {
    name: 'web-unit',
    include: ['**/__tests__/*.test.ts', '**/__tests__/*.test.tsx'],
    exclude: ['**/e2e/**', '**/node_modules/**'],
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
  },
});
