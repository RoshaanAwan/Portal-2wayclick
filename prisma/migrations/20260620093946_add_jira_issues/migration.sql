-- AlterTable
ALTER TABLE "Board" ADD COLUMN     "issueSeq" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "keyPrefix" TEXT NOT NULL DEFAULT 'TASK';

-- AlterTable
ALTER TABLE "ConversationMember" ALTER COLUMN "lastReadAt" SET DEFAULT '1970-01-01 00:00:00'::timestamp;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "issueNumber" INTEGER,
ADD COLUMN     "issueType" TEXT NOT NULL DEFAULT 'TASK',
ADD COLUMN     "labels" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "reporterId" TEXT,
ADD COLUMN     "sprintId" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'TODO',
ADD COLUMN     "storyPoints" INTEGER;

-- CreateTable
CREATE TABLE "Sprint" (
    "id" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "goal" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "position" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Sprint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IssueLink" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IssueLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Sprint_boardId_status_idx" ON "Sprint"("boardId", "status");

-- CreateIndex
CREATE INDEX "IssueLink_targetId_idx" ON "IssueLink"("targetId");

-- CreateIndex
CREATE UNIQUE INDEX "IssueLink_sourceId_targetId_type_key" ON "IssueLink"("sourceId", "targetId", "type");

-- CreateIndex
CREATE INDEX "Task_sprintId_idx" ON "Task"("sprintId");

-- CreateIndex
CREATE INDEX "Task_reporterId_idx" ON "Task"("reporterId");

-- CreateIndex
CREATE INDEX "Task_status_idx" ON "Task"("status");

-- CreateIndex
CREATE INDEX "Task_issueNumber_idx" ON "Task"("issueNumber");

-- AddForeignKey
ALTER TABLE "Sprint" ADD CONSTRAINT "Sprint_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "Board"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_sprintId_fkey" FOREIGN KEY ("sprintId") REFERENCES "Sprint"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueLink" ADD CONSTRAINT "IssueLink_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueLink" ADD CONSTRAINT "IssueLink_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Data backfill (JIRA-like issues) ──────────────────────────────────────────
-- Existing boards/cards predate the issue fields. Give every board a key prefix
-- derived from its project (or board) name, number every existing card per
-- board in creation order, seed each board's counter past its highest number,
-- set reporter = creator, and derive the workflow status from the card's list.

-- 1) Board key prefix: an uppercased, alnum-only slug of the project name (or
--    the board name when standalone), capped at 6 chars. Falls back to 'TASK'.
UPDATE "Board" b
SET "keyPrefix" = COALESCE(
  NULLIF(
    LEFT(
      REGEXP_REPLACE(UPPER(COALESCE(p."name", b."name")), '[^A-Z0-9]', '', 'g'),
      6
    ),
    ''
  ),
  'TASK'
)
FROM (SELECT "id", "name", "boardId" FROM "Project") p
WHERE p."boardId" = b."id";

-- Standalone boards (no project) that didn't match above: slug from board name.
UPDATE "Board" b
SET "keyPrefix" = COALESCE(
  NULLIF(LEFT(REGEXP_REPLACE(UPPER(b."name"), '[^A-Z0-9]', '', 'g'), 6), ''),
  'TASK'
)
WHERE NOT EXISTS (SELECT 1 FROM "Project" p WHERE p."boardId" = b."id")
  AND b."keyPrefix" = 'TASK';

-- 2) Number every existing card per board, in creation order, starting at 1.
WITH numbered AS (
  SELECT
    t."id" AS task_id,
    bl."boardId" AS board_id,
    ROW_NUMBER() OVER (
      PARTITION BY bl."boardId"
      ORDER BY t."createdAt" ASC, t."id" ASC
    ) AS n
  FROM "Task" t
  JOIN "BoardList" bl ON bl."id" = t."listId"
)
UPDATE "Task" t
SET "issueNumber" = numbered.n
FROM numbered
WHERE numbered.task_id = t."id";

-- 3) Seed each board's counter to its highest assigned number so new cards
--    continue the sequence without colliding.
UPDATE "Board" b
SET "issueSeq" = COALESCE(maxn.m, 0)
FROM (
  SELECT bl."boardId" AS board_id, MAX(t."issueNumber") AS m
  FROM "Task" t
  JOIN "BoardList" bl ON bl."id" = t."listId"
  GROUP BY bl."boardId"
) maxn
WHERE maxn.board_id = b."id";

-- 4) Reporter defaults to the card's creator.
UPDATE "Task" SET "reporterId" = "creatorId" WHERE "reporterId" IS NULL;

-- 5) Workflow status derived from the card's current list name (mirrors
--    statusForList in lib/issues.ts). Unmatched lists stay TODO.
UPDATE "Task" t
SET "status" = CASE LOWER(TRIM(bl."name"))
  WHEN 'in progress' THEN 'IN_PROGRESS'
  WHEN 'doing'       THEN 'IN_PROGRESS'
  WHEN 'review'      THEN 'IN_REVIEW'
  WHEN 'in review'   THEN 'IN_REVIEW'
  WHEN 'qa'          THEN 'IN_REVIEW'
  WHEN 'done'        THEN 'DONE'
  WHEN 'closed'      THEN 'DONE'
  WHEN 'shipped'     THEN 'DONE'
  ELSE 'TODO'
END
FROM "BoardList" bl
WHERE bl."id" = t."listId";
