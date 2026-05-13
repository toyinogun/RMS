import { cache } from 'react';
import { headers } from 'next/headers';
import { auth } from './auth';
import { prisma } from '@solutio/db/client';
import type { TenantContext } from '@solutio/shared/tenant';

/**
 * Resolves the request's TenantContext. React `cache()` deduplicates calls
 * within a single request. Returns null if the user is not authenticated or
 * has no domain User row.
 *
 * IMPORTANT: This function is the *only* sanctioned consumer of headers() and
 * the raw Prisma client for auth purposes. Service functions in
 * packages/shared/** must NEVER import this — they take ctx as an explicit
 * first parameter. See spec §6.5.
 */
export const getTenantContext = cache(async (): Promise<TenantContext | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;

  const domainUser = await prisma.user.findUnique({
    where: { authUserId: session.user.id },
    select: {
      id: true,
      authUserId: true,
      tenantId: true,
      role: true,
      email: true,
      mustChangePassword: true,
    },
  });
  if (!domainUser) return null;

  return {
    tenantId: domainUser.tenantId,
    user: {
      id: domainUser.id,
      authUserId: domainUser.authUserId,
      role: domainUser.role,
      email: domainUser.email,
      mustChangePassword: domainUser.mustChangePassword,
    },
  };
});
