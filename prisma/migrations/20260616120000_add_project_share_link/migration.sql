-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "shareToken" TEXT;

-- CreateTable
CREATE TABLE "ClientSubmission" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "title" TEXT,
    "body" TEXT NOT NULL,
    "taskId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClientSubmission_projectId_createdAt_idx" ON "ClientSubmission"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "ClientSubmission_taskId_idx" ON "ClientSubmission"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "Project_shareToken_key" ON "Project"("shareToken");

-- AddForeignKey
ALTER TABLE "ClientSubmission" ADD CONSTRAINT "ClientSubmission_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientSubmission" ADD CONSTRAINT "ClientSubmission_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

