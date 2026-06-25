-- CreateTable
CREATE TABLE "AttendanceBreak" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "attendanceId" TEXT NOT NULL,
    "day" TIMESTAMP(3) NOT NULL,
    "breakInAt" TIMESTAMP(3) NOT NULL,
    "breakOutAt" TIMESTAMP(3),
    "source" TEXT NOT NULL DEFAULT 'slack',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceBreak_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SlackWebhookEvent" (
    "id" TEXT NOT NULL,
    "slackUserId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "ts" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SlackWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AttendanceBreak_attendanceId_idx" ON "AttendanceBreak"("attendanceId");

-- CreateIndex
CREATE INDEX "AttendanceBreak_userId_day_idx" ON "AttendanceBreak"("userId", "day");

-- CreateIndex
CREATE INDEX "AttendanceBreak_tenantId_idx" ON "AttendanceBreak"("tenantId");

-- CreateIndex
CREATE INDEX "SlackWebhookEvent_createdAt_idx" ON "SlackWebhookEvent"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SlackWebhookEvent_slackUserId_action_ts_key" ON "SlackWebhookEvent"("slackUserId", "action", "ts");

-- AddForeignKey
ALTER TABLE "AttendanceBreak" ADD CONSTRAINT "AttendanceBreak_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceBreak" ADD CONSTRAINT "AttendanceBreak_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceBreak" ADD CONSTRAINT "AttendanceBreak_attendanceId_fkey" FOREIGN KEY ("attendanceId") REFERENCES "Attendance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
