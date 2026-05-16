import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { randomUUID } from 'node:crypto';
import { startPostgres, type TestPostgres } from './_helpers/postgres.js';
import {
  listUsers,
  createUser,
  deactivateUser,
  reactivateUser,
  UserNotFoundError,
  EmailAlreadyInUseError,
  CannotCreateOwnerError,
  CannotDeactivateSelfError,
  CannotDeactivateLastOwnerError,
  UserAlreadyDeactivatedError,
  UserNotDeactivatedError,
  type UsersAuthAdapter,
  type UserListRow,
} from '../src/users-service.js';
import type { TenantContext } from '@solutio/shared/tenant';

let pg: TestPostgres;

// ─── Tenant constants ────────────────────────────────────────────────────────
const TENANT_A = '01935c00-0001-7000-8000-000000000001';
const TENANT_B = '01935c00-0001-7000-8000-000000000002';

// ─── Context helpers ─────────────────────────────────────────────────────────
const ownerCtxFor = (
  tenantId: string,
  userId: string,
  authUserId: string,
): TenantContext => ({
  tenantId,
  user: {
    id: userId,
    authUserId,
    role: 'OWNER',
    email: 'owner@test',
    mustChangePassword: false,
  },
});

const adminCtxFor = (tenantId: string): TenantContext => ({
  tenantId,
  user: {
    id: randomUUID(),
    authUserId: randomUUID(),
    role: 'ADMIN',
    email: 'admin@test',
    mustChangePassword: false,
  },
});

const staffCtxFor = (tenantId: string): TenantContext => ({
  tenantId,
  user: {
    id: randomUUID(),
    authUserId: randomUUID(),
    role: 'STAFF',
    email: 'staff@test',
    mustChangePassword: false,
  },
});

// ─── Seed helpers ─────────────────────────────────────────────────────────────
async function seedOwner(
  tenantId: string,
  overrides: { email?: string; deactivatedAt?: Date } = {},
) {
  const authUserId = randomUUID();
  const user = await pg.prisma.user.create({
    data: {
      tenantId,
      authUserId,
      email: overrides.email ?? `owner-${randomUUID()}@test.com`,
      name: 'Test Owner',
      role: 'OWNER',
      mustChangePassword: false,
      deactivatedAt: overrides.deactivatedAt ?? null,
    },
  });
  return { ...user, authUserId };
}

async function seedStaff(
  tenantId: string,
  overrides: { email?: string; deactivatedAt?: Date } = {},
) {
  const authUserId = randomUUID();
  const user = await pg.prisma.user.create({
    data: {
      tenantId,
      authUserId,
      email: overrides.email ?? `staff-${randomUUID()}@test.com`,
      name: 'Test Staff',
      role: 'STAFF',
      mustChangePassword: false,
      deactivatedAt: overrides.deactivatedAt ?? null,
    },
  });
  return { ...user, authUserId };
}

async function seedSession(authUserId: string) {
  // Session has a FK to auth.user, so we must ensure an AuthUser row exists first.
  await pg.prisma.authUser.upsert({
    where: { id: authUserId },
    create: {
      id: authUserId,
      email: `auth-${authUserId}@test.internal`,
      emailVerified: false,
    },
    update: {},
  });
  return pg.prisma.session.create({
    data: {
      userId: authUserId,
      token: randomUUID(),
      expiresAt: new Date(Date.now() + 86_400_000),
    },
  });
}

// ─── Fake auth adapter ────────────────────────────────────────────────────────
const makeAuthAdapter = (opts: { throwMessage?: string } = {}): UsersAuthAdapter => ({
  async signUpEmail() {
    if (opts.throwMessage) {
      throw new Error(opts.throwMessage);
    }
    return { authUserId: randomUUID() };
  },
});

// ─── Setup ────────────────────────────────────────────────────────────────────
beforeAll(async () => {
  pg = await startPostgres();
  await pg.prisma.tenant.createMany({
    data: [
      { id: TENANT_A, slug: 'users-tenant-a', name: 'Tenant A' },
      { id: TENANT_B, slug: 'users-tenant-b', name: 'Tenant B' },
    ],
  });
}, 120_000);

afterAll(async () => {
  await pg?.stop();
});

