import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { prisma } from '@solutio/db/client';
import type { SeedAuthAdapter } from '@solutio/db/seed';

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: 'postgresql',
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    minPasswordLength: 12,
    maxPasswordLength: 128,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },
  advanced: {
    cookiePrefix: '__Host-solutio',
    useSecureCookies: process.env.NODE_ENV === 'production',
  },
  trustedOrigins: process.env.BETTER_AUTH_URL ? [process.env.BETTER_AUTH_URL] : [],
});

export type Auth = typeof auth;

export function createSeedAuthAdapter(): SeedAuthAdapter {
  return {
    async ensureOwnerAuthUser(email: string, password: string) {
      const existing = await prisma.authUser.findUnique({ where: { email } });
      if (existing) return { authUserId: existing.id };
      const signupResult = await auth.api.signUpEmail({
        body: { email, password, name: 'Atrium Owner' },
        headers: new Headers(),
      });
      if (!signupResult.user) {
        throw new Error(`Better Auth signup failed for ${email}`);
      }
      return { authUserId: signupResult.user.id };
    },
  };
}
