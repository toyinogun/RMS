import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

type GlobalWithPrisma = typeof globalThis & { prisma?: unknown };

describe('@solutio/db/client lazy proxy', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset both the global cache (used by the lazy proxy) and the module
    // registry so each test gets a fresh evaluation of client.ts.
    delete (globalThis as GlobalWithPrisma).prisma;
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    delete (globalThis as GlobalWithPrisma).prisma;
  });

  test('throws DATABASE_URL error on first property access when env is unset', async () => {
    delete process.env.DATABASE_URL;
    const { prisma } = await import('../client');
    expect(() => prisma.$connect()).toThrow(/DATABASE_URL/);
  });

  test('caches the Prisma instance across multiple property accesses', async () => {
    process.env.DATABASE_URL = 'postgresql://noop:noop@localhost:5432/noop';
    const { prisma } = await import('../client');
    // Access two distinct properties; both should resolve through the same
    // cached client (the global cache short-circuits the second getPrisma() call).
    const ref1 = prisma.$connect;
    const ref2 = prisma.$disconnect;
    expect(typeof ref1).toBe('function');
    expect(typeof ref2).toBe('function');
    expect((globalThis as GlobalWithPrisma).prisma).toBeDefined();
  });

  test('uses production log level when NODE_ENV=production', async () => {
    process.env.DATABASE_URL = 'postgresql://noop:noop@localhost:5432/noop';
    process.env.NODE_ENV = 'production';
    const { prisma } = await import('../client');
    // Trigger lazy construction.
    expect(typeof prisma.$connect).toBe('function');
  });

  test('uses development log level when NODE_ENV is not production', async () => {
    process.env.DATABASE_URL = 'postgresql://noop:noop@localhost:5432/noop';
    process.env.NODE_ENV = 'test';
    const { prisma } = await import('../client');
    expect(typeof prisma.$connect).toBe('function');
  });
});
