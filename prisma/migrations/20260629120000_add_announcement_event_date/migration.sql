-- AlterTable: pin an announcement to a calendar date (e.g. a holiday or event
-- day) so the dashboard Calendar can surface it on that day. Null = a plain feed
-- post with no calendar placement. See app/(app)/dashboard/CalendarSection.tsx.
ALTER TABLE "Announcement" ADD COLUMN "eventDate" TIMESTAMP(3);

-- CreateIndex: the calendar fetches posts within a date window.
CREATE INDEX "Announcement_eventDate_idx" ON "Announcement"("eventDate");
