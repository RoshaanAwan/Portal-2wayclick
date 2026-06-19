"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ListChecks,
  CalendarCheck,
  Trophy,
  ChevronDown,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Timer,
} from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { CountUp } from "@/components/ui/CountUp";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/utils";
import type { PerformanceReport, PerformancePerson } from "@/lib/performance";

type SortKey = "task" | "attendance" | "name";

// Score → color band. Green strong, amber middling, red weak — same vocabulary
// as the rest of the app's status tints.
function band(score: number) {
  if (score >= 75) return { bar: "bg-success", text: "text-success", soft: "bg-success-soft" };
  if (score >= 50) return { bar: "bg-warn", text: "text-warn", soft: "bg-warn-soft" };
  return { bar: "bg-danger", text: "text-danger", soft: "bg-danger-soft" };
}

export function PerformanceBoard({ report }: { report: PerformanceReport }) {
  const [sort, setSort] = useState<SortKey>("task");
  const [openId, setOpenId] = useState<string | null>(null);

  const people = useMemo(() => {
    const list = [...report.people];
    list.sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "attendance") return b.attendanceScore - a.attendanceScore;
      return b.taskScore - a.taskScore;
    });
    return list;
  }, [report.people, sort]);

  if (report.people.length === 0) {
    return (
      <GlassCard hover={false}>
        <p className="py-10 text-center text-sm text-ink-400">
          No people to report on yet.
        </p>
      </GlassCard>
    );
  }

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryTile
          Icon={ListChecks}
          tone="accent"
          value={report.summary.avgTaskScore}
          label="Avg task score"
          suffix
        />
        <SummaryTile
          Icon={CalendarCheck}
          tone="info"
          value={report.summary.avgAttendanceScore}
          label="Avg attendance"
          suffix
        />
        <SummaryTile
          Icon={Trophy}
          tone="success"
          value={report.summary.topPerformers}
          label="Top performers"
        />
        <SummaryTile
          Icon={Clock}
          tone="neutral"
          value={report.summary.total}
          label="People"
        />
      </div>

      {/* Sort controls */}
      <div className="flex items-center gap-2 text-xs">
        <span className="text-ink-400">Sort by</span>
        {(
          [
            ["task", "Task score"],
            ["attendance", "Attendance"],
            ["name", "Name"],
          ] as [SortKey, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setSort(key)}
            className={cn(
              "rounded-lg border px-2.5 py-1 font-medium transition",
              sort === key
                ? "border-accent bg-accent-soft text-accent-ink"
                : "border-line text-ink-500 hover:border-line-strong hover:text-ink",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* People list */}
      <GlassCard hover={false} className="p-0">
        <ul className="divide-y divide-line">
          {people.map((p) => (
            <PersonRow
              key={p.id}
              person={p}
              open={openId === p.id}
              onToggle={() => setOpenId((id) => (id === p.id ? null : p.id))}
            />
          ))}
        </ul>
      </GlassCard>

      <p className="px-1 text-[11px] leading-relaxed text-ink-400">
        Scores cover the last {report.windowDays} days. Task score reflects
        completed work and on-time delivery; attendance reflects days present and
        punctuality. Completion is inferred from cards in “done” columns.
      </p>
    </div>
  );
}

function PersonRow({
  person: p,
  open,
  onToggle,
}: {
  person: PerformancePerson;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <li>
      <button
        onClick={onToggle}
        aria-expanded={open}
        className="hover-surface flex w-full items-center gap-3 px-4 py-3 text-left sm:px-5"
      >
        <Avatar name={p.name} src={p.avatarUrl} size="md" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink">{p.name}</p>
          <p className="truncate text-xs text-ink-400">
            {p.title} · {p.department}
          </p>
        </div>

        {/* Two score bars, stacked tight; numbers are tabular for alignment. */}
        <div className="hidden w-64 shrink-0 flex-col gap-1.5 sm:flex">
          <ScoreBar label="Tasks" score={p.taskScore} />
          <ScoreBar label="Attend." score={p.attendanceScore} />
        </div>

        {/* Compact score chips on mobile. */}
        <div className="flex shrink-0 items-center gap-1.5 sm:hidden">
          <ScoreChip label="T" score={p.taskScore} />
          <ScoreChip label="A" score={p.attendanceScore} />
        </div>

        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-ink-300 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="grid grid-cols-2 gap-3 px-4 pb-4 sm:grid-cols-4 sm:px-5">
              <Stat
                Icon={CheckCircle2}
                tone="success"
                value={p.completedTasks}
                label="Completed"
              />
              <Stat
                Icon={Timer}
                tone="info"
                value={p.onTimeRate === null ? "—" : `${p.onTimeRate}%`}
                label="On time"
              />
              <Stat
                Icon={AlertTriangle}
                tone="danger"
                value={p.overdueOpenTasks}
                label="Overdue open"
              />
              <Stat
                Icon={ListChecks}
                tone="accent"
                value={p.openTasks}
                label="Open tasks"
              />
              <Stat
                Icon={CalendarCheck}
                tone="info"
                value={`${p.daysPresent}/${p.expectedDays}`}
                label="Days present"
              />
              <Stat
                Icon={CalendarCheck}
                tone="accent"
                value={`${p.presenceRate}%`}
                label="Presence rate"
              />
              <Stat
                Icon={Clock}
                tone="success"
                value={p.punctualDays}
                label="Punctual days"
              />
              <Stat
                Icon={Timer}
                tone="neutral"
                value={p.fullDays}
                label="Full days"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}

function ScoreBar({ label, score }: { label: string; score: number }) {
  const b = band(score);
  return (
    <div className="flex items-center gap-2">
      <span className="w-12 shrink-0 text-[10px] font-medium uppercase tracking-wide text-ink-400">
        {label}
      </span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
        <div
          className={cn("h-full rounded-full", b.bar)}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className={cn("w-7 shrink-0 text-right text-xs font-semibold tabular-nums", b.text)}>
        {score}
      </span>
    </div>
  );
}

function ScoreChip({ label, score }: { label: string; score: number }) {
  const b = band(score);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums",
        b.soft,
        b.text,
      )}
    >
      {label}
      {score}
    </span>
  );
}

