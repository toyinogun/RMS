import { describe, expect, test, vi } from 'vitest';
import { runSeedCli, type SeedAuthAdapter } from '../seed';

const FAKE_AUTH_USER_ID = '01935b7e-2222-7222-8222-222222222222';
const stubAuthAdapter: SeedAuthAdapter = {
  async ensureOwnerAuthUser() {
    return { authUserId: FAKE_AUTH_USER_ID };
  },
};

describe('runSeedCli — env + auth-module guards', () => {
  test('exits 1 with error message when SEED_OWNER_EMAIL is missing', async () => {
    const exit = vi.fn();
    const err = vi.fn();
    await runSeedCli({
      env: { SEED_OWNER_PASSWORD: 'pw' },
      exit,
      err,
      log: vi.fn(),
      loadAuthModule: async () => ({ createSeedAuthAdapter: () => stubAuthAdapter }),
    });
    expect(exit).toHaveBeenCalledWith(1);
    expect(err).toHaveBeenCalledWith(expect.stringContaining('SEED_OWNER_EMAIL'));
  });

  test('exits 1 with error message when SEED_OWNER_PASSWORD is missing', async () => {
    const exit = vi.fn();
    const err = vi.fn();
    await runSeedCli({
      env: { SEED_OWNER_EMAIL: 'a@b.test' },
      exit,
      err,
      log: vi.fn(),
      loadAuthModule: async () => ({ createSeedAuthAdapter: () => stubAuthAdapter }),
    });
    expect(exit).toHaveBeenCalledWith(1);
    expect(err).toHaveBeenCalledWith(expect.stringContaining('SEED_OWNER_PASSWORD'));
  });

  test('exits 1 when apps/web auth module has no createSeedAuthAdapter export', async () => {
    const exit = vi.fn();
    const err = vi.fn();
    await runSeedCli({
      env: { SEED_OWNER_EMAIL: 'a@b.test', SEED_OWNER_PASSWORD: 'pw' },
      exit,
      err,
      log: vi.fn(),
      loadAuthModule: async () => ({}),
    });
    expect(exit).toHaveBeenCalledWith(1);
    expect(err).toHaveBeenCalledWith(expect.stringContaining('apps/web auth module'));
  });
});
