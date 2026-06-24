-- DropForeignKey
ALTER TABLE "Announcement" DROP CONSTRAINT "Announcement_authorId_fkey";

-- AlterTable
ALTER TABLE "Announcement" ADD COLUMN     "authorName" TEXT,
ALTER COLUMN "authorId" DROP NOT NULL,
ALTER COLUMN "tenantId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "ConversationMember" ALTER COLUMN "lastReadAt" SET DEFAULT '1970-01-01 00:00:00'::timestamp;

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
