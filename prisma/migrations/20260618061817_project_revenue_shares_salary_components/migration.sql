/*
  Warnings:

  - You are about to drop the column `bdCents` on the `ProjectSalary` table. All the data in the column will be lost.
  - You are about to drop the column `devCents` on the `ProjectSalary` table. All the data in the column will be lost.
  - You are about to drop the column `leadCents` on the `ProjectSalary` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "revenueCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "revenueCurrency" TEXT NOT NULL DEFAULT 'USD';

-- AlterTable
ALTER TABLE "ProjectSalary" DROP COLUMN "bdCents",
DROP COLUMN "devCents",
DROP COLUMN "leadCents";

-- CreateTable
CREATE TABLE "SalaryComponent" (
    "id" TEXT NOT NULL,
    "salaryId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL DEFAULT 0,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SalaryComponent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectShareLine" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "percentBps" INTEGER,
    "amountCents" INTEGER,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectShareLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SalaryComponent_salaryId_idx" ON "SalaryComponent"("salaryId");

-- CreateIndex
CREATE INDEX "ProjectShareLine_projectId_idx" ON "ProjectShareLine"("projectId");

-- AddForeignKey
ALTER TABLE "SalaryComponent" ADD CONSTRAINT "SalaryComponent_salaryId_fkey" FOREIGN KEY ("salaryId") REFERENCES "ProjectSalary"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectShareLine" ADD CONSTRAINT "ProjectShareLine_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
