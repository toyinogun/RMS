-- AuthUser/Session/Account/Verification were created without column defaults in
-- 0002_better_auth. Better Auth's Prisma adapter on Postgres relies on the DB
-- to generate IDs, so add uuidv7() defaults to match the domain tables.

ALTER TABLE "auth"."user"         ALTER COLUMN "id" SET DEFAULT uuidv7();
ALTER TABLE "auth"."session"      ALTER COLUMN "id" SET DEFAULT uuidv7();
ALTER TABLE "auth"."account"      ALTER COLUMN "id" SET DEFAULT uuidv7();
ALTER TABLE "auth"."verification" ALTER COLUMN "id" SET DEFAULT uuidv7();
