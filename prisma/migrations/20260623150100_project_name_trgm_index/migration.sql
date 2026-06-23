-- Finding 5: accelerate the projects page case-insensitive name search.
-- The search uses `name ILIKE '%q%'` (Prisma `contains`, mode insensitive),
-- which a B-tree can't serve (leading wildcard) — so it sequential-scans. A
-- pg_trgm GIN index on lower(name) makes substring/ILIKE matches index-assisted.
-- This is a scale provision (invisible at small row counts, decisive at 100k+).
--
-- Prisma's schema language can't model a functional GIN-trigram index, so it
-- lives here as raw SQL. `IF NOT EXISTS` keeps the migration idempotent if the
-- extension/index was created manually first.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "Project_name_trgm_idx"
  ON "Project" USING gin (lower("name") gin_trgm_ops);
