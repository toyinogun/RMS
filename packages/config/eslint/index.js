/**
 * Shared ESLint flat-config helpers for Solutio.
 *
 * Consumer packages add their own `eslint.config.cjs` that composes these
 * exports. The boundary rules enforce two spec §6.5 invariants:
 *   1. getTenantContext is only called at resolver boundaries
 *      (never inside packages/shared).
 *   2. The raw Prisma client (`@solutio/db/client`) is restricted to
 *      explicitly allow-listed paths in apps/web.
 */
const tsPlugin = require('@typescript-eslint/eslint-plugin');
const tsParser = require('@typescript-eslint/parser');

const tsRecommended = tsPlugin.configs['flat/recommended'];

const baseRules = {
  '@typescript-eslint/no-unused-vars': [
    'error',
    { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
  ],
  '@typescript-eslint/consistent-type-imports': 'error',
};

/**
 * Base flat-config blocks: typescript-eslint recommended + Solutio-wide rules.
 * Spread this into a consumer's exported array.
 */
const base = [
  ...tsRecommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaVersion: 2023, sourceType: 'module' },
    },
    rules: baseRules,
  },
];

/**
 * Boundary block for packages/shared/**: bans tenant-context imports and the
 * raw Prisma client, forcing service functions to accept `ctx` as their
 * explicit first parameter.
 */
const sharedBoundary = {
  files: ['**/*.{ts,tsx}'],
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
};

/**
 * Boundary block for apps/web/**: restricts the raw Prisma client to an
 * explicit allow-list of files (e.g. auth, tenant-context, health route).
 */
function webPrismaBoundary({ allowList }) {
  return {
    files: ['**/*.{ts,tsx}'],
    ignores: allowList,
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@solutio/db/client', '@solutio/db/src/client'],
              message:
                'Raw Prisma client is restricted. Use forTenant() from @solutio/db. See spec §6.5 for the allow-list.',
            },
          ],
        },
      ],
    },
  };
}

module.exports = { base, sharedBoundary, webPrismaBoundary };
