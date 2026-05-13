const { base, webPrismaBoundary } = require('@solutio/config/eslint');

module.exports = [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'dist/**',
      'next-env.d.ts',
      'eslint.config.cjs',
      'next.config.ts',
      'postcss.config.*',
    ],
  },
  ...base,
  webPrismaBoundary({
    allowList: [
      'lib/auth.ts',
      'lib/tenant-context.ts',
      'app/api/health/route.ts',
      'app/api/health/__tests__/**/*.ts',
    ],
  }),
];
