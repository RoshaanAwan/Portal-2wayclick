-- Project / tech lead seats (both optional, assignable at create or later).
ALTER TABLE "Project" ADD COLUMN "projectLeadId" TEXT;
ALTER TABLE "Project" ADD COLUMN "techLeadId" TEXT;

ALTER TABLE "Project" ADD CONSTRAINT "Project_projectLeadId_fkey"
  FOREIGN KEY ("projectLeadId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Project" ADD CONSTRAINT "Project_techLeadId_fkey"
  FOREIGN KEY ("techLeadId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
