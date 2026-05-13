const { base, sharedBoundary } = require('@solutio/config/eslint');

module.exports = [
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'eslint.config.cjs'] },
  ...base,
  sharedBoundary,
];
