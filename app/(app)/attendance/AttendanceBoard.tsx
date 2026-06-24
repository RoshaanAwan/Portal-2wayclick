"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronRight,
  Clock,
  CalendarCheck,
  Users,
  Timer,
  CheckCircle2,
  TrendingUp,
  X,
} from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/utils";

const ATTENDANCE_TZ = "Asia/Karachi";

export interface AttendanceDay {
  date: string;
  label: string;
  isWeekend: boolean;
}

export interface PersonDay {
  date: string;
  status: "PRESENT" | "CHECKED_OUT" | "AWAY";
  checkInAt: string | null;
  checkOutAt: string | null;
  durationMinutes: number | null;
}

export interface AttendancePerson {
  id: string;
  name: string;
  title: string;
  department: string;
  avatarUrl: string | null;
  days: PersonDay[];
  presentDays: number;
  avgCheckInMinutes: number | null;
  punctualDays: number;
  fullDays: number;
}

export interface AttendanceBoardData {
  days: AttendanceDay[];
  people: AttendancePerson[];
  summary: {
    totalPeople: number;
    avgPresenceRate: number;
    avgCheckIn: string | null;
    topPunctual: number;
  };
}

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    timeZone: ATTENDANCE_TZ,
  });
}

function fmtDuration(minutes: number | null): string {
  if (minutes === null) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function fmtMinutes(mins: number | null): string {
  if (mins === null) return "—";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const ampm = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, "0")} ${ampm}`;
}

type CellStatus = "PRESENT" | "CHECKED_OUT" | "AWAY" | "WEEKEND";

function cellStyle(status: CellStatus): string {
  switch (status) {
    case "PRESENT":
      return "bg-success shadow-[0_0_0_1px_rgba(var(--c-success),0.3)]";
    case "CHECKED_OUT":
      return "bg-info/70";
    case "AWAY":
      return "bg-line";
    case "WEEKEND":
      return "bg-surface-2/50";
  }
}

function presenceColor(rate: number): string {
  if (rate >= 0.8) return "text-success";
  if (rate >= 0.5) return "text-warn";
  return "text-danger";
}

function presenceBarColor(rate: number): string {
  if (rate >= 0.8) return "bg-success";
  if (rate >= 0.5) return "bg-warn";
  return "bg-danger";
}

export function AttendanceBoard({ data }: { data: AttendanceBoardData }) {
  const [selected, setSelected] = useState<AttendancePerson | null>(null);
  const [dept, setDept] = useState<string>("all");
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);

  const departments = useMemo(() => {
    const set = new Set(data.people.map((p) => p.department).filter(Boolean));
    return ["all", ...Array.from(set).sort()];
  }, [data.people]);

  const filtered = useMemo(() => {
    if (dept === "all") return data.people;
    return data.people.filter((p) => p.department === dept);
  }, [data.people, dept]);

  const workDays = data.days.filter((d) => !d.isWeekend).length;

  // Only show non-weekend day columns
  const visibleDays = data.days.filter((d) => !d.isWeekend);

  if (data.people.length === 0) {
    return (
      <div className="rounded-2xl border border-line bg-surface p-16 text-center">
        <CalendarCheck className="mx-auto mb-3 h-8 w-8 text-ink-300" />
        <p className="text-sm text-ink-400">No attendance data for this period.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard
          icon={<Users className="h-4 w-4" />}
          tone="accent"
          value={String(data.summary.totalPeople)}
          label="People tracked"
        />
        <KpiCard
          icon={<TrendingUp className="h-4 w-4" />}
          tone="success"
          value={`${data.summary.avgPresenceRate}%`}
          label="Avg presence rate"
        />
        <KpiCard
          icon={<Clock className="h-4 w-4" />}
          tone="info"
          value={data.summary.avgCheckIn ?? "—"}
          label="Avg check-in time"
        />
        <KpiCard
          icon={<CalendarCheck className="h-4 w-4" />}
          tone="neutral"
          value={String(workDays)}
          label="Work days shown"
        />
      </div>

      {/* Controls row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Legend */}
        <div className="flex items-center gap-4 text-[11px] text-ink-400">
          <LegendItem color="bg-success" label="Present" />
          <LegendItem color="bg-info/70" label="Checked out" />
          <LegendItem color="bg-line" label="Absent" />
        </div>

        {/* Dept filter pills */}
        {departments.length > 2 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {departments.map((d) => (
              <button
                key={d}
                onClick={() => setDept(d)}
                className={cn(
                  "rounded-full border px-3 py-1 text-[11px] font-medium capitalize transition-all",
                  dept === d
                    ? "border-accent bg-accent text-white shadow-sm"
                    : "border-line bg-surface text-ink-400 hover:border-line-strong hover:text-ink",
                )}
              >
                {d === "all" ? "All depts" : d}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Main heatmap card */}
      <div className="rounded-2xl border border-line bg-surface overflow-hidden">
        {/* Month / week header strip */}
        <div className="border-b border-line bg-surface-2/60 px-5 py-3">
          <MonthLabels days={visibleDays} />
        </div>

        {/* Scrollable heatmap body */}
        <div className="overflow-x-auto">
          <div className="min-w-[700px]">
            {/* Day-of-week header */}
            <div className="flex items-center gap-0 border-b border-line/50 px-5 py-2">
              <div className="w-48 shrink-0" />
              <div className="flex flex-1 gap-px">
                {visibleDays.map((d) => (
                  <div
                    key={d.date}
                    onMouseEnter={() => setHoveredDate(d.date)}
                    onMouseLeave={() => setHoveredDate(null)}
                    className={cn(
                      "flex-1 text-center text-[9px] font-medium uppercase tracking-wide py-0.5 rounded transition-colors",
                      hoveredDate === d.date
                        ? "bg-accent/10 text-accent-ink"
                        : "text-ink-300",
                    )}
                  >
                    {d.label.split(" ")[0].slice(0, 1)}
                    <span className="text-[8px]">{d.label.split(" ")[1]}</span>
                  </div>
                ))}
              </div>
              <div className="w-16 shrink-0" />
            </div>

            {/* Person rows */}
            <ul className="divide-y divide-line/40">
              {filtered.map((person) => {
                const dayMap = new Map(person.days.map((d) => [d.date, d]));
                const rate = workDays > 0 ? person.presentDays / workDays : 0;
                const isSelected = selected?.id === person.id;

                return (
                  <li key={person.id}>
                    <button
                      onClick={() => setSelected(isSelected ? null : person)}
                      className={cn(
                        "group flex w-full items-center gap-0 px-5 py-2.5 text-left transition-colors",
                        isSelected ? "bg-accent/5" : "hover:bg-surface-2/50",
                      )}
                    >
                      {/* Person identity */}
                      <div className="flex w-48 shrink-0 items-center gap-2.5 pr-4">
                        <Avatar name={person.name} src={person.avatarUrl} size="sm" />
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-medium leading-tight text-ink">
                            {person.name}
                          </p>
                          <p className="truncate text-[10px] text-ink-400">
                            {person.department || person.title}
                          </p>
                        </div>
                      </div>

                      {/* Heatmap cells */}
                      <div className="flex flex-1 gap-px">
                        {visibleDays.map((d) => {
                          const pd = dayMap.get(d.date);
                          const status: CellStatus = pd?.status ?? "AWAY";
                          const isHovered = hoveredDate === d.date;
                          return (
                            <div
                              key={d.date}
                              title={`${d.label}: ${
                                status === "PRESENT"
                                  ? "Present"
                                  : status === "CHECKED_OUT"
                                    ? "Checked out"
                                    : "Absent"
                              }${pd?.checkInAt ? ` · in ${fmtTime(pd.checkInAt)}` : ""}${pd?.checkOutAt ? ` · out ${fmtTime(pd.checkOutAt)}` : ""}`}
                              className={cn(
                                "flex-1 h-6 rounded-[3px] transition-all",
                                cellStyle(status),
                                isHovered && "ring-1 ring-accent/40 scale-y-110",
                              )}
                            />
                          );
                        })}
                      </div>

                      {/* Presence summary */}
                      <div className="w-16 shrink-0 pl-3 text-right">
                        <span
                          className={cn(
                            "text-xs font-semibold tabular-nums",
                            presenceColor(rate),
                          )}
                        >
                          {Math.round(rate * 100)}%
                        </span>
                        <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-line">
                          <div
                            className={cn("h-full rounded-full transition-all", presenceBarColor(rate))}
                            style={{ width: `${Math.round(rate * 100)}%` }}
                          />
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>

      {/* Detail drawer — slides in when a person is selected */}
      <AnimatePresence>
        {selected && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="rounded-2xl border border-line bg-surface overflow-hidden"
          >
            {/* Drawer header */}
            <div className="flex items-center gap-3 border-b border-line px-5 py-4">
              <Avatar name={selected.name} src={selected.avatarUrl} size="md" />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-ink">{selected.name}</p>
                <p className="text-xs text-ink-400">
                  {selected.title}
                  {selected.department ? ` · ${selected.department}` : ""}
                </p>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="grid h-7 w-7 place-items-center rounded-lg text-ink-400 transition-colors hover:bg-surface-2 hover:text-ink"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-2 gap-px border-b border-line sm:grid-cols-4 bg-line">
              <DrawerStat
                icon={<CalendarCheck className="h-3.5 w-3.5" />}
                value={`${selected.presentDays} / ${workDays}`}
                label="Days present"
                tone="success"
              />
              <DrawerStat
                icon={<Clock className="h-3.5 w-3.5" />}
                value={fmtMinutes(selected.avgCheckInMinutes)}
                label="Avg check-in"
                tone="info"
              />
              <DrawerStat
                icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                value={String(selected.punctualDays)}
                label="Punctual (≤10 AM)"
                tone="accent"
              />
              <DrawerStat
                icon={<Timer className="h-3.5 w-3.5" />}
                value={String(selected.fullDays)}
                label="Full days (6h+)"
                tone="neutral"
              />
            </div>

            {/* Day-by-day log */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[440px]">
                <thead>
                  <tr className="bg-surface-2/60 text-[11px] uppercase tracking-wide text-ink-400">
                    <th className="px-5 py-2.5 text-left font-medium">Date</th>
                    <th className="px-4 py-2.5 text-left font-medium">Status</th>
                    <th className="px-4 py-2.5 text-left font-medium">Check-in</th>
                    <th className="px-4 py-2.5 text-left font-medium">Check-out</th>
                    <th className="px-5 py-2.5 text-right font-medium">Duration</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/50">
                  {selected.days
                    .filter((d) => d.status !== "AWAY")
                    .reverse()
                    .map((pd) => (
                      <tr key={pd.date} className="group hover:bg-surface-2/40">
                        <td className="px-5 py-2.5 text-[13px] text-ink-500">
                          {new Date(pd.date + "T00:00:00Z").toLocaleDateString([], {
                            weekday: "short",
                            month: "short",
                            day: "numeric",
                            timeZone: "UTC",
                          })}
                        </td>
                        <td className="px-4 py-2.5">
                          <span
                            className={cn(
                              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium",
                              pd.status === "PRESENT"
                                ? "bg-success-soft text-success"
                                : "bg-info-soft text-info",
                            )}
                          >
                            <span
                              className={cn(
                                "h-1.5 w-1.5 rounded-full",
                                pd.status === "PRESENT" ? "bg-success" : "bg-info",
                              )}
                            />
                            {pd.status === "PRESENT" ? "Present" : "Checked out"}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 tabular-nums text-[13px] text-ink">
                          {fmtTime(pd.checkInAt)}
                        </td>
                        <td className="px-4 py-2.5 tabular-nums text-[13px] text-ink-500">
                          {fmtTime(pd.checkOutAt)}
                        </td>
                        <td className="px-5 py-2.5 text-right">
                          <span
                            className={cn(
                              "tabular-nums text-[13px] font-medium",
                              pd.durationMinutes !== null && pd.durationMinutes >= 360
                                ? "text-success"
                                : pd.durationMinutes !== null
                                  ? "text-ink"
                                  : "text-ink-300",
                            )}
                          >
                            {fmtDuration(pd.durationMinutes)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  {selected.days.filter((d) => d.status !== "AWAY").length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-5 py-8 text-center text-sm text-ink-400">
                        No check-ins recorded in this period.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <p className="text-[11px] text-ink-400 px-1">
        Last 30 work days. Click any row to inspect day-by-day times.
        Punctual = in by 10 AM · Full day = 6+ hours.
      </p>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function MonthLabels({ days }: { days: AttendanceDay[] }) {
  // Group consecutive days by month label
  const groups: { month: string; count: number }[] = [];
  for (const d of days) {
    const month = new Date(d.date + "T00:00:00Z").toLocaleDateString("en-US", {
      month: "short",
      timeZone: "UTC",
    });
    if (groups.length === 0 || groups[groups.length - 1].month !== month) {
      groups.push({ month, count: 1 });
    } else {
      groups[groups.length - 1].count++;
    }
  }

  return (
    <div className="flex items-center gap-0">
      <div className="w-48 shrink-0" />
      <div className="flex flex-1 gap-0">
        {groups.map((g, i) => (
          <div
            key={i}
            className="text-[10px] font-semibold uppercase tracking-widest text-ink-400"
            style={{ flex: g.count }}
          >
            {g.month}
          </div>
        ))}
      </div>
      <div className="w-16 shrink-0" />
    </div>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn("h-3 w-3 rounded-[3px]", color)} />
      {label}
    </span>
  );
}

const TONE_STYLES: Record<string, { icon: string; bg: string; value: string }> = {
  accent: { icon: "text-accent", bg: "bg-accent-soft", value: "text-accent-ink" },
  success: { icon: "text-success", bg: "bg-success-soft", value: "text-success" },
  info: { icon: "text-info", bg: "bg-info-soft", value: "text-info" },
  neutral: { icon: "text-ink-400", bg: "bg-surface-2", value: "text-ink" },
};

function KpiCard({
  icon,
  tone,
  value,
  label,
}: {
  icon: React.ReactNode;
  tone: string;
  value: string;
  label: string;
}) {
  const t = TONE_STYLES[tone];
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <span className={cn("inline-grid h-8 w-8 place-items-center rounded-xl", t.bg)}>
        <span className={t.icon}>{icon}</span>
      </span>
      <p className={cn("mt-3 text-2xl font-bold tabular-nums leading-none", t.value)}>{value}</p>
      <p className="mt-1 text-[11px] text-ink-400">{label}</p>
    </div>
  );
}

function DrawerStat({
  icon,
  value,
  label,
  tone,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
  tone: string;
}) {
  const t = TONE_STYLES[tone];
  return (
    <div className="flex items-center gap-3 bg-surface px-5 py-3.5">
      <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-xl", t.bg)}>
        <span className={t.icon}>{icon}</span>
      </span>
      <div>
        <p className={cn("text-base font-bold tabular-nums leading-tight", t.value)}>{value}</p>
        <p className="text-[10px] text-ink-400">{label}</p>
      </div>
    </div>
  );
}
