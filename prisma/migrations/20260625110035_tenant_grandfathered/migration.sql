-- Reconstructed placeholder. The original migration.sql for this entry was lost
-- locally (the file went missing while the migration stayed recorded as applied
-- in _prisma_migrations). This restores history consistency by matching the
-- column the DB actually has. The `grandfathered` column is unused and is dropped
-- by the following migration (20260625_add_tenant_trial).
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "grandfathered" BOOLEAN NOT NULL DEFAULT false;
