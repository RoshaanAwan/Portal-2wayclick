-- Add the completion timestamp + its index.
ALTER TABLE "Task" ADD COLUMN "completedAt" TIMESTAMP(3);

CREATE INDEX "Task_completedAt_idx" ON "Task"("completedAt");

-- Backfill: cards already sitting in a DONE status are treated as completed at
-- their creation time (best-effort — we have no real completion timestamp for
-- historical rows). Going forward the app sets completedAt on the DONE
-- transition, so this only ever runs once.
UPDATE "Task" SET "completedAt" = "createdAt" WHERE "status" = 'DONE';