// ─── listUsers ────────────────────────────────────────────────────────────────
describe('users-service.listUsers', () => {
  test('OWNER sees all users (active + deactivated) in documented order', async () => {
    const owner = await seedOwner(TENANT_A);
    const ctx = ownerCtxFor(TENANT_A, owner.id, owner.authUserId);

    const staff1 = await seedStaff(TENANT_A);
    const staff2 = await seedStaff(TENANT_A, {
      deactivatedAt: new Date('2025-01-01T00:00:00Z'),
    });

    const rows = await listUsers(ctx);

    // Should contain all 3 rows we just seeded (may have more from other tests if
    // tests run concurrently, but all 3 must appear)
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(owner.id);
    expect(ids).toContain(staff1.id);
    expect(ids).toContain(staff2.id);

    // Active rows come before deactivated rows
    const deactivatedRows = rows.filter((r) => r.deactivatedAt !== null);
    const activeRows = rows.filter((r) => r.deactivatedAt === null);
    const lastActiveIndex = Math.max(...activeRows.map((r) => rows.indexOf(r)));
    const firstDeactivatedIndex = Math.min(...deactivatedRows.map((r) => rows.indexOf(r)));
    expect(lastActiveIndex).toBeLessThan(firstDeactivatedIndex);

    // Result shape is correct
    const row = rows[0] as UserListRow;
    expect(row).toHaveProperty('id');
    expect(row).toHaveProperty('email');
    expect(row).toHaveProperty('name');
    expect(row).toHaveProperty('role');
    expect(row).toHaveProperty('deactivatedAt');
    expect(row).toHaveProperty('mustChangePassword');
    expect(row).toHaveProperty('createdAt');
  });

  test('ADMIN is forbidden', async () => {
    const ctx = adminCtxFor(TENANT_A);
    await expect(listUsers(ctx)).rejects.toThrow('Forbidden');
  });

  test('STAFF is forbidden', async () => {
    const ctx = staffCtxFor(TENANT_A);
    await expect(listUsers(ctx)).rejects.toThrow('Forbidden');
  });
});

// ─── createUser ───────────────────────────────────────────────────────────────
describe('users-service.createUser', () => {
  test('happy path: returns UserListRow with mustChangePassword=true and 16-char tempPassword', async () => {
    const owner = await seedOwner(TENANT_A);
    const ctx = ownerCtxFor(TENANT_A, owner.id, owner.authUserId);

    const calledWith: Parameters<UsersAuthAdapter['signUpEmail']>[0][] = [];
    const adapter: UsersAuthAdapter = {
      async signUpEmail(input) {
        calledWith.push(input);
        return { authUserId: randomUUID() };
      },
    };

    const { user, tempPassword } = await createUser(
      ctx,
      { email: 'newstaff@example.com', name: 'New Staff', role: 'STAFF' },
      { auth: adapter },
    );

    expect(user.mustChangePassword).toBe(true);
    expect(user.email).toBe('newstaff@example.com');
    expect(user.name).toBe('New Staff');
    expect(user.role).toBe('STAFF');
    expect(user.deactivatedAt).toBeNull();
    expect(tempPassword).toHaveLength(16);

    // Auth adapter received the same password
    expect(calledWith).toHaveLength(1);
    expect(calledWith[0]?.password).toBe(tempPassword);

    // Domain row exists in DB with correct tenantId
    const dbUser = await pg.prisma.user.findUnique({ where: { id: user.id } });
    expect(dbUser?.tenantId).toBe(TENANT_A);
    expect(dbUser?.mustChangePassword).toBe(true);
  });

  test('duplicate email: EmailAlreadyInUseError and no domain User row inserted', async () => {
    const owner = await seedOwner(TENANT_A);
    const ctx = ownerCtxFor(TENANT_A, owner.id, owner.authUserId);
    const adapter = makeAuthAdapter({ throwMessage: 'email already exists' });

    const email = `dup-${randomUUID()}@example.com`;
    const countBefore = await pg.prisma.user.count({ where: { tenantId: TENANT_A, email } });

    await expect(
      createUser(ctx, { email, name: 'Dup User', role: 'STAFF' }, { auth: adapter }),
    ).rejects.toBeInstanceOf(EmailAlreadyInUseError);

    const countAfter = await pg.prisma.user.count({ where: { tenantId: TENANT_A, email } });
    expect(countAfter).toBe(countBefore);
  });

  test('role=OWNER rejected with CannotCreateOwnerError', async () => {
    const owner = await seedOwner(TENANT_A);
    const ctx = ownerCtxFor(TENANT_A, owner.id, owner.authUserId);
    const adapter = makeAuthAdapter();

    await expect(
      createUser(
        ctx,
        { email: 'owner2@example.com', name: 'Sneaky Owner', role: 'OWNER' as 'OWNER' },
        { auth: adapter },
      ),
    ).rejects.toBeInstanceOf(CannotCreateOwnerError);
  });
});

