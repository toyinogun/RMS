import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { nextCookies } from 'better-auth/next-js';
import { prisma } from '@solutio/db/client';
import type { SeedAuthAdapter } from '@solutio/db/seed';

// Production runs over HTTPS where the __Host- cookie prefix and the Secure
// flag are required. E2E runs against http://127.0.0.1 with `next start`, so
// it sets NODE_ENV=production but cannot satisfy __Host- (which the browser
// enforces independently of useSecureCookies). The e2e wrapper opts out via
// BETTER_AUTH_USE_SECURE_COOKIES=false; no other context should set it.
const useSecureCookies =
  process.env.BETTER_AUTH_USE_SECURE_COOKIES === 'false'
    ? false
    : process.env.NODE_ENV === 'production';

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: 'postgresql',
  }),
  user: { modelName: 'authUser' },
  account: { modelName: 'account' },
  verification: { modelName: 'verification' },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    minPasswordLength: 12,
    maxPasswordLength: 128,
  },
  session: {
    modelName: 'session',
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },
  advanced: {
    cookiePrefix: useSecureCookies ? '__Host-solutio' : 'solutio',
    useSecureCookies,
    database: { generateId: 'uuid' },
  },
  trustedOrigins: process.env.BETTER_AUTH_URL ? [process.env.BETTER_AUTH_URL] : [],
  // nextCookies must be the last plugin — it intercepts the Set-Cookie header
  // from auth.api responses and writes it via Next's cookies() helper so that
  // server actions (login, sign-out, change-password) actually persist the
  // session cookie in the browser.
  plugins: [nextCookies()],
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
    async ensureExtraAuthUser(email: string, password: string, name: string) {
      const existing = await prisma.authUser.findUnique({ where: { email } });
      if (existing) return { authUserId: existing.id };
      const signupResult = await auth.api.signUpEmail({
        body: { email, password, name },
        headers: new Headers(),
      });
      if (!signupResult.user) {
        throw new Error(`Better Auth signup failed for ${email}`);
      }
      return { authUserId: signupResult.user.id };
    },
  };
}
