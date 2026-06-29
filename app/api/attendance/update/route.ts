import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { can } from "@/lib/permissions";
import { ATTENDANCE_TZ, parseDayKey } from "@/lib/attendance";

// ── Admin attendance override ────────────────────────────────────────────────
// Lets an Admin-tier user correct a person's attendance for a day: set or clear
// the check-in / check-out times. Attendance is normally Slack-sourced (see
// [[slack-attendance]]); this is the manual correction path on top of it.
//
// Times arrive as wall-clock "HH:MM" in the business timezone (Pakistan) on the
// given calendar `day`; we resolve each to the correct UTC instant. Status is
// derived: CHECKED_OUT once a check-out exists, else PRESENT. Clearing both
// times deletes the row for the day (so it reads as "not in" / AWAY again).

const timeRe = /^([01]\d|2[0-3]):([0-5]\d)$/;

const schema = z.object({
  userId: z.string().min(1),
  // YYYY-MM-DD calendar day (business timezone).
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkIn: z.string().regex(timeRe).nullable(),
  checkOut: z.string().regex(timeRe).nullable(),
  // The day's disposition. "PRESENT" is the time-driven default (flips to
  // CHECKED_OUT when a check-out exists, or clears the day when no times are
  // given). "ABSENT" marks the day off; "HALF_LEAVE" a partial day (times
  // optional). Defaults to PRESENT for backward compatibility.
  status: z
    .enum(["PRESENT", "ABSENT", "HALF_LEAVE"])
    .optional()
    .default("PRESENT"),
});

/**
 * Resolve a wall-clock "HH:MM" on calendar date `ymd` in ATTENDANCE_TZ to the
 * matching UTC instant. We find the timezone's UTC offset for that date by
 * formatting a probe instant, then apply it. Pakistan has no DST, so a single
 * offset for the day is exact.
 */
function tzWallClockToUTC(ymd: string, hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(Number);
  // Probe: midday UTC on the date is safely inside the same PKT calendar day.
  const probe = new Date(`${ymd}T12:00:00.000Z`);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ATTENDANCE_TZ,
    hour: "2-digit",
    hour12: false,
  }).formatToParts(probe);
  const localHour = Number(parts.find((p) => p.type === "hour")?.value ?? "12");
  // offsetHours = localHour − 12 (how far ahead of UTC the zone is at midday).
  const offsetHours = localHour - 12;
  // The UTC time for local HH:MM = (HH:MM − offset).
  const base = new Date(`${ymd}T00:00:00.000Z`);
  base.setUTCMinutes(base.getUTCMinutes() + (h - offsetHours) * 60 + m);
  return base;
}

export async function POST(req: Request) {
  try {
    const actor = await requireTenantUser();
    if (!can.editAttendance(actor.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { userId, day, checkIn, checkOut, status: wantStatus } =
      schema.parse(await req.json());

    const dayKeyDate = parseDayKey(day);
    if (!dayKeyDate) {
      return NextResponse.json({ error: "Invalid date" }, { status: 400 });
    }

    // The target must be a real user in this tenant (db is tenant-scoped).
    const target = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true },
    });
    if (!target) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    // ABSENT carries no times — the day is explicitly off. Other statuses keep
    // any times supplied (HALF_LEAVE often has a check-in/out for the hours
    // worked; PRESENT is fully time-driven).
    const checkInAt =
      wantStatus !== "ABSENT" && checkIn ? tzWallClockToUTC(day, checkIn) : null;
    const checkOutAt =
      wantStatus !== "ABSENT" && checkOut
        ? tzWallClockToUTC(day, checkOut)
        : null;

    if (checkInAt && checkOutAt && checkOutAt < checkInAt) {
      return NextResponse.json(
        { error: "Check-out must be after check-in." },
        { status: 400 },
      );
    }

    // A plain PRESENT with no times means "clear" — remove the day entirely so
    // it reads as "not in" again. ABSENT/HALF_LEAVE are explicit states and are
    // always persisted (a row, even without times).
    if (wantStatus === "PRESENT" && !checkInAt && !checkOutAt) {
      await db.attendance.deleteMany({
        where: { userId, day: dayKeyDate },
      });
      await audit({
        actor,
        action: "attendance.update",
        entity: "Attendance",
        entityId: `${userId}:${day}`,
        targetUserId: userId,
        summary: `${actor.name} cleared ${target.name}'s attendance for ${day}`,
      });
      return NextResponse.json({ ok: true, cleared: true });
    }

    // Resolve the stored status: explicit ABSENT/HALF_LEAVE pass through;
    // PRESENT flips to CHECKED_OUT once a check-out time exists.
    const status =
      wantStatus === "PRESENT"
        ? checkOutAt
          ? "CHECKED_OUT"
          : "PRESENT"
        : wantStatus;

    await db.attendance.upsert({
      where: { userId_day: { userId, day: dayKeyDate } },
      create: {
        tenantId: actor.tenantId,
        userId,
        day: dayKeyDate,
        checkInAt,
        checkOutAt,
        status,
        source: "manual",
      },
      update: {
        checkInAt,
        checkOutAt,
        status,
        source: "manual",
      },
    });

    await audit({
      actor,
      action: "attendance.update",
      entity: "Attendance",
      entityId: `${userId}:${day}`,
      targetUserId: userId,
      summary: `${actor.name} updated ${target.name}'s attendance for ${day}`,
      detail: { checkIn, checkOut, status },
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (e?.name === "ZodError") {
      return NextResponse.json(
        { error: e.errors?.[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
