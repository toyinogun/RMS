import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { startPostgres, type TestPostgres } from './_helpers/postgres.js';
import { seed, type SeedAuthAdapter } from '../src/seed.js';

let pg: TestPostgres;

const FAKE_AUTH_USER_ID = '01935b7e-1111-7111-8111-111111111111';
const stubAdapter: SeedAuthAdapter = {
  async ensureOwnerAuthUser() {
    return { authUserId: FAKE_AUTH_USER_ID };
  },
};

beforeAll(async () => {
  pg = await startPostgres();
});

afterAll(async () => {
  await pg?.stop();
});

describe('seed() idempotency', () => {
  test('running twice leaves exactly one Atrium tenant and one OWNER user', async () => {
    await seed({
      ownerEmail: 'owner@atrium.test',
      ownerPassword: 'irrelevant-stub',
      ownerName: 'Atrium Owner',
      authAdapter: stubAdapter,
      prismaClient: pg.prisma,
    });
    await seed({
      ownerEmail: 'owner@atrium.test',
      ownerPassword: 'irrelevant-stub',
      ownerName: 'Atrium Owner',
      authAdapter: stubAdapter,
      prismaClient: pg.prisma,
    });

    const tenants = await pg.prisma.tenant.findMany({ where: { slug: 'atrium-homes' } });
    expect(tenants).toHaveLength(1);

    const users = await pg.prisma.user.findMany({ where: { authUserId: FAKE_AUTH_USER_ID } });
    expect(users).toHaveLength(1);
    expect(users[0]!.role).toBe('OWNER');
    expect(users[0]!.mustChangePassword).toBe(true);
  });
});