const TONES: Record<string, { chip: string; icon: string }> = {
  accent: { chip: "bg-accent-soft", icon: "text-accent" },
  info: { chip: "bg-info-soft", icon: "text-info" },
  success: { chip: "bg-success-soft", icon: "text-success" },
  danger: { chip: "bg-danger-soft", icon: "text-danger" },
  neutral: { chip: "bg-surface-2", icon: "text-ink-400" },
};

function SummaryTile({
  Icon,
  tone,
  value,
  label,
  suffix,
}: {
  Icon: typeof ListChecks;
  tone: keyof typeof TONES;
  value: number;
  label: string;
  suffix?: boolean;
}) {
  const t = TONES[tone];
  return (
    <GlassCard hover={false} className="p-3.5">
      <span className={cn("grid h-8 w-8 place-items-center rounded-lg", t.chip)}>
        <Icon className={cn("h-4 w-4", t.icon)} />
      </span>
      <p className="mt-2.5 font-display text-2xl font-semibold leading-none text-ink">
        <CountUp value={value} />
        {suffix && <span className="text-base text-ink-400">/100</span>}
      </p>
      <p className="mt-1 text-[11px] font-medium text-ink-500">{label}</p>
    </GlassCard>
  );
}

function Stat({
  Icon,
  tone,
  value,
  label,
}: {
  Icon: typeof ListChecks;
  tone: keyof typeof TONES;
  value: number | string;
  label: string;
}) {
  const t = TONES[tone];
  return (
    <div className="rounded-xl border border-line bg-surface-2 px-3 py-2.5">
      <span className={cn("inline-grid h-6 w-6 place-items-center rounded-md", t.chip)}>
        <Icon className={cn("h-3.5 w-3.5", t.icon)} />
      </span>
      <p className="mt-1.5 text-sm font-semibold tabular-nums text-ink">{value}</p>
      <p className="text-[11px] text-ink-400">{label}</p>
    </div>
  );
}
