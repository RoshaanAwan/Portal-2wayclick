-- A salary may now be entered by a FREE-TEXT employee name (no userId). Such a
-- row is identified by (projectId, userName), so editing its cells upserts the
-- same record. Add the matching unique to back that key. Real-user rows continue
-- to dedupe on the existing (projectId, userId) unique.
CREATE UNIQUE INDEX "ProjectSalary_projectId_userName_key" ON "ProjectSalary"("projectId", "userName");
