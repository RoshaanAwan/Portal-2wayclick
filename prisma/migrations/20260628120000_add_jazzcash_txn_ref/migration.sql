-- AlterTable: record the last verified JazzCash transaction reference per tenant,
-- so a replayed/duplicate callback can't double-credit the same one-off payment
-- (pay-per-period activation is idempotent on this ref). See lib/billing.ts.
ALTER TABLE "Tenant" ADD COLUMN "jazzCashLastTxnRef" TEXT;
