-- CreateTable: per-user manual ordering of the projects list. One row per
-- (user, project) the user has dragged into place; lowest sortOrder shows
-- first. Projects with no row fall back to the default createdAt-desc order.
-- Child join (no tenantId): tenancy is inherited through the project relation.
CREATE TABLE "ProjectOrder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "ProjectOrder_pkey" PRIMARY KEY ("id")
);

-- One ordering row per user per project.
CREATE UNIQUE INDEX "ProjectOrder_userId_projectId_key" ON "ProjectOrder"("userId", "projectId");

-- Fast lookup of a user's order, already sorted.
CREATE INDEX "ProjectOrder_userId_sortOrder_idx" ON "ProjectOrder"("userId", "sortOrder");

ALTER TABLE "ProjectOrder" ADD CONSTRAINT "ProjectOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectOrder" ADD CONSTRAINT "ProjectOrder_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
