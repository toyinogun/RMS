import { auth } from '@/lib/auth';
import type { UsersAuthAdapter } from '@solutio/db';

export const usersAuthAdapter: UsersAuthAdapter = {
  async signUpEmail({ email, password, name }) {
    const result = await auth.api.signUpEmail({
      body: { email, password, name },
      headers: new Headers(),
    });
    if (!result.user) {
      throw new Error(`Better Auth signup failed for ${email}`);
    }
    return { authUserId: result.user.id };
  },
};
