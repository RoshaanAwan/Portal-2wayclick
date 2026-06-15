import "server-only";
import { db } from "./db";
import { recordActivity } from "./activityFeed";

// ── Attendance recorder ───────────────────────────────────────────────────────
// Turns a stream of Slack "check in" / "check out" events into one Attendance
// row per user per day (see the Attendance model in schema.prisma). The Slack
// bot forwards events to POST /api/attendance/slack, which resolves the Slack
// user to a portal User and calls recordCheckIn / recordCheckOut here.
//
// Idempotent by design: the unique [userId, day] constraint means repeated
// events for the same day update the same row. A double check-in just bumps the
// event counter and keeps the earliest checkInAt; a check-out always advances
// checkOutAt to the latest time seen.

export type AttendanceStatus = "PRESENT" | "CHECKED_OUT";

// The business timezone for attendance. A "day" is a calendar day in Pakistan
// (UTC+5), not in the server's timezone (Vercel runs in UTC). This keeps the
// day boundary correct for the team regardless of where the server runs — e.g.
// a 1 AM PKT check-in belongs to that PKT date, not the prior UTC date.
export const ATTENDANCE_TZ = "Asia/Karachi";

/**
 * The row's `day` key for an instant, as the calendar date in ATTENDANCE_TZ.
 *
 * We compute the Y/M/D as seen in Pakistan, then anchor it to UTC midnight of
 * that date. Storing it at UTC midnight (rather than PKT midnight) makes the
 * value stable and unambiguous: the same PKT date always maps to the same
 * stored instant, so the unique [userId, day] constraint groups events by PKT
 * day no matter the server timezone. Read it back with the same TZ for display.
 */
export function dayKey(at: Date): Date {
  // en-CA formats as YYYY-MM-DD, which we can append a UTC time to directly.
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: ATTENDANCE_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
  return new Date(`${ymd}T00:00:00.000Z`);
}

/** Minimal actor identity the recorder needs (matches SafeUser's shape). */
export interface AttendanceActor {
  id: string;
  name: string;
  title: string;
  avatarUrl?: string | null;
}

/**
 * Record a check-in. Opens (or re-opens) the user's row for that day:
 * sets status PRESENT, stamps checkInAt on first check-in of the day, and
 * bumps the event counter. Returns the row's day and resulting status.
 */
export async function recordCheckIn(
  actor: AttendanceActor,
  at: Date,
  source = "slack",
) {
  const day = dayKey(at);

  const row = await db.attendance.upsert({
    where: { userId_day: { userId: actor.id, day } },
    create: {
      userId: actor.id,
      day,
      checkInAt: at,
      status: "PRESENT",
      source,
      events: 1,
    },
    update: {
      // Keep the earliest check-in of the day; a second "check in" just means
      // they're back (e.g. after lunch). Re-open the day to PRESENT.
      checkInAt: undefined, // leave existing value untouched on conflict
      status: "PRESENT",
      events: { increment: 1 },
    },
  });

  // If this is the first time we've ever seen a check-in for the row (e.g. the
  // row was somehow created without one), backfill it.
  if (!row.checkInAt) {
    await db.attendance.update({
      where: { id: row.id },
      data: { checkInAt: at },
    });
  }

  await recordActivity({
    actor,
    verb: "joined",
    target: "checked in",
    meta: { kind: "attendance.checkin", at: at.toISOString(), source },
  });

  return { day, status: "PRESENT" as AttendanceStatus };
}

/**
 * Record a check-out. Stamps the latest checkOutAt and flips status to
 * CHECKED_OUT. If we never saw a check-in (bot missed it), the row is still
 * created so the day isn't lost.
 */
export async function recordCheckOut(
  actor: AttendanceActor,
  at: Date,
  source = "slack",
) {
  const day = dayKey(at);

  await db.attendance.upsert({
    where: { userId_day: { userId: actor.id, day } },
    create: {
      userId: actor.id,
      day,
      checkOutAt: at,
      status: "CHECKED_OUT",
      source,
      events: 1,
    },
    update: {
      checkOutAt: at,
      status: "CHECKED_OUT",
      events: { increment: 1 },
    },
  });

  await recordActivity({
    actor,
    verb: "joined",
    target: "checked out",
    meta: { kind: "attendance.checkout", at: at.toISOString(), source },
  });

  return { day, status: "CHECKED_OUT" as AttendanceStatus };
}
