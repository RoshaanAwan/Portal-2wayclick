-- AlterTable
ALTER TABLE "ConversationMember" ALTER COLUMN "lastReadAt" SET DEFAULT '1970-01-01 00:00:00'::timestamp;

-- CreateIndex
CREATE INDEX "Expense_status_createdAt_idx" ON "Expense"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Expense_projectId_createdAt_idx" ON "Expense"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "LeaveRequest_ownerId_createdAt_idx" ON "LeaveRequest"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "Message_createdAt_idx" ON "Message"("createdAt");

-- CreateIndex
CREATE INDEX "Message_senderId_idx" ON "Message"("senderId");
