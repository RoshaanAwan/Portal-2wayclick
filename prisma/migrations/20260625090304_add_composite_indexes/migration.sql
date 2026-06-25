-- Trigram index for fast case-insensitive project-name search.
--
-- The projects list page filters names with `contains` + `mode: "insensitive"`,
-- which Postgres serves as `lower(name) LIKE '%term%'`. A normal btree can't
-- accelerate a leading-wildcard LIKE, so this adds a GIN trigram index on
-- lower(name) — turning the name search from a sequential scan into an index
-- scan. This is a raw-SQL migration because a GIN expression index can't be
-- expressed via Prisma's `@@index`, so the schema doesn't (and can't) declare it.
--
-- The (tenantId, active, completedAt, createdAt DESC) composite that backs the
-- filter+sort was already created by 20260624094717_add_project_composite_index;
-- it is intentionally NOT recreated here.
--
-- Written idempotently (IF NOT EXISTS) so `migrate deploy` is safe on an
-- environment where these objects already exist.

-- Enable the trigram operator class used by the index below.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Project_name_trgm_idx"
  ON "Project" USING gin (lower(name) gin_trgm_ops);
