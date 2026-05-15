import { defineConfig, env } from 'prisma/config';

type Env = {
  DATABASE_URL: string;
};

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: env<Env>('DATABASE_URL'),
    // `env<Env>(name)` throws at config-load when the var is unset. The
    // shadow URL is only needed for `prisma migrate diff --from-migrations`
    // and `prisma migrate dev` — not for `generate`, `validate`, or runtime.
    // Reading via `process.env` keeps it optional so Docker/CI/production
    // builds that don't run diff don't need to stub the value.
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
});
