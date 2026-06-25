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

// Result of a break event. "ignored" carries a reason so the webhook can return
// a benign 202 (no retry) rather than an error the bot would keep redelivering.
export type BreakResult =
  | { ok: true; action: "break_in" | "break_out"; day: Date }
  | { ok: false; ignored: true; reason: string; day: Date };

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

/**
 * Render a `day` key back to its YYYY-MM-DD string. Because the key is anchored
 * at UTC midnight of the PKT date (see dayKey), reading it in UTC recovers the
 * original calendar date — this is the value used in URLs and <input type=date>.
 */
export function dayKeyToString(day: Date): string {
  return day.toISOString().slice(0, 10);
}

/**
 * Parse a YYYY-MM-DD string (e.g. from a URL or date input) into a `day` key,
 * the same UTC-midnight anchor dayKey produces. Returns null if the string is
 * not a well-formed calendar date, so callers can fall back to "today".
 */
export function parseDayKey(ymd: string | null | undefined): Date | null {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const at = new Date(`${ymd}T00:00:00.000Z`);
  if (Number.isNaN(at.getTime())) return null;
  // Round-trip guard: rejects impossible dates like 2026-02-31 that Date would
  // otherwise roll over silently.
  if (at.toISOString().slice(0, 10) !== ymd) return null;
  return at;
}

/** A `day` key shifted by whole days, staying anchored at UTC midnight. */
export function addDays(day: Date, delta: number): Date {
  return new Date(day.getTime() + delta * 86_400_000);
}

/** Minimal actor identity the recorder needs (matches SafeUser's shape). */
export interface AttendanceActor {
  id: string;
  name: string;
  title: string;
  avatarUrl?: string | null;
  // The user's tenant — stamped onto the Attendance row. The Slack webhook
  // resolves this from the matched user (it has no subdomain), and runs the
  // record inside that tenant's context.
  tenantId: string;
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
      tenantId: actor.tenantId,
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

