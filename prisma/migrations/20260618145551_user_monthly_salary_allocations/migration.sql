-- CreateTable
CREATE TABLE "UserSalary" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "totalCents" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSalary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSalaryAllocation" (
    "id" TEXT NOT NULL,
    "salaryId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "percentBps" INTEGER,
    "amountCents" INTEGER,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "UserSalaryAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserSalary_userId_key" ON "UserSalary"("userId");

-- CreateIndex
CREATE INDEX "UserSalaryAllocation_salaryId_idx" ON "UserSalaryAllocation"("salaryId");

-- CreateIndex
CREATE INDEX "UserSalaryAllocation_projectId_idx" ON "UserSalaryAllocation"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "UserSalaryAllocation_salaryId_projectId_key" ON "UserSalaryAllocation"("salaryId", "projectId");

-- AddForeignKey
ALTER TABLE "UserSalary" ADD CONSTRAINT "UserSalary_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSalaryAllocation" ADD CONSTRAINT "UserSalaryAllocation_salaryId_fkey" FOREIGN KEY ("salaryId") REFERENCES "UserSalary"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSalaryAllocation" ADD CONSTRAINT "UserSalaryAllocation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
