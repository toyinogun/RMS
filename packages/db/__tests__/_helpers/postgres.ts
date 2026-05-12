import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PG_IMAGE = 'postgres:18.3-bookworm@sha256:80630f83606d8db77d30b3851b16a9f78be2d0d4dda6f7b82a1fdca5ebe3acba';

export type TestPostgres = {
  container: StartedPostgreSqlContainer;
  databaseUrl: string;
  prisma: PrismaClient;
  stop: () => Promise<void>;
};

export async function startPostgres(): Promise<TestPostgres> {
  const container = await new PostgreSqlContainer(PG_IMAGE)
    .withDatabase('solutio_test')
    .withUsername('solutio')
    .withPassword('solutio')
    .start();

  const databaseUrl = container.getConnectionUri();
  process.env.DATABASE_URL = databaseUrl;

  const dbPackageDir = path.resolve(__dirname, '..', '..');
  execSync('pnpm prisma migrate deploy', {
    cwd: dbPackageDir,
    env: { ...process.env, DATABASE_URL: databaseUrl, PATH: `/opt/homebrew/bin:${process.env.PATH ?? ''}` },
    stdio: 'inherit',
  });

  const adapter = new PrismaPg({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter });
  await prisma.$connect();

  return {
    container,
    databaseUrl,
    prisma,
    stop: async () => {
      await prisma.$disconnect();
      await container.stop();
    },
  };
}
