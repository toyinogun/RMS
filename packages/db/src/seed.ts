import type { PrismaClient } from '@prisma/client';

const ATRIUM_TENANT = {
  slug: 'atrium-homes',
  name: 'Atrium Homes',
  currency: 'NGN',
};

export type SeedAuthAdapter = {
  /**
   * Creates (or returns existing) Better Auth user for the seed owner.
   * Returns the stable auth user id used as the join key on the domain User row.
   */
  ensureOwnerAuthUser(email: string, password: string): Promise<{ authUserId: string }>;
};

export type SeedOptions = {
  ownerEmail: string;
  ownerPassword: string;
  ownerName: string;
  authAdapter: SeedAuthAdapter;
  /**
   * Optional Prisma client instance. Defaults to the global singleton when not
   * provided (production CLI path). Pass `pg.prisma` from test helpers to avoid
   * the eager-singleton DATABASE_URL timing issue in integration tests.
   */
  prismaClient?: PrismaClient;
};

export async function seed(opts: SeedOptions) {
  // Defer singleton import to call time so that tests can pass their own
  // pg.prisma instance without triggering the singleton at import-time when
  // DATABASE_URL may not yet be set.
  const db = opts.prismaClient ?? (await import('./client.js')).prisma;

  const tenant = await db.tenant.upsert({
    where: { slug: ATRIUM_TENANT.slug },
    create: ATRIUM_TENANT,
    update: { name: ATRIUM_TENANT.name },
  });

  const { authUserId } = await opts.authAdapter.ensureOwnerAuthUser(
    opts.ownerEmail,
    opts.ownerPassword,
  );

  const user = await db.user.upsert({
    where: { authUserId },
    create: {
      tenantId: tenant.id,
      authUserId,
      email: opts.ownerEmail,
      name: opts.ownerName,
      role: 'OWNER',
      mustChangePassword: true,
    },
    update: {
      email: opts.ownerEmail,
      name: opts.ownerName,
    },
  });

  return { tenant, user };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const email = process.env.SEED_OWNER_EMAIL;
  const password = process.env.SEED_OWNER_PASSWORD;
  if (!email || !password) {
    console.error('SEED_OWNER_EMAIL and SEED_OWNER_PASSWORD must be set.');
    process.exit(1);
  }
  // Path stored in a variable so TypeScript treats this as a runtime-only import
  // (Promise<any>) — apps/web is intentionally outside packages/db's rootDir;
  // the auth adapter only needs to exist when the seed CLI runs.
  const authModulePath = '../../../apps/web/lib/auth.js';
  const authModule = (await import(authModulePath).catch(() => ({}))) as {
    createSeedAuthAdapter?: () => SeedAuthAdapter;
  };
  const createSeedAuthAdapter = authModule.createSeedAuthAdapter;
  if (!createSeedAuthAdapter) {
    console.error('apps/web auth module not built. Run pnpm --filter @solutio/web build first.');
    process.exit(1);
  }
  await seed({
    ownerEmail: email,
    ownerPassword: password,
    ownerName: process.env.SEED_OWNER_NAME ?? 'Atrium Owner',
    authAdapter: createSeedAuthAdapter(),
  });
  console.log('Seed complete.');
  const { prisma } = await import('./client.js');
  await prisma.$disconnect();
}
