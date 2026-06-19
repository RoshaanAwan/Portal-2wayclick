-- CreateTable
CREATE TABLE "SalaryPayment" (
    "id" TEXT NOT NULL,
    "salaryId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL DEFAULT 0,
    "paidOn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalaryPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SalaryPayment_salaryId_idx" ON "SalaryPayment"("salaryId");

-- AddForeignKey
ALTER TABLE "SalaryPayment" ADD CONSTRAINT "SalaryPayment_salaryId_fkey" FOREIGN KEY ("salaryId") REFERENCES "ProjectSalary"("id") ON DELETE CASCADE ON UPDATE CASCADE;
