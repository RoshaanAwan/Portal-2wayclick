-- Multi-tenancy: add Tenant + tenantId to every tenant-root table, backfill all
-- existing rows into a single "default" tenant, then enforce NOT NULL + FKs +
-- per-tenant unique constraints. Hand-authored (not raw `prisma migrate dev`)
-- so the new tenantId columns are added NULLABLE, backfilled, and only THEN made
-- NOT NULL — otherwise ADD COLUMN ... NOT NULL would fail on populated tables.

-- ── 1. Tenant table + the default tenant ────────────────────────────────────
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "subdomain" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "suspendedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Tenant_subdomain_key" ON "Tenant"("subdomain");
CREATE INDEX "Tenant_status_idx" ON "Tenant"("status");

-- The default tenant that every pre-existing row is moved into. Fixed id so the
-- app/seed can reference it; subdomain 'default' is treated as the bare-host
-- tenant by middleware in local/dev.
INSERT INTO "Tenant" ("id", "subdomain", "name", "status")
VALUES ('default', 'default', '2WayClick', 'active');

-- ── 2. Add tenantId columns NULLABLE (+ the non-tenant additions) ────────────
ALTER TABLE "User"             ADD COLUMN "tenantId" TEXT;
ALTER TABLE "User"             ADD COLUMN "isPlatformAdmin" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Session"          ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Session"          ADD COLUMN "impersonatedBy" TEXT;
ALTER TABLE "LoginTicket"      ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Announcement"     ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Document"         ADD COLUMN "tenantId" TEXT;
ALTER TABLE "LeaveRequest"     ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Attendance"       ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Activity"         ADD COLUMN "tenantId" TEXT;
ALTER TABLE "AuditLog"         ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Board"            ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Project"          ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Conversation"     ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Task"             ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Notification"     ADD COLUMN "tenantId" TEXT;
ALTER TABLE "PushSubscription" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Invoice"          ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Expense"          ADD COLUMN "tenantId" TEXT;
ALTER TABLE "UserSalary"       ADD COLUMN "tenantId" TEXT;
ALTER TABLE "BrandingSettings" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "BrandingSettings" ALTER COLUMN "id" DROP DEFAULT;

-- ── 3. Backfill every row into the default tenant ───────────────────────────
UPDATE "User"             SET "tenantId" = 'default' WHERE "tenantId" IS NULL;
UPDATE "Session"          SET "tenantId" = 'default' WHERE "tenantId" IS NULL;
UPDATE "LoginTicket"      SET "tenantId" = 'default' WHERE "tenantId" IS NULL;
UPDATE "Announcement"     SET "tenantId" = 'default' WHERE "tenantId" IS NULL;
UPDATE "Document"         SET "tenantId" = 'default' WHERE "tenantId" IS NULL;
UPDATE "LeaveRequest"     SET "tenantId" = 'default' WHERE "tenantId" IS NULL;
UPDATE "Attendance"       SET "tenantId" = 'default' WHERE "tenantId" IS NULL;
UPDATE "Activity"         SET "tenantId" = 'default' WHERE "tenantId" IS NULL;
UPDATE "AuditLog"         SET "tenantId" = 'default' WHERE "tenantId" IS NULL;
UPDATE "Board"            SET "tenantId" = 'default' WHERE "tenantId" IS NULL;
UPDATE "Project"          SET "tenantId" = 'default' WHERE "tenantId" IS NULL;
UPDATE "Conversation"     SET "tenantId" = 'default' WHERE "tenantId" IS NULL;
UPDATE "Task"             SET "tenantId" = 'default' WHERE "tenantId" IS NULL;
UPDATE "Notification"     SET "tenantId" = 'default' WHERE "tenantId" IS NULL;
UPDATE "PushSubscription" SET "tenantId" = 'default' WHERE "tenantId" IS NULL;
UPDATE "Invoice"          SET "tenantId" = 'default' WHERE "tenantId" IS NULL;
UPDATE "Expense"          SET "tenantId" = 'default' WHERE "tenantId" IS NULL;
UPDATE "UserSalary"       SET "tenantId" = 'default' WHERE "tenantId" IS NULL;
-- BrandingSettings: the existing "singleton" row (if any) becomes the default
-- tenant's branding.
UPDATE "BrandingSettings" SET "tenantId" = 'default' WHERE "tenantId" IS NULL;

-- Promote the default tenant's SUPER_ADMIN(s) to platform admin so the operator
-- isn't locked out of the new /admin/tenants area.
UPDATE "User" SET "isPlatformAdmin" = true
WHERE "tenantId" = 'default' AND "role" = 'SUPER_ADMIN';

