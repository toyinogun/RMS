import { Prisma } from '@prisma/client';
import type { TenantContext } from '@solutio/shared/tenant';
import { requireRole } from '@solutio/shared/tenant';
import { generateTempPassword } from '@solutio/shared/users';
import { forTenant } from './tenant-client';
import { prisma } from './client';

// ─── Retryable Errors ─────────────────────────────────────────────────────────

/** Thrown when a SERIALIZABLE serialization conflict aborts deactivateUser. */
export class UserDeactivateRetryableSerializationError extends Error {
  static readonly code = 'USER_DEACTIVATE_RETRYABLE_SERIALIZATION' as const;
  readonly code = UserDeactivateRetryableSerializationError.code;
  constructor() {
    super('Concurrent update aborted user deactivation. Retry suggested.');
    this.name = 'UserDeactivateRetryableSerializationError';
  }
}

// ─── Port ────────────────────────────────────────────────────────────────────

export interface UsersAuthAdapter {
  signUpEmail(input: {
    email: string;
    password: string;
    name: string;
  }): Promise<{ authUserId: string }>;
}

// ─── Errors ──────────────────────────────────────────────────────────────────

export class UserNotFoundError extends Error {
  constructor(userId: string) {
    super(`User not found: ${userId}`);
    this.name = 'UserNotFoundError';
  }
}

export class EmailAlreadyInUseError extends Error {
  constructor(email: string) {
    super(`Email already in use: ${email}`);
    this.name = 'EmailAlreadyInUseError';
  }
}

export class CannotCreateOwnerError extends Error {
  constructor() {
    super('Cannot create a user with role OWNER via this API');
    this.name = 'CannotCreateOwnerError';
  }
}

export class CannotDeactivateSelfError extends Error {
  constructor(userId: string) {
    super(`Cannot deactivate your own account: ${userId}`);
    this.name = 'CannotDeactivateSelfError';
  }
}

export class CannotDeactivateLastOwnerError extends Error {
  constructor(userId: string) {
    super(`Cannot deactivate the last active OWNER: ${userId}`);
    this.name = 'CannotDeactivateLastOwnerError';
  }
}

export class UserAlreadyDeactivatedError extends Error {
  constructor(userId: string) {
    super(`User is already deactivated: ${userId}`);
    this.name = 'UserAlreadyDeactivatedError';
  }
}

export class UserNotDeactivatedError extends Error {
  constructor(userId: string) {
    super(`User is not deactivated: ${userId}`);
    this.name = 'UserNotDeactivatedError';
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export const USER_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  deactivatedAt: true,
  mustChangePassword: true,
  createdAt: true,
} as const;

export type UserListRow = Prisma.UserGetPayload<{ select: typeof USER_SELECT }>;

function isEmailConflict(err: unknown): boolean {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return (
      msg.includes('email') &&
      (msg.includes('exist') ||
        msg.includes('already') ||
        msg.includes('duplicate') ||
        msg.includes('conflict') ||
        msg.includes('taken') ||
        msg.includes('in use'))
    );
  }
  return false;
}

// ─── Service Functions ────────────────────────────────────────────────────────

export async function listUsers(ctx: TenantContext): Promise<UserListRow[]> {
  requireRole(ctx, ['OWNER']);
  const scoped = forTenant(prisma, ctx.tenantId);
  return scoped.user.findMany({
    select: USER_SELECT,
    orderBy: [
      { deactivatedAt: { sort: 'asc', nulls: 'first' } },
      { createdAt: 'desc' },
    ],
  });
}

export async function createUser(
  ctx: TenantContext,
  input: { email: string; name: string; role: 'OWNER' | 'ADMIN' | 'STAFF' },
  deps: { auth: UsersAuthAdapter },
): Promise<{ user: UserListRow; tempPassword: string }> {
  requireRole(ctx, ['OWNER']);

  if (input.role === 'OWNER') {
    throw new CannotCreateOwnerError();
  }

  const tempPassword = generateTempPassword();

  let authUserId: string;
  try {
    // Auth row is committed before the domain insert. If the domain insert fails,
    // the auth row is orphaned. Acceptable for Phase 1a — retry surfaces EmailAlreadyInUseError.
    // See M6 plan §Risks.
    const result = await deps.auth.signUpEmail({
      email: input.email,
      password: tempPassword,
      name: input.name,
    });
    authUserId = result.authUserId;
  } catch (err: unknown) {
    if (isEmailConflict(err)) {
      throw new EmailAlreadyInUseError(input.email);
    }
    throw err;
  }

  const scoped = forTenant(prisma, ctx.tenantId);

  const user = await scoped.$transaction(async (tx) => {
    const data = {
      authUserId,
      email: input.email,
      name: input.name,
      role: input.role,
      mustChangePassword: true,
    } satisfies Omit<Prisma.UserUncheckedCreateInput, 'tenantId'>;

    return tx.user.create({
      data: data as unknown as Prisma.UserUncheckedCreateInput,
      select: USER_SELECT,
    });
  });

  return { user, tempPassword };
}

export async function deactivateUser(
  ctx: TenantContext,
  { userId }: { userId: string },
): Promise<{ deactivatedAt: Date }> {
  requireRole(ctx, ['OWNER']);

  const scoped = forTenant(prisma, ctx.tenantId);

  try {
    return await scoped.$transaction(
      async (tx) => {
        const target = await tx.user.findUnique({
          where: { id: userId },
          select: { id: true, role: true, deactivatedAt: true, authUserId: true },
        });

        if (!target) throw new UserNotFoundError(userId);

        if (target.id === ctx.user.id) {
          throw new CannotDeactivateSelfError(userId);
        }

        if (target.role === 'OWNER') {
          const activeOwnerCount = await tx.user.count({
            where: { role: 'OWNER', deactivatedAt: null },
          });
          if (activeOwnerCount <= 1) {
            throw new CannotDeactivateLastOwnerError(userId);
          }
        }

        if (target.deactivatedAt !== null) {
          throw new UserAlreadyDeactivatedError(userId);
        }

        const deactivatedAt = new Date();

        await tx.user.update({
          where: { id: userId },
          data: { deactivatedAt },
        });

        await tx.session.deleteMany({
          where: { userId: target.authUserId },
        });

        return { deactivatedAt };
      },
      { isolationLevel: 'Serializable' },
    );
  } catch (err) {
    // Postgres SQLSTATE 40001 (serialization_failure) surfaces from Prisma as P2034.
    // Re-wrap so the action layer can decide whether to retry once.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2034') {
      throw new UserDeactivateRetryableSerializationError();
    }
    throw err;
  }
}

export async function reactivateUser(
  ctx: TenantContext,
  { userId }: { userId: string },
): Promise<{ user: UserListRow }> {
  requireRole(ctx, ['OWNER']);

  const scoped = forTenant(prisma, ctx.tenantId);

  return scoped.$transaction(async (tx) => {
    const target = await tx.user.findUnique({
      where: { id: userId },
      select: { id: true, deactivatedAt: true },
    });

    if (!target) throw new UserNotFoundError(userId);
    if (target.deactivatedAt === null) throw new UserNotDeactivatedError(userId);

    const user = await tx.user.update({
      where: { id: userId },
      data: { deactivatedAt: null },
      select: USER_SELECT,
    });

    return { user };
  });
}
