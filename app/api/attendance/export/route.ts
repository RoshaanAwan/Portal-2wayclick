import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import {
  dayKey,
  dayKeyToString,
  parseDayKey,
  ATTENDANCE_TZ,
  breakMinutes,
  netWorkedMinutes,
} from "@/lib/attendance";

// GET /api/attendance/export?date=YYYY-MM-DD
// Downloads the whole-company attendance roster for one day as CSV. Same data
// and tier gate as the manager view on /attendance (manager tier only), so HR
// and admins can pull a day for payroll/records. Defaults to today when `date`
// is missing or malformed; never serves a day past today.

/** Wrap a field for CSV: quote it and escape embedded quotes. */
function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

/** A timestamp as HH:MM in the business timezone, or empty if absent. */
function fmtTime(d: Date | null): string {
  if (!d) return "";
  return d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: ATTENDANCE_TZ,
  });
}

/** Minutes as "Hh Mm", or empty when null (incomplete day). */
function fmtMinutes(mins: number | null): string {
  if (mins === null) return "";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!can.viewAllAttendance(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const today = dayKey(new Date());
  const url = new URL(req.url);
  const requested = parseDayKey(url.searchParams.get("date")) ?? today;
  const selected = requested.getTime() > today.getTime() ? today : requested;
  const ymd = dayKeyToString(selected);

  // Every user, left-joined to the selected day's attendance — mirrors the page
  // so the export matches what a manager sees on screen (including "Not in").
  const [users, rows] = await Promise.all([
    db.user.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, title: true, department: true },
    }),
    db.attendance.findMany({
      where: { day: selected },
      include: { breaks: { select: { breakInAt: true, breakOutAt: true } } },
    }),
  ]);
  const byUser = new Map(rows.map((a) => [a.userId, a]));

  const header = [
    "Name",
    "Title",
    "Department",
    "Status",
    "Check-in",
    "Check-out",
    "Break",
    "Net worked",
  ];
  const lines = [header.map(csvCell).join(",")];
  for (const u of users) {
    const a = byUser.get(u.id);
    const STATUS_LABELS: Record<string, string> = {
      PRESENT: "Present",
      CHECKED_OUT: "Checked out",
      ABSENT: "Absent",
      HALF_LEAVE: "Half-leave",
    };
    const status = !a ? "Not in" : STATUS_LABELS[a.status] ?? a.status;
    const breakMins = a ? breakMinutes(a.breaks) : 0;
    const net = a ? netWorkedMinutes(a.checkInAt, a.checkOutAt, a.breaks) : null;
    lines.push(
      [
        u.name ?? "",
        u.title ?? "",
        u.department ?? "",
        status,
        fmtTime(a?.checkInAt ?? null),
        fmtTime(a?.checkOutAt ?? null),
        breakMins > 0 ? fmtMinutes(breakMins) : "",
        fmtMinutes(net),
      ]
        .map(csvCell)
        .join(","),
    );
  }
  // Prepend a BOM so Excel reads UTF-8 names correctly.
  const csv = "﻿" + lines.join("\r\n") + "\r\n";

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="attendance-${ymd}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
