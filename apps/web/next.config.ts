import type { NextConfig } from 'next';
import path from 'path';

const config: NextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  typedRoutes: true,
  turbopack: {
    root: path.resolve(__dirname, '../..'),
    resolveExtensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json'],
  },
};

export default config;
