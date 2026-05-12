/**
 * Shared ESLint config for Solutio.
 * Enforces two spec invariants via restricted-imports:
 *   1. getTenantContext only called at resolver boundaries (never in packages/shared).
 *   2. Raw Prisma client restricted to allow-listed paths.
 */
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 2023, sourceType: 'module' },
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  rules: {
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
    '@typescript-eslint/consistent-type-imports': 'error',
  },
  overrides: [
    {
      files: ['packages/shared/**/*.{ts,tsx}'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: ['**/lib/tenant-context', '**/tenant-context'],
                message:
                  'Service functions in packages/shared/** must accept ctx as their explicit first parameter. See spec §6.5.',
              },
              {
                group: ['@solutio/db/client', '@solutio/db/src/client'],
                message:
                  'Raw Prisma client not allowed in packages/shared/**. Use forTenant() from @solutio/db.',
              },
            ],
          },
        ],
      },
    },
    {
      files: ['apps/web/**/*.{ts,tsx}'],
      excludedFiles: [
        'apps/web/lib/auth.ts',
        'apps/web/lib/tenant-context.ts',
        'apps/web/app/api/health/route.ts',
        'apps/web/app/api/health/__tests__/**/*.ts',
      ],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: ['@solutio/db/client', '@solutio/db/src/client'],
                message:
                  'Raw Prisma client is restricted. Use forTenant() from @solutio/db. Allow-listed paths: apps/web/lib/auth.ts, apps/web/lib/tenant-context.ts, apps/web/app/api/health/route.ts.',
              },
            ],
          },
        ],
      },
    },
  ],
};
