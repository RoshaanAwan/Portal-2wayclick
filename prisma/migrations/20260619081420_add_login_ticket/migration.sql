-- CreateTable
CREATE TABLE "LoginTicket" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginTicket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LoginTicket_token_key" ON "LoginTicket"("token");

-- CreateIndex
CREATE INDEX "LoginTicket_expiresAt_idx" ON "LoginTicket"("expiresAt");

-- AddForeignKey
ALTER TABLE "LoginTicket" ADD CONSTRAINT "LoginTicket_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
