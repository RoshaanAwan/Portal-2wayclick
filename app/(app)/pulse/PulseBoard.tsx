"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  PalmtreeIcon,
  Flame,
  CircleDot,
  CheckCircle2,
  AlertTriangle,
  Clock,
} from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { CountUp } from "@/components/ui/CountUp";
import { Avatar } from "@/components/ui/Avatar";
import { cn, timeAgo } from "@/lib/utils";
import type { TeamPulse, PulsePerson, PulseStatus } from "@/lib/teamPulse";

// Visual vocabulary per status — color, label, icon. The grid reads at a glance.
const STATUS: Record<
  PulseStatus,
  { label: string; dot: string; tile: string; text: string; icon: typeof Flame }
> = {
  out: {
    label: "Out",
    dot: "bg-info",
    tile: "bg-info-soft border-info/20",
    text: "text-info",
    icon: PalmtreeIcon,
  },
  overloaded: {
    label: "Overloaded",
    dot: "bg-danger",
    tile: "bg-danger-soft border-danger/20",
    text: "text-danger",
    icon: Flame,
  },
  busy: {
    label: "Busy",
    dot: "bg-warn",
    tile: "bg-warn-soft border-warn/20",
    text: "text-warn",
    icon: CircleDot,
  },
  available: {
    label: "Available",
    dot: "bg-success",
    tile: "bg-success-soft border-success/20",
    text: "text-success",
    icon: CheckCircle2,
  },
};

const STATUS_ORDER: PulseStatus[] = ["overloaded", "out", "busy", "available"];

export function PulseBoard({ pulse }: { pulse: TeamPulse }) {
  const [filter, setFilter] = useState<PulseStatus | "all">("all");

  const visibleDepts = useMemo(() => {
    if (filter === "all") return pulse.byDepartment;
    return pulse.byDepartment
      .map((d) => ({
        ...d,
        people: d.people.filter((p) => p.status === filter),
      }))
      .filter((d) => d.people.length > 0);
  }, [pulse.byDepartment, filter]);

  if (pulse.people.length === 0) {
    return (
      <GlassCard hover={false} className="text-center">
        <p className="text-sm text-ink-500">
          No team members to show yet. Once people report to you (or join the
          company), their capacity appears here.
        </p>
      </GlassCard>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary tiles */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <SummaryTile
          label="People"
          value={pulse.summary.total}
          icon={CircleDot}
          tone="text-accent"
          soft="bg-accent-soft"
        />
        <SummaryTile
          label="Out today"
          value={pulse.summary.out}
          icon={PalmtreeIcon}
          tone="text-info"
          soft="bg-info-soft"
        />
        <SummaryTile
          label="Overloaded"
          value={pulse.summary.overloaded}
          icon={Flame}
          tone="text-danger"
          soft="bg-danger-soft"
        />
        <SummaryTile
          label="Avg load"
          value={pulse.summary.avgLoad}
          suffix="%"
          icon={CheckCircle2}
          tone="text-success"
          soft="bg-success-soft"
        />
      </div>

      {/* Legend + filter */}
      <div className="flex flex-wrap items-center gap-2">
        <FilterChip
          active={filter === "all"}
          onClick={() => setFilter("all")}
          dot="bg-ink-400"
          label="All"
          count={pulse.summary.total}
        />
        {STATUS_ORDER.map((s) => {
          const count = pulse.people.filter((p) => p.status === s).length;
          return (
            <FilterChip
              key={s}
              active={filter === s}
              onClick={() => setFilter(filter === s ? "all" : s)}
              dot={STATUS[s].dot}
              label={STATUS[s].label}
              count={count}
            />
          );
        })}
      </div>

      {/* Heatmap grouped by department */}
      <div className="space-y-5">
        {visibleDepts.map((dept) => (
          <div key={dept.department}>
            <div className="mb-2.5 flex items-center gap-2">
              <h3 className="text-sm font-semibold text-ink">{dept.department}</h3>
              <span className="text-xs text-ink-400">{dept.people.length}</span>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {dept.people
                .slice()
                .sort(
                  (a, b) =>
                    STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) ||
                    b.load - a.load,
                )
                .map((p, i) => (
                  <PersonCard key={p.id} person={p} index={i} />
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SummaryTile({
  label,
  value,
  suffix,
  icon: Icon,
  tone,
  soft,
}: {
  label: string;
  value: number;
  suffix?: string;
  icon: typeof Flame;
  tone: string;
  soft: string;
}) {
  return (
    <GlassCard hover={false} className="flex items-center gap-3">
      <div className={cn("grid h-11 w-11 place-items-center rounded-xl", soft)}>
        <Icon className={cn("h-5 w-5", tone)} />
      </div>
      <div>
        <p className="font-display text-2xl font-semibold tracking-tight text-ink">
          <CountUp value={value} />
          {suffix}
        </p>
        <p className="text-xs text-ink-400">{label}</p>
      </div>
    </GlassCard>
  );
}

function FilterChip({
  active,
  onClick,
  dot,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  dot: string;
  label: string;
  count: number;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition",
        active
          ? "border-line-strong bg-surface-2 text-ink"
          : "border-line bg-surface text-ink-500 hover:text-ink hover:border-line-strong",
      )}
    >
      <span className={cn("h-2 w-2 rounded-full", dot)} />
      {label}
      <span className="rounded-full bg-line px-1.5 text-[10px] text-ink-500">
        {count}
      </span>
    </button>
  );
}

function PersonCard({ person, index }: { person: PulsePerson; index: number }) {
  const s = STATUS[person.status];
  const Icon = s.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.03, 0.25) }}
      className={cn("rounded-2xl border p-4", s.tile)}
    >
      <div className="flex items-start gap-3">
        <Avatar name={person.name} src={person.avatarUrl} size="md" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink" title={person.name}>
            {person.name}
          </p>
          <p className="truncate text-[11px] text-ink-400">{person.title}</p>
        </div>
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full bg-surface/70 px-2 py-0.5 text-[10px] font-semibold",
            s.text,
          )}
        >
          <Icon className="h-3 w-3" />
          {s.label}
        </span>
      </div>

      {person.status === "out" ? (
        <p className="mt-3 text-xs text-ink-500">
          On {person.leaveType ?? "leave"}
          {person.outUntil && (
            <>
              {" "}
              · back {timeAgo(person.outUntil).replace(" ago", "")}
            </>
          )}
        </p>
      ) : (
        <>
          {/* Load bar */}
          <div className="mt-3">
            <div className="mb-1 flex items-center justify-between text-[10px] text-ink-400">
              <span>Load</span>
              <span className="font-semibold text-ink-600">{person.load}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-surface">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${person.load}%` }}
                transition={{ duration: 0.6, ease: "easeOut" }}
                className={cn("h-full rounded-full", s.dot)}
              />
            </div>
          </div>

          {/* Task breakdown */}
          <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-ink-500">
            <span className="inline-flex items-center gap-1">
              <CircleDot className="h-3 w-3 text-ink-400" />
              {person.openTasks} open
            </span>
            {person.overdueTasks > 0 && (
              <span className="inline-flex items-center gap-1 text-danger">
                <Clock className="h-3 w-3" />
                {person.overdueTasks} overdue
              </span>
            )}
            {person.highPriority > 0 && (
              <span className="inline-flex items-center gap-1 text-warn">
                <AlertTriangle className="h-3 w-3" />
                {person.highPriority} high
              </span>
            )}
          </div>
        </>
      )}
    </motion.div>
  );
}
