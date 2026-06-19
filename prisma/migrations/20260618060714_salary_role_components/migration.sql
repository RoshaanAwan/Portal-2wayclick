/*
  Warnings:

  - You are about to drop the column `amountCents` on the `ProjectSalary` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "ProjectSalary" DROP COLUMN "amountCents",
ADD COLUMN     "bdCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "devCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "leadCents" INTEGER NOT NULL DEFAULT 0;
