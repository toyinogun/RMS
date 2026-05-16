import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { execSync, spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PG_IMAGE =
  'postgres:18.3-bookworm@sha256:80630f83606d8db77d30b3851b16a9f78be2d0d4dda6f7b82a1fdca5ebe3acba';

let container: StartedPostgreSqlContainer | undefined;

async function stop(): Promise<void> {
  if (container) {
    try {
      await container.stop();
    } catch (err: unknown) {
      console.error('[e2e] container stop failed:', err);
    }
  }
}

async function main(): Promise<number> {
  console.log('[e2e] starting Postgres container...');
  container = await new PostgreSqlContainer(PG_IMAGE)
    .withDatabase('solutio_e2e')
    .withUsername('solutio')
    .withPassword('solutio')
    .start();

  const databaseUrl = container.getConnectionUri();
  const env = {
    ...process.env,
    DATABASE_URL: databaseUrl,
    BETTER_AUTH_SECRET: 'e2e-secret-do-not-use-anywhere-else-32hex',
    BETTER_AUTH_URL: 'http://127.0.0.1:3000',
    SEED_OWNER_EMAIL: 'owner@atrium.test',
    SEED_OWNER_PASSWORD: 'seedPassword!12345',
    SEED_OWNER_NAME: 'Atrium Owner',
    // STAFF user — created during seed so M5 E2E can test role-gated UI
    // without needing a user-management UI that does not yet exist.
    SEED_STAFF_EMAIL: 'staff@atrium.test',
    SEED_STAFF_PASSWORD: 'staffPassword!2026',
    SEED_STAFF_NAME: 'Atrium Staff',
    BETTER_AUTH_USE_SECURE_COOKIES: 'false',
  };

  const repoRoot = path.resolve(__dirname, '../../..');
  console.log('[e2e] applying migrations...');
  execSync('pnpm --filter @solutio/db prisma:migrate:deploy', {
    cwd: repoRoot,
    env,
    stdio: 'inherit',
  });
  console.log('[e2e] seeding...');
  execSync('pnpm --filter @solutio/db seed', {
    cwd: repoRoot,
    env,
    stdio: 'inherit',
  });

  console.log('[e2e] launching playwright test...');
  const child = spawn('playwright', ['test', ...process.argv.slice(2)], {
    cwd: path.resolve(__dirname, '..'),
    env,
    stdio: 'inherit',
    shell: false,
  });

  return new Promise<number>((resolve) => {
    child.on('exit', (code) => resolve(code ?? 1));
    child.on('error', (err) => {
      console.error('[e2e] playwright spawn error:', err);
      resolve(1);
    });
  });
}

let exitCode = 1;
try {
  exitCode = await main();
} catch (err: unknown) {
  console.error('[e2e] fatal error:', err);
  exitCode = 1;
} finally {
  await stop();
}
process.exit(exitCode);
