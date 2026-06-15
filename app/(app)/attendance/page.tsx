import { Clock } from "lucide-react";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui/PageHeader";
import { can } from "@/lib/permissions";
import { dayKey, ATTENDANCE_TZ } from "@/lib/attendance";

export const metadata = { title: "Attendance — 2WayClick" };

// Attendance is sourced from Slack check-in/out events the local bot forwards to
// /api/attendance/slack. This page just reads the resulting rows:
//   • Manager tier → today's roster for the whole company (who's in / out / away).
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

function StatusPill({ status }: { status: "PRESENT" | "CHECKED_OUT" | "AWAY" }) {
  const map = {
    PRESENT: { label: "Present", cls: "bg-emerald-500/15 text-emerald-400" },
    CHECKED_OUT: { label: "Checked out", cls: "bg-neutral-500/15 text-neutral-300" },
    AWAY: { label: "Not in", cls: "bg-amber-500/15 text-amber-400" },
  } as const;
  const { label, cls } = map[status];
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}

export default async function AttendancePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const today = dayKey(new Date());
  const seeAll = can.viewAllAttendance(user.role);

  if (seeAll) {
    // Company roster for today: every user, left-joined to today's attendance.
    const [users, todays] = await Promise.all([
      db.user.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true, title: true, department: true, avatarUrl: true },
      }),
      db.attendance.findMany({ where: { day: today } }),
    ]);

    type RowStatus = "PRESENT" | "CHECKED_OUT" | "AWAY";
    const byUser = new Map(todays.map((a) => [a.userId, a]));
    const rows = users.map((u) => {
      const a = byUser.get(u.id);
      const status: RowStatus = !a ? "AWAY" : (a.status as "PRESENT" | "CHECKED_OUT");
      return { user: u, status, checkInAt: a?.checkInAt ?? null, checkOutAt: a?.checkOutAt ?? null };
    });

    const present = rows.filter((r) => r.status === "PRESENT").length;
    const out = rows.filter((r) => r.status === "CHECKED_OUT").length;
    const away = rows.filter((r) => r.status === "AWAY").length;

    return (
      <div className="mx-auto max-w-5xl">
        <PageHeader
          title="Attendance"
          subtitle={`Today — ${present} present, ${out} checked out, ${away} not in.`}
          icon={Clock}
        />
        <div className="overflow-hidden rounded-xl border border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-left text-xs uppercase tracking-wide text-neutral-400">
              <tr>
                <th className="px-4 py-3">Person</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Check-in</th>
                <th className="px-4 py-3">Check-out</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {rows.map((r) => (
                <tr key={r.user.id} className="hover:bg-white/5">
                  <td className="px-4 py-3">
                    <div className="font-medium text-neutral-100">{r.user.name}</div>
                    <div className="text-xs text-neutral-400">
                      {r.user.title} · {r.user.department}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill status={r.status} />
                  </td>
                  <td className="px-4 py-3 text-neutral-300">{fmtTime(r.checkInAt)}</td>
                  <td className="px-4 py-3 text-neutral-300">{fmtTime(r.checkOutAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // Employee view: their own last 14 days.
  const mine = await db.attendance.findMany({
    where: { userId: user.id },
    orderBy: { day: "desc" },
    take: 14,
  });

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="My Attendance"
        subtitle="Your check-in and check-out history, recorded from Slack."
        icon={Clock}
      />
      {mine.length === 0 ? (
        <div className="rounded-xl border border-white/10 p-8 text-center text-sm text-neutral-400">
          No attendance yet. Post “check in” in Slack to start your day.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-left text-xs uppercase tracking-wide text-neutral-400">
              <tr>
                <th className="px-4 py-3">Day</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Check-in</th>
                <th className="px-4 py-3">Check-out</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {mine.map((a) => (
                <tr key={a.id} className="hover:bg-white/5">
                  <td className="px-4 py-3 text-neutral-200">
                    {/* `day` is UTC midnight of the PKT calendar date, so
                        format it in UTC to read back the intended date. */}
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
                  <td className="px-4 py-3 text-neutral-300">{fmtTime(a.checkInAt)}</td>
                  <td className="px-4 py-3 text-neutral-300">{fmtTime(a.checkOutAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
