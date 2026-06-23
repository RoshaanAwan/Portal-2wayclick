-- Finding 3: cache committed payroll on Project.
-- Add the column with a default of 0, then backfill it from the current active
-- salaries so existing rows are correct immediately (not 0 until the next write).

ALTER TABLE "Project" ADD COLUMN "committedCents" INTEGER NOT NULL DEFAULT 0;

-- Backfill: committedCents = sum of active salaries' component amounts per project.
UPDATE "Project" p
SET "committedCents" = COALESCE(sub.cents, 0)
FROM (
  SELECT s."projectId" AS project_id, SUM(c."amountCents") AS cents
  FROM "ProjectSalary" s
  JOIN "SalaryComponent" c ON c."salaryId" = s.id
  WHERE s.active = true
  GROUP BY s."projectId"
) sub
WHERE p.id = sub.project_id;
