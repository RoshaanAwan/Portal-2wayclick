-- System Owner / Company Owner split (additive, reversible).
-- Adds User.isSystemOwner (backfilled from the now-deprecated isPlatformAdmin),
-- and creates the reserved "system" tenant that holds System Owner accounts only.
-- The data step (promote/demote specific users) is done by a script AFTER a fresh
-- System Owner exists, so no one is locked out — see prisma/create-system-owner.ts.

-- 1. New flag, backfilled from the old one. Old column kept for safe rollback.
ALTER TABLE "User" ADD COLUMN "isSystemOwner" BOOLEAN NOT NULL DEFAULT false;
UPDATE "User" SET "isSystemOwner" = "isPlatformAdmin";

-- 2. The reserved platform tenant. Holds only System Owner users; never routable
--    (middleware/platform treat "system" as reserved) and never has business data.
INSERT INTO "Tenant" ("id", "subdomain", "name", "status", "updatedAt")
VALUES ('system', 'system', 'Platform', 'active', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
