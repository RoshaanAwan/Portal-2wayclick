-- Provisioning-time free trial on Tenant.
-- Adds `trialEndsAt`: the System-Owner-granted trial deadline stamped at tenant
-- creation; once it passes with no active subscription, login is gated to the
-- billing page (see lib/billing.ts getTenantAccess).
ALTER TABLE "Tenant" ADD COLUMN "trialEndsAt" TIMESTAMP(3);

-- Drop the unused `grandfathered` column (added by a prior abandoned migration;
-- never wired into the schema or any code). Trial-less tenants are already
-- treated as ungated by getTenantAccess, so no replacement flag is needed.
ALTER TABLE "Tenant" DROP COLUMN IF EXISTS "grandfathered";