// ─── deactivateUser ───────────────────────────────────────────────────────────
describe('users-service.deactivateUser', () => {
  test('happy path: deactivatedAt set, auth.session row deleted', async () => {
    const owner = await seedOwner(TENANT_A);
    const ctx = ownerCtxFor(TENANT_A, owner.id, owner.authUserId);
    const staff = await seedStaff(TENANT_A);

    await seedSession(staff.authUserId);
    const sessionsBefore = await pg.prisma.session.count({ where: { userId: staff.authUserId } });
    expect(sessionsBefore).toBe(1);

    const { deactivatedAt } = await deactivateUser(ctx, { userId: staff.id });

    expect(deactivatedAt).toBeInstanceOf(Date);
    const dbUser = await pg.prisma.user.findUnique({ where: { id: staff.id } });
    expect(dbUser?.deactivatedAt).not.toBeNull();

    const sessionsAfter = await pg.prisma.session.count({ where: { userId: staff.authUserId } });
    expect(sessionsAfter).toBe(0);
  });

  test('OWNER cannot deactivate themselves (CannotDeactivateSelfError, no DB mutation)', async () => {
    const owner = await seedOwner(TENANT_A);
    const ctx = ownerCtxFor(TENANT_A, owner.id, owner.authUserId);

    await expect(
      deactivateUser(ctx, { userId: owner.id }),
    ).rejects.toBeInstanceOf(CannotDeactivateSelfError);

    const dbUser = await pg.prisma.user.findUnique({ where: { id: owner.id } });
    expect(dbUser?.deactivatedAt).toBeNull();
  });

  test('last active OWNER cannot be deactivated (CannotDeactivateLastOwnerError)', async () => {
    // Use a dedicated tenant for this test to avoid pollution from other tests.
    const TENANT_LAST = '01935c00-0001-7000-8000-000000000099';
    await pg.prisma.tenant.upsert({
      where: { id: TENANT_LAST },
      create: { id: TENANT_LAST, slug: 'users-tenant-last', name: 'Last Tenant' },
      update: {},
    });

    // Seed 2 owners. Deactivate ownerL2 directly in DB so ownerL1 is the last active OWNER.
    const ownerL1 = await seedOwner(TENANT_LAST);
    const ownerL2 = await seedOwner(TENANT_LAST);
    await pg.prisma.user.update({
      where: { id: ownerL2.id },
      data: { deactivatedAt: new Date() },
    });

    // The service checks ctx.user.id for self-check and ctx.tenantId for scoping,
    // but doesn't verify that the actor is themselves active. So we can use ownerL2's
    // identity as the ctx actor to avoid the "self" guard while targeting ownerL1.
    const ctxL2 = ownerCtxFor(TENANT_LAST, ownerL2.id, ownerL2.authUserId);

    await expect(
      deactivateUser(ctxL2, { userId: ownerL1.id }),
    ).rejects.toBeInstanceOf(CannotDeactivateLastOwnerError);

    // Also verify that deactivating one of 2 active owners SUCCEEDS (boundary check):
    const TENANT_TWO = '01935c00-0001-7000-8000-000000000100';
    await pg.prisma.tenant.upsert({
      where: { id: TENANT_TWO },
      create: { id: TENANT_TWO, slug: 'users-tenant-two', name: 'Two Owners' },
      update: {},
    });
    const ownerT1 = await seedOwner(TENANT_TWO);
    const ownerT2 = await seedOwner(TENANT_TWO);
    const ctxT1 = ownerCtxFor(TENANT_TWO, ownerT1.id, ownerT1.authUserId);

    // Deactivating one of 2 active owners → succeeds (1 remains)
    await expect(deactivateUser(ctxT1, { userId: ownerT2.id })).resolves.toBeDefined();

    // Now ownerT1 is the last active OWNER. ctxT2 (ownerT2, deactivated) attempts to
    // deactivate ownerT1 → CannotDeactivateLastOwnerError
    const ctxT2 = ownerCtxFor(TENANT_TWO, ownerT2.id, ownerT2.authUserId);
    await expect(
      deactivateUser(ctxT2, { userId: ownerT1.id }),
    ).rejects.toBeInstanceOf(CannotDeactivateLastOwnerError);
  });

  test('already deactivated user: UserAlreadyDeactivatedError', async () => {
    const owner = await seedOwner(TENANT_A);
    const ctx = ownerCtxFor(TENANT_A, owner.id, owner.authUserId);
    const staff = await seedStaff(TENANT_A, { deactivatedAt: new Date('2025-01-01') });

    await expect(
      deactivateUser(ctx, { userId: staff.id }),
    ).rejects.toBeInstanceOf(UserAlreadyDeactivatedError);
  });

  test('cross-tenant: UserNotFoundError (row hidden by forTenant)', async () => {
    const ownerA = await seedOwner(TENANT_A);
    const staffA = await seedStaff(TENANT_A);
    // ctx for TENANT_B, trying to deactivate TENANT_A's staff
    const ownerB = await seedOwner(TENANT_B);
    const ctxB = ownerCtxFor(TENANT_B, ownerB.id, ownerB.authUserId);

    await expect(
      deactivateUser(ctxB, { userId: staffA.id }),
    ).rejects.toBeInstanceOf(UserNotFoundError);
  });
});

