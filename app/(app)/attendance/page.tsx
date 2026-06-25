import { Clock, LayoutGrid, List } from "lucide-react";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui/PageHeader";
import { can } from "@/lib/permissions";
import {
  dayKey,
  dayKeyToString,
  parseDayKey,
  addDays,
  ATTENDANCE_TZ,
  breakMinutes,
  netWorkedMinutes,
} from "@/lib/attendance";
import { AttendanceDateNav } from "./AttendanceDateNav";
import { AttendanceBoardWrapper } from "./AttendanceBoardWrapper";

export const metadata = { title: "Attendance" };

// Attendance is sourced from Slack check-in/out events the local bot forwards to
// /api/attendance/slack. This page just reads the resulting rows:
//   • Manager tier → tabbed view: (1) daily roster, (2) 30-day heatmap board.
//   • Everyone else → their own recent days.
//
// All times/dates render in ATTENDANCE_TZ (Pakistan) so the page reads the same
// regardless of where the server runs (Vercel is UTC).

function fmtTime(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    timeZone: ATTENDANCE_TZ,
  });
}

/** Minutes as "Hh Mm" (or "Mm" under an hour); "—" for null. */
function fmtMinutes(mins: number | null): string {
  if (mins === null) return "—";
  if (mins === 0) return "0m";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function StatusPill({ status }: { status: "PRESENT" | "CHECKED_OUT" | "AWAY" }) {
  const map = {
    PRESENT: { label: "Present", cls: "bg-success-soft text-success" },
    CHECKED_OUT: { label: "Checked out", cls: "bg-surface-2 text-ink-500" },
    AWAY: { label: "Not in", cls: "bg-warn-soft text-warn" },
  } as const;
  const { label, cls } = map[status];
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}

const PUNCTUAL_HOUR = 10; // checked in by 10 AM = punctual
const FULL_DAY_MINUTES = 6 * 60;

function isWeekend(date: Date): boolean {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; view?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const today = dayKey(new Date());
  const seeAll = can.viewAllAttendance(user.role);

  if (seeAll) {
    const sp = await searchParams;
    const view = sp.view === "board" ? "board" : "roster";
    const requested = parseDayKey(sp.date) ?? today;
    const selected = requested.getTime() > today.getTime() ? today : requested;
    const isToday = selected.getTime() === today.getTime();

    // ── Daily roster (existing) ──────────────────────────────────────────────
    const [users, daysRows] = await Promise.all([
      db.user.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true, title: true, department: true, avatarUrl: true },
      }),
      db.attendance.findMany({
        where: { day: selected },
        include: { breaks: { select: { breakInAt: true, breakOutAt: true } } },
      }),
    ]);

    type RowStatus = "PRESENT" | "CHECKED_OUT" | "AWAY";
    const byUser = new Map(daysRows.map((a) => [a.userId, a]));
    const rows = users.map((u) => {
      const a = byUser.get(u.id);
      const status: RowStatus = !a ? "AWAY" : (a.status as "PRESENT" | "CHECKED_OUT");
      return {
        user: u,
        status,
        checkInAt: a?.checkInAt ?? null,
        checkOutAt: a?.checkOutAt ?? null,
        breakMins: a ? breakMinutes(a.breaks) : 0,
        netMins: a ? netWorkedMinutes(a.checkInAt, a.checkOutAt, a.breaks) : null,
      };
    });

    const present = rows.filter((r) => r.status === "PRESENT").length;
    const out = rows.filter((r) => r.status === "CHECKED_OUT").length;
    const away = rows.filter((r) => r.status === "AWAY").length;

    const selectedLabel = isToday
      ? "Today"
      : selected.toLocaleDateString([], {
          weekday: "long",
          month: "short",
          day: "numeric",
          year: "numeric",
          timeZone: "UTC",
        });

    // ── 30-day board data ────────────────────────────────────────────────────
    const windowDays = 30;
    const windowStart = addDays(today, -(windowDays - 1));

    // Build array of days (most-recent first for display; we reverse for columns)
    const dayList: { date: Date; dateStr: string }[] = [];
    for (let i = 0; i < windowDays; i++) {
      const d = addDays(windowStart, i);
      dayList.push({ date: d, dateStr: dayKeyToString(d) });
    }

    // Fetch all attendance rows in the window
    const allRows = await db.attendance.findMany({
      where: {
        day: { gte: windowStart, lte: today },
      },
      include: {
        user: { select: { id: true, name: true, title: true, department: true, avatarUrl: true } },
        breaks: { select: { breakInAt: true, breakOutAt: true } },
      },
    });

    // Group by user
    const byUserMap = new Map<
      string,
      {
        user: { id: string; name: string; title: string; department: string; avatarUrl: string | null };
        records: typeof allRows;
      }
    >();
    for (const row of allRows) {
      if (!byUserMap.has(row.userId)) {
        byUserMap.set(row.userId, { user: row.user, records: [] });
      }
      byUserMap.get(row.userId)!.records.push(row);
    }

    // Include users with zero attendance too
    for (const u of users) {
      if (!byUserMap.has(u.id)) {
        byUserMap.set(u.id, { user: u, records: [] });
      }
    }

    // Build per-person data
    const workDays = dayList.filter((d) => !isWeekend(d.date)).length;
    const people = Array.from(byUserMap.values()).map(({ user: u, records }) => {
      const recByDate = new Map(records.map((r) => [dayKeyToString(r.day), r]));

      const days = dayList
        .filter((d) => !isWeekend(d.date))
        .map((d) => {
          const rec = recByDate.get(d.dateStr);
          // Worked time, net of breaks: (checkOut − checkIn) − Σ break durations.
          const durationMinutes = rec
            ? netWorkedMinutes(rec.checkInAt, rec.checkOutAt, rec.breaks)
            : null;
          const breakMins = rec ? breakMinutes(rec.breaks) : 0;
          return {
            date: d.dateStr,
            status: (rec?.status ?? "AWAY") as "PRESENT" | "CHECKED_OUT" | "AWAY",
            checkInAt: rec?.checkInAt?.toISOString() ?? null,
            checkOutAt: rec?.checkOutAt?.toISOString() ?? null,
            durationMinutes,
            breakMinutes: breakMins,
          };
        });

      const presentDays = days.filter((d) => d.status !== "AWAY").length;

      // Avg check-in in minutes since midnight PKT
      const checkInTimes = days
        .filter((d) => d.checkInAt)
        .map((d) => {
          const dt = new Date(d.checkInAt!);
          const localStr = dt.toLocaleString("en-CA", { timeZone: ATTENDANCE_TZ, hour12: false });
          // en-CA gives "YYYY-MM-DD, HH:MM:SS"
          const timePart = localStr.split(", ")[1] || "";
          const [h, m] = timePart.split(":").map(Number);
          return h * 60 + (m || 0);
        });
      const avgCheckInMinutes =
        checkInTimes.length > 0
          ? Math.round(checkInTimes.reduce((a, b) => a + b, 0) / checkInTimes.length)
          : null;

      const punctualDays = checkInTimes.filter((m) => m <= PUNCTUAL_HOUR * 60).length;
      const fullDays = days.filter(
        (d) => d.durationMinutes !== null && d.durationMinutes >= FULL_DAY_MINUTES,
      ).length;

      return {
        id: u.id,
        name: u.name,
        title: u.title,
        department: u.department ?? "",
        avatarUrl: u.avatarUrl,
        days,
        presentDays,
        avgCheckInMinutes,
        punctualDays,
        fullDays,
      };
    });

    // Sort by name ascending
    people.sort((a, b) => a.name.localeCompare(b.name));

    // Board-level summary
    const presenceRates = people.map((p) =>
      workDays > 0 ? Math.round((p.presentDays / workDays) * 100) : 0,
    );
    const avgPresenceRate =
      presenceRates.length > 0
        ? Math.round(presenceRates.reduce((a, b) => a + b, 0) / presenceRates.length)
        : 0;

    const allCheckInMins = people
      .filter((p) => p.avgCheckInMinutes !== null)
      .map((p) => p.avgCheckInMinutes!);
    let avgCheckInStr: string | null = null;
    if (allCheckInMins.length > 0) {
      const avgMins = Math.round(
        allCheckInMins.reduce((a, b) => a + b, 0) / allCheckInMins.length,
      );
      const h = Math.floor(avgMins / 60);
      const m = avgMins % 60;
      const ampm = h >= 12 ? "PM" : "AM";
      const hour = h % 12 || 12;
      avgCheckInStr = `${hour}:${String(m).padStart(2, "0")} ${ampm}`;
    }

    const topPunctual = people.filter((p) => {
      const rate = workDays > 0 ? p.punctualDays / workDays : 0;
      return rate >= 0.8;
    }).length;

    // Day column descriptors
    const dayColumns = dayList.map((d) => ({
      date: d.dateStr,
      label: d.date.toLocaleDateString("en-GB", {
        weekday: "short",
        day: "numeric",
        timeZone: "UTC",
      }),
      isWeekend: isWeekend(d.date),
    }));

    const boardData = {
      days: dayColumns,
      people,
      summary: {
        totalPeople: people.length,
        avgPresenceRate,
        avgCheckIn: avgCheckInStr,
        topPunctual,
      },
    };

    return (
      <div className="mx-auto max-w-7xl">
        <PageHeader
          title="Attendance"
          subtitle={
            view === "board"
              ? "30-day heatmap — presence and check-in times across the team."
              : `${selectedLabel} — ${present} present, ${out} checked out, ${away} not in.`
          }
          icon={Clock}
        />

        {/* Tab switcher */}
        <div className="mb-6 flex items-center gap-1 rounded-xl border border-line bg-surface-2/60 p-1 w-fit">
          <TabPill href="/attendance" active={view === "roster"} icon={List} label="Daily Roster" />
          <TabPill href="/attendance?view=board" active={view === "board"} icon={LayoutGrid} label="Overview Board" />
        </div>

        {view === "roster" ? (
          <>
            <AttendanceDateNav
              selected={dayKeyToString(selected)}
              prev={dayKeyToString(addDays(selected, -1))}
              next={dayKeyToString(addDays(selected, 1))}
              today={dayKeyToString(today)}
              isToday={isToday}
            />
            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-ink-400">
                  <tr>
                    <th className="px-4 py-3">Person</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Check-in</th>
                    <th className="px-4 py-3">Check-out</th>
                    <th className="px-4 py-3">Break</th>
                    <th className="px-4 py-3">Net worked</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map((r) => (
                    <tr key={r.user.id} className="hover:bg-surface-2">
                      <td className="px-4 py-3">
                        <div className="font-medium text-ink">{r.user.name}</div>
                        <div className="text-xs text-ink-400">
                          {r.user.title} · {r.user.department}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <StatusPill status={r.status} />
                      </td>
                      <td className="px-4 py-3 text-ink-500">{fmtTime(r.checkInAt)}</td>
                      <td className="px-4 py-3 text-ink-500">{fmtTime(r.checkOutAt)}</td>
                      <td className="px-4 py-3 text-ink-500 tabular-nums">
                        {r.breakMins > 0 ? fmtMinutes(r.breakMins) : "—"}
                      </td>
                      <td className="px-4 py-3 text-ink-500 tabular-nums">
                        {fmtMinutes(r.netMins)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <AttendanceBoardWrapper data={boardData} />
        )}
      </div>
    );
  }

  // ── Employee view: their own last 14 days ──────────────────────────────────
  const mine = await db.attendance.findMany({
    where: { userId: user.id },
    orderBy: { day: "desc" },
    take: 14,
    include: {
      breaks: { select: { breakInAt: true, breakOutAt: true } },
    },
  });

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="My Attendance"
        subtitle="Your check-in and check-out history, recorded from Slack."
        icon={Clock}
      />
      {mine.length === 0 ? (
        <div className="rounded-xl border border-line p-8 text-center text-sm text-ink-400">
          No attendance yet. Post "check in" in Slack to start your day.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-ink-400">
              <tr>
                <th className="px-4 py-3">Day</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Check-in</th>
                <th className="px-4 py-3">Check-out</th>
                <th className="px-4 py-3">Break</th>
                <th className="px-4 py-3">Net worked</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {mine.map((a) => {
                const breakMins = breakMinutes(a.breaks);
                const net = netWorkedMinutes(a.checkInAt, a.checkOutAt, a.breaks);
                return (
                  <tr key={a.id} className="hover:bg-surface-2">
                    <td className="px-4 py-3 text-ink">
                      {a.day.toLocaleDateString([], {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                        timeZone: "UTC",
                      })}
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill status={a.status as "PRESENT" | "CHECKED_OUT"} />
                    </td>
                    <td className="px-4 py-3 text-ink-500">{fmtTime(a.checkInAt)}</td>
                    <td className="px-4 py-3 text-ink-500">{fmtTime(a.checkOutAt)}</td>
                    <td className="px-4 py-3 text-ink-500 tabular-nums">
                      {breakMins > 0 ? fmtMinutes(breakMins) : "—"}
                    </td>
                    <td className="px-4 py-3 text-ink-500 tabular-nums">{fmtMinutes(net)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function TabPill({
  href,
  active,
  icon: Icon,
  label,
}: {
  href: string;
  active: boolean;
  icon: typeof List;
  label: string;
}) {
  return (
    <a
      href={href}
      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${
        active
          ? "bg-surface shadow-sm text-ink border border-line"
          : "text-ink-400 hover:text-ink"
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </a>
  );
}
