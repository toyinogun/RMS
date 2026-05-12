-- Bootstrap: ensure the auth schema exists before Better Auth's first migration.
-- This is idempotent — CNPG's postInitSQL handles the cluster bootstrap, but
-- local dev databases need this migration to create the schema on first run.
CREATE SCHEMA IF NOT EXISTS auth;