// ─── reactivateUser ───────────────────────────────────────────────────────────
describe('users-service.reactivateUser', () => {
  test('happy path: deactivatedAt is null after reactivate', async () => {
    const owner = await seedOwner(TENANT_A);
    const ctx = ownerCtxFor(TENANT_A, owner.id, owner.authUserId);
    const staff = await seedStaff(TENANT_A, { deactivatedAt: new Date('2025-01-01') });

    const { user } = await reactivateUser(ctx, { userId: staff.id });
    expect(user.deactivatedAt).toBeNull();
    expect(user.id).toBe(staff.id);

    const dbUser = await pg.prisma.user.findUnique({ where: { id: staff.id } });
    expect(dbUser?.deactivatedAt).toBeNull();
  });

  test('not deactivated: UserNotDeactivatedError', async () => {
    const owner = await seedOwner(TENANT_A);
    const ctx = ownerCtxFor(TENANT_A, owner.id, owner.authUserId);
    const staff = await seedStaff(TENANT_A);

    await expect(
      reactivateUser(ctx, { userId: staff.id }),
    ).rejects.toBeInstanceOf(UserNotDeactivatedError);
  });

  test('reactivate does NOT restore sessions', async () => {
    const owner = await seedOwner(TENANT_A);
    const ctx = ownerCtxFor(TENANT_A, owner.id, owner.authUserId);
    const staff = await seedStaff(TENANT_A);

    // Deactivate first (this deletes sessions)
    await deactivateUser(ctx, { userId: staff.id });

    // Verify sessions are 0
    const sessionsAfterDeactivate = await pg.prisma.session.count({
      where: { userId: staff.authUserId },
    });
    expect(sessionsAfterDeactivate).toBe(0);

    // Reactivate
    await reactivateUser(ctx, { userId: staff.id });

    // Sessions should still be 0 (not restored)
    const sessionsAfterReactivate = await pg.prisma.session.count({
      where: { userId: staff.authUserId },
    });
    expect(sessionsAfterReactivate).toBe(0);
  });
});

// ─── Static check ─────────────────────────────────────────────────────────────
describe('users-service.ts static check', () => {
  test('does not import from better-auth or @/lib/auth', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const { fileURLToPath } = await import('node:url');

    const __filename = fileURLToPath(import.meta.url);
    const dir = resolve(__filename, '..', '..', 'src');
    const source = readFileSync(resolve(dir, 'users-service.ts'), 'utf8');

    expect(source).not.toMatch(/from ['"]better-auth/);
    expect(source).not.toMatch(/from ['"]@\/lib\/auth/);
  });
});