  const row = await db.attendance.upsert({
    where: { userId_day: { userId: actor.id, day } },
    create: {
      tenantId: actor.tenantId,
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

  // Auto-close any break the user left open: a check-out implies the break is
  // over. Stamp it at the check-out time so its duration is bounded by the day.
  await closeOpenBreaks(actor.id, day, at);

  await recordActivity({
    actor,
    verb: "joined",
    target: "checked out",
    meta: { kind: "attendance.checkout", at: at.toISOString(), source },
  });

  return { day, status: "CHECKED_OUT" as AttendanceStatus, id: row.id };
}

// ── Breaks ────────────────────────────────────────────────────────────────────
// A break is a span within a day the user is away (lunch, etc.). One AttendanceBreak
// row per break; a day may have several. break_in opens a row (breakOutAt null);
// break_out closes the open one. Net worked time subtracts the sum of break spans
// from (checkOut − checkIn). See the AttendanceBreak model in schema.prisma.

/**
 * Record a break_in. Opens a new break row for the user's day.
 *
 * Ignored (returns ok:false) when:
 *  - there is no open attendance for today (they never checked in / already out),
 *  - there is already an open break (can't start a second one while away).
 * These are benign no-ops, not errors, so a stray event doesn't break the day.
 */
export async function recordBreakIn(
  actor: AttendanceActor,
  at: Date,
  source = "slack",
): Promise<BreakResult> {
  const day = dayKey(at);

  // Must be checked in and not yet checked out — a break only makes sense while
  // the user is actively present.
  const attendance = await db.attendance.findUnique({
    where: { userId_day: { userId: actor.id, day } },
    select: { id: true, status: true },
  });
  if (!attendance || attendance.status !== "PRESENT") {
    return { ok: false, ignored: true, reason: "no_open_attendance", day };
  }

  // Reject a second concurrent break: they must break_out first.
  const open = await db.attendanceBreak.findFirst({
    where: { userId: actor.id, day, breakOutAt: null },
    select: { id: true },
  });
  if (open) {
    return { ok: false, ignored: true, reason: "break_already_open", day };
  }

  await db.attendanceBreak.create({
    data: {
      tenantId: actor.tenantId,
      userId: actor.id,
      attendanceId: attendance.id,
      day,
      breakInAt: at,
      source,
    },
  });

  await recordActivity({
    actor,
    verb: "joined",
    target: "started a break",
    meta: { kind: "attendance.break_in", at: at.toISOString(), source },
  });

  return { ok: true, action: "break_in", day };
}

/**
 * Record a break_out. Stamps breakOutAt on the user's open break for the day.
 * If none is open (already closed, or no break_in was seen), it's a safe no-op.
 */
export async function recordBreakOut(
  actor: AttendanceActor,
  at: Date,
  source = "slack",
): Promise<BreakResult> {
  const day = dayKey(at);

  const open = await db.attendanceBreak.findFirst({
    where: { userId: actor.id, day, breakOutAt: null },
    orderBy: { breakInAt: "desc" },
    select: { id: true, breakInAt: true },
  });
  if (!open) {
    return { ok: false, ignored: true, reason: "no_open_break", day };
  }

  // Guard against a break_out whose ts precedes the break_in (clock skew /
  // out-of-order delivery): clamp to the break_in so the span is never negative.
  const closeAt = at.getTime() < open.breakInAt.getTime() ? open.breakInAt : at;

  await db.attendanceBreak.update({
    where: { id: open.id },
    data: { breakOutAt: closeAt },
  });

  await recordActivity({
    actor,
    verb: "joined",
    target: "ended a break",
    meta: { kind: "attendance.break_out", at: at.toISOString(), source },
  });

  return { ok: true, action: "break_out", day };
}

/**
 * Force-close every still-open break for a user's day at `at`, marking them
 * "sweep" so a dangling break (no break_out received) doesn't read as infinite.
 * Called on check-out and by the end-of-day sweep. Returns the count closed.
 */
export async function closeOpenBreaks(
  userId: string,
  day: Date,
  at: Date,
  source = "sweep",
): Promise<number> {
  // Use a raw updateMany so a break_in that's somehow after `at` (skew) still
  // closes to a non-negative span: clamp via GREATEST isn't available portably,
  // so we read then update the rare open rows individually.
  const open = await db.attendanceBreak.findMany({
    where: { userId, day, breakOutAt: null },
    select: { id: true, breakInAt: true },
  });
  if (open.length === 0) return 0;

  await Promise.all(
    open.map((b) =>
      db.attendanceBreak.update({
        where: { id: b.id },
        data: {
          breakOutAt: at.getTime() < b.breakInAt.getTime() ? b.breakInAt : at,
          source,
        },
      }),
    ),
  );
  return open.length;
}

/**
 * End-of-day sweep: close any break still open for a past day so it never
 * dangles into the next day. Closes each at that day's end (UTC-anchored
 * day key + 24h is the next PKT midnight). Intended for a daily cron. Operates
 * across the current tenant context; call once per tenant (or via adminDb).
 */
export async function sweepOpenBreaks(beforeDay: Date): Promise<number> {
  const stale = await db.attendanceBreak.findMany({
    where: { breakOutAt: null, day: { lt: beforeDay } },
    select: { id: true, day: true, breakInAt: true },
  });
  let closed = 0;
  for (const b of stale) {
    const endOfDay = new Date(b.day.getTime() + 86_400_000);
    const closeAt = endOfDay.getTime() < b.breakInAt.getTime() ? b.breakInAt : endOfDay;
    await db.attendanceBreak.update({
      where: { id: b.id },
      data: { breakOutAt: closeAt, source: "sweep" },
    });
    closed++;
  }
  return closed;
}

/** Sum of completed break durations (minutes) for a set of break rows. */
export function breakMinutes(
  breaks: { breakInAt: Date; breakOutAt: Date | null }[],
): number {
  let ms = 0;
  for (const b of breaks) {
    if (b.breakOutAt) ms += b.breakOutAt.getTime() - b.breakInAt.getTime();
  }
  return Math.round(ms / 60000);
}

/**
 * Net worked minutes for a day: (checkOut − checkIn) − total break minutes.
 * Returns null when the day isn't complete (no check-in or no check-out). Never
 * negative (clamped to 0 in case breaks somehow exceed the gross span).
 */
export function netWorkedMinutes(
  checkInAt: Date | null,
  checkOutAt: Date | null,
  breaks: { breakInAt: Date; breakOutAt: Date | null }[],
): number | null {
  if (!checkInAt || !checkOutAt) return null;
  const gross = Math.round((checkOutAt.getTime() - checkInAt.getTime()) / 60000);
  return Math.max(0, gross - breakMinutes(breaks));
}
