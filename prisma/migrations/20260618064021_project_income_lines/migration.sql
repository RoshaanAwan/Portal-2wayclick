-- CreateTable
CREATE TABLE "ProjectIncomeLine" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL DEFAULT 0,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectIncomeLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectIncomeLine_projectId_idx" ON "ProjectIncomeLine"("projectId");

-- AddForeignKey
ALTER TABLE "ProjectIncomeLine" ADD CONSTRAINT "ProjectIncomeLine_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
