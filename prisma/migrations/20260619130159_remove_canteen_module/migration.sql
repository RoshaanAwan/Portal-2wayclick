/*
  Warnings:

  - You are about to drop the `CanteenExpense` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "CanteenExpense" DROP CONSTRAINT "CanteenExpense_reviewerId_fkey";

-- DropForeignKey
ALTER TABLE "CanteenExpense" DROP CONSTRAINT "CanteenExpense_submitterId_fkey";

-- AlterTable
ALTER TABLE "ConversationMember" ALTER COLUMN "lastReadAt" SET DEFAULT '1970-01-01 00:00:00'::timestamp;

-- DropTable
DROP TABLE "CanteenExpense";
