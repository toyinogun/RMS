import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { startPostgres, type TestPostgres } from './_helpers/postgres.js';

let pg: TestPostgres;

beforeAll(async () => {
  pg = await startPostgres();
});

afterAll(async () => {
  await pg?.stop();
});

describe('partial indexes from migration 0001', () => {
  test('customer_active_idx exists with WHERE deleted_at IS NULL', async () => {
    const rows = await pg.prisma.$queryRawUnsafe<Array<{ indexdef: string }>>(
      `SELECT indexdef FROM pg_indexes WHERE indexname = 'customer_active_idx'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.indexdef).toContain('WHERE');
    expect(rows[0]!.indexdef).toContain('deletedAt');
  });

  test('property_active_idx exists', async () => {
    const rows = await pg.prisma.$queryRawUnsafe<Array<{ indexdef: string }>>(
      `SELECT indexdef FROM pg_indexes WHERE indexname = 'property_active_idx'`,
    );
    expect(rows).toHaveLength(1);
  });

  test('plan_active_idx exists', async () => {
    const rows = await pg.prisma.$queryRawUnsafe<Array<{ indexdef: string }>>(
      `SELECT indexdef FROM pg_indexes WHERE indexname = 'plan_active_idx'`,
    );
    expect(rows).toHaveLength(1);
  });

  test('plan_one_active_per_property is a UNIQUE partial index', async () => {
    const rows = await pg.prisma.$queryRawUnsafe<Array<{ indexdef: string }>>(
      `SELECT indexdef FROM pg_indexes WHERE indexname = 'plan_one_active_per_property'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.indexdef).toContain('UNIQUE');
    expect(rows[0]!.indexdef.toUpperCase()).toContain(`'ACTIVE'`);
  });

  test('auth schema exists', async () => {
    const rows = await pg.prisma.$queryRawUnsafe<Array<{ schema_name: string }>>(
      `SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'auth'`,
    );
    expect(rows).toHaveLength(1);
  });
});