-- ── 4. Enforce NOT NULL now that every row has a tenant ─────────────────────
ALTER TABLE "User"             ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Session"          ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "LoginTicket"      ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Announcement"     ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Document"         ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "LeaveRequest"     ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Attendance"       ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Activity"         ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "AuditLog"         ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Board"            ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Project"          ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Conversation"     ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Task"             ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Notification"     ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "PushSubscription" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Invoice"          ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Expense"          ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "UserSalary"       ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "BrandingSettings" ALTER COLUMN "tenantId" SET NOT NULL;

-- ── 5. Swap global uniques → per-tenant composites ──────────────────────────
DROP INDEX "User_email_key";
DROP INDEX "User_slackUserId_key";
DROP INDEX "Invoice_number_key";
DROP INDEX "Conversation_dmKey_key";

CREATE UNIQUE INDEX "User_tenantId_email_key" ON "User"("tenantId", "email");
CREATE UNIQUE INDEX "User_tenantId_slackUserId_key" ON "User"("tenantId", "slackUserId");
CREATE UNIQUE INDEX "Invoice_tenantId_number_key" ON "Invoice"("tenantId", "number");
CREATE UNIQUE INDEX "Conversation_tenantId_dmKey_key" ON "Conversation"("tenantId", "dmKey");
CREATE UNIQUE INDEX "BrandingSettings_tenantId_key" ON "BrandingSettings"("tenantId");

-- ── 6. tenantId indexes ─────────────────────────────────────────────────────
CREATE INDEX "User_tenantId_idx"             ON "User"("tenantId");
CREATE INDEX "Session_tenantId_idx"          ON "Session"("tenantId");
CREATE INDEX "LoginTicket_tenantId_idx"      ON "LoginTicket"("tenantId");
CREATE INDEX "Announcement_tenantId_idx"     ON "Announcement"("tenantId");
CREATE INDEX "Document_tenantId_idx"         ON "Document"("tenantId");
CREATE INDEX "LeaveRequest_tenantId_idx"     ON "LeaveRequest"("tenantId");
CREATE INDEX "Attendance_tenantId_idx"       ON "Attendance"("tenantId");
CREATE INDEX "Activity_tenantId_idx"         ON "Activity"("tenantId");
CREATE INDEX "AuditLog_tenantId_idx"         ON "AuditLog"("tenantId");
CREATE INDEX "Board_tenantId_idx"            ON "Board"("tenantId");
CREATE INDEX "Project_tenantId_idx"          ON "Project"("tenantId");
CREATE INDEX "Conversation_tenantId_idx"     ON "Conversation"("tenantId");
CREATE INDEX "Task_tenantId_idx"             ON "Task"("tenantId");
CREATE INDEX "Notification_tenantId_idx"     ON "Notification"("tenantId");
CREATE INDEX "PushSubscription_tenantId_idx" ON "PushSubscription"("tenantId");
CREATE INDEX "Invoice_tenantId_idx"          ON "Invoice"("tenantId");
CREATE INDEX "Expense_tenantId_idx"          ON "Expense"("tenantId");
CREATE INDEX "UserSalary_tenantId_idx"       ON "UserSalary"("tenantId");

-- ── 7. Foreign keys to Tenant ───────────────────────────────────────────────
ALTER TABLE "User"             ADD CONSTRAINT "User_tenantId_fkey"             FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Session"          ADD CONSTRAINT "Session_tenantId_fkey"          FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LoginTicket"      ADD CONSTRAINT "LoginTicket_tenantId_fkey"      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Announcement"     ADD CONSTRAINT "Announcement_tenantId_fkey"     FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Document"         ADD CONSTRAINT "Document_tenantId_fkey"         FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LeaveRequest"     ADD CONSTRAINT "LeaveRequest_tenantId_fkey"     FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Attendance"       ADD CONSTRAINT "Attendance_tenantId_fkey"       FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Activity"         ADD CONSTRAINT "Activity_tenantId_fkey"         FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditLog"         ADD CONSTRAINT "AuditLog_tenantId_fkey"         FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Board"            ADD CONSTRAINT "Board_tenantId_fkey"            FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Project"          ADD CONSTRAINT "Project_tenantId_fkey"          FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Conversation"     ADD CONSTRAINT "Conversation_tenantId_fkey"     FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Task"             ADD CONSTRAINT "Task_tenantId_fkey"             FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Notification"     ADD CONSTRAINT "Notification_tenantId_fkey"     FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Invoice"          ADD CONSTRAINT "Invoice_tenantId_fkey"          FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Expense"          ADD CONSTRAINT "Expense_tenantId_fkey"          FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserSalary"       ADD CONSTRAINT "UserSalary_tenantId_fkey"       FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BrandingSettings" ADD CONSTRAINT "BrandingSettings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
