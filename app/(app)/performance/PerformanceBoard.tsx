"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  type ChartOptions,
  type ScriptableContext,
} from "chart.js";
import { Line } from "react-chartjs-2";
import {
  CheckCircle2,
  AlertTriangle,
  Zap,
  ChevronDown,
  CalendarDays,
  ListTodo,
  Activity,
} from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { CountUp } from "@/components/ui/CountUp";
import { Avatar } from "@/components/ui/Avatar";
import { useTheme, useAccentColor } from "@/components/ThemeProvider";
import { cn } from "@/lib/utils";
import type { PerformanceReport, PerformancePerson } from "@/lib/performance";
import { CATEGORY_LABELS } from "@/lib/auditScore";
import { PerformanceFilters } from "./PerformanceFilters";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
);

type SortKey = "score" | "delivered" | "open" | "name";

const AXIS = {
  dark: { tick: "#74747f", grid: "rgba(255,255,255,0.05)" },
  light: { tick: "#84848e", grid: "rgba(0,0,0,0.05)" },
} as const;

function onTimeTint(rate: number | null) {
  if (rate === null) return "text-ink-400";
  if (rate >= 80) return "text-success";
  if (rate >= 50) return "text-warn";
  return "text-danger";
}

export function PerformanceBoard({ report }: { report: PerformanceReport }) {
  const [sort, setSort] = useState<SortKey>("score");
  // Which person's detail row is expanded (click a row to toggle).
  const [openId, setOpenId] = useState<string | null>(null);

  const people = useMemo(() => {
    const list = [...report.people];
    list.sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "open") return b.openTasks - a.openTasks;
      if (sort === "delivered") return b.delivered - a.delivered;
      return b.workScore - a.workScore;
    });
    return list;
  }, [report.people, sort]);

  return (
    <div className="space-y-5">
      <PerformanceFilters
        filters={report.filters}
        years={report.availableYears}
        users={report.userOptions}
      />

      <TrendChart report={report} />

      {/* Headline stats — work score first. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MiniStat value={report.summary.totalScore} label="Work score" />
        <MiniStat value={report.summary.totalDelivered} label="Delivered" />
        <MiniStat value={report.summary.openTasks} label="Open" />
        <MiniStat
          value={report.summary.overdueTasks}
          label="Overdue"
          tone={report.summary.overdueTasks > 0 ? "danger" : undefined}
        />
      </div>

      {report.people.length === 0 ? (
        <GlassCard hover={false}>
          <p className="py-10 text-center text-sm text-ink-400">
            No one to report on in this period.
          </p>
        </GlassCard>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-ink-400">Sort by</span>
            {(
              [
                ["score", "Work score"],
                ["delivered", "Delivered"],
                ["open", "Open load"],
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

          <GlassCard hover={false} className="p-0">
            <ul className="divide-y divide-line">
              {people.map((p, i) => (
                <PersonRow
                  key={p.id}
                  person={p}
                  rank={i + 1}
                  open={openId === p.id}
                  onToggle={() =>
                    setOpenId((cur) => (cur === p.id ? null : p.id))
                  }
                />
              ))}
            </ul>
          </GlassCard>
        </>
      )}

      <p className="px-1 text-[11px] leading-relaxed text-ink-400">
        {report.periodLabel}.{" "}
        <b className="font-semibold text-ink-500">Work score</b> weighs every
        audited action by significance across all departments — so HR (approvals,
        comms), QA (review &amp; card work), and delivery all count. Delivered and
        open/overdue are board-specific context.
      </p>
    </div>
  );
}

// ── Headline trend chart (work score per bucket) ──────────────────────────────

function TrendChart({ report }: { report: PerformanceReport }) {
  const { theme } = useTheme();
  const c = AXIS[theme];
  const accentColor = useAccentColor();
  const accentSoft = useAccentColor("--c-accent", 0.15);

  const peak = report.daily.reduce((m, d) => Math.max(m, d.score), 0);

  const data = useMemo(
    () => ({
      labels: report.daily.map((d) => d.label),
      datasets: [
        {
          data: report.daily.map((d) => d.score),
          borderColor: accentColor,
          borderWidth: 2.5,
          tension: 0.35,
          pointRadius: 0,
          pointHoverRadius: 4,
          pointHoverBackgroundColor: accentColor,
          fill: true,
          backgroundColor: (ctx: ScriptableContext<"line">) => {
            const { ctx: g, chartArea } = ctx.chart;
            if (!chartArea) return accentSoft;
            const grad = g.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
            grad.addColorStop(0, accentSoft);
            grad.addColorStop(1, "transparent");
            return grad;
          },
        },
      ],
    }),
    [report.daily, accentColor, accentSoft],
  );

  const options = useMemo<ChartOptions<"line">>(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          displayColors: false,
          backgroundColor: theme === "dark" ? "#1a1a1f" : "#ffffff",
          titleColor: theme === "dark" ? "#f4f4f5" : "#18181b",
          bodyColor: theme === "dark" ? "#a1a1aa" : "#52525b",
          borderColor: c.grid,
          borderWidth: 1,
          padding: 10,
          cornerRadius: 10,
          callbacks: { label: (item) => `${item.parsed.y} work score` },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          border: { display: false },
          ticks: {
            color: c.tick,
            font: { size: 10 },
            maxRotation: 0,
            autoSkipPadding: 16,
          },
        },
        y: {
          beginAtZero: true,
          grid: { color: c.grid },
          border: { display: false },
          ticks: { color: c.tick, font: { size: 10 }, precision: 0, maxTicksLimit: 5 },
        },
      },
    }),
    [theme, c.tick, c.grid],
  );

  return (
    <GlassCard hover={false}>
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h2 className="font-display text-[15px] font-semibold tracking-tight text-ink">
            Work trend
          </h2>
          <p className="text-[11px] text-ink-400">
            {report.summary.totalActions} actions · {report.periodLabel}
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-ink-500">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          Peak {peak}
        </span>
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="h-44 w-full"
      >
        <Line data={data} options={options} />
      </motion.div>
    </GlassCard>
  );
}

// ── Ranked person row — work-score-led ────────────────────────────────────────

function PersonRow({
  person: p,
  rank,
  open,
  onToggle,
}: {
  person: PerformancePerson;
  rank: number;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <li className={cn(open && "bg-surface-2/40")}>
      {/* The whole row is a toggle that reveals the detail panel below. */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2/60 sm:px-5"
      >
        <span className="w-5 shrink-0 text-center text-xs font-semibold tabular-nums text-ink-300">
          {rank}
        </span>
        <Avatar name={p.name} src={p.avatarUrl} size="sm" />

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink">{p.name}</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-ink-400">
            <span>{p.actionCount} actions</span>
            {p.topCategory && (
              <>
                <span className="text-ink-300">·</span>
                <span>mostly {CATEGORY_LABELS[p.topCategory].toLowerCase()}</span>
              </>
            )}
            {p.overdueTasks > 0 && (
              <span className="inline-flex items-center gap-1 text-danger">
                <AlertTriangle className="h-3 w-3" />
                {p.overdueTasks} overdue
              </span>
            )}
          </div>
        </div>

        {/* Delivered + on-time (board context) */}
        <div className="hidden w-20 shrink-0 text-right sm:block">
          <p className="flex items-center justify-end gap-1 text-xs font-medium tabular-nums text-ink-600">
            <CheckCircle2 className="h-3.5 w-3.5 text-success" />
            {p.delivered}
          </p>
          <p className={cn("text-[10px]", onTimeTint(p.onTimeRate))}>
            {p.onTimeRate === null ? "no due dates" : `${p.onTimeRate}% on time`}
          </p>
        </div>

        {/* Work-score sparkline */}
        <Sparkline values={p.spark} className="hidden h-7 w-20 text-accent sm:block" />

        {/* Work score — the headline number */}
        <div className="flex w-16 shrink-0 items-center justify-end gap-1.5">
          <Zap className="h-4 w-4 text-accent" />
          <span className="text-lg font-semibold tabular-nums text-ink">
            {p.workScore}
          </span>
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
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <PersonDetail person={p} />
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}

// ── Expanded person detail ────────────────────────────────────────────────────
// A glance card under a clicked row: who they are, the headline stats, and a
// breakdown of their work score by category. All from the report payload — no
// extra fetch.
function PersonDetail({ person: p }: { person: PerformancePerson }) {
  // Categories this person scored in, biggest first, for the breakdown bars.
  const cats = (
    Object.entries(p.byCategory) as [keyof typeof CATEGORY_LABELS, number][]
  )
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);
  const maxCat = cats.length ? cats[0][1] : 0;

  return (
    <div className="border-t border-line bg-surface px-4 py-4 sm:px-5">
      <div className="mb-4 flex items-center gap-3">
        <Avatar name={p.name} src={p.avatarUrl} size="md" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">{p.name}</p>
          <p className="truncate text-xs text-ink-400">
            {p.title}
            {p.department ? ` · ${p.department}` : ""}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <DetailStat
          icon={<Zap className="h-3.5 w-3.5" />}
          tone="accent"
          value={String(p.workScore)}
          label="Work score"
        />
        <DetailStat
          icon={<Activity className="h-3.5 w-3.5" />}
          tone="info"
          value={String(p.actionCount)}
          label="Actions"
        />
        <DetailStat
          icon={<CheckCircle2 className="h-3.5 w-3.5" />}
          tone="success"
          value={String(p.delivered)}
          label="Delivered"
        />
        <DetailStat
          icon={<CalendarDays className="h-3.5 w-3.5" />}
          tone="neutral"
          value={String(p.activeDays)}
          label="Active days"
        />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <DetailStat
          icon={<ListTodo className="h-3.5 w-3.5" />}
          tone="neutral"
          value={String(p.openTasks)}
          label="Open tasks"
        />
        <DetailStat
          icon={<AlertTriangle className="h-3.5 w-3.5" />}
          tone={p.overdueTasks > 0 ? "danger" : "neutral"}
          value={String(p.overdueTasks)}
          label="Overdue"
        />
        <DetailStat
          icon={<CheckCircle2 className="h-3.5 w-3.5" />}
          tone="success"
          value={p.onTimeRate === null ? "—" : `${p.onTimeRate}%`}
          label="On time"
        />
        <DetailStat
          icon={<Zap className="h-3.5 w-3.5" />}
          tone="neutral"
          value={
            p.topCategory ? CATEGORY_LABELS[p.topCategory] : "—"
          }
          label="Focus"
        />
      </div>

      {/* Work-score breakdown by category */}
      {cats.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
            Score by category
          </p>
          <div className="space-y-2">
            {cats.map(([cat, val]) => (
              <div key={cat} className="flex items-center gap-2.5">
                <span className="w-24 shrink-0 truncate text-[11px] text-ink-500">
                  {CATEGORY_LABELS[cat]}
                </span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
                  <div
                    className="h-full rounded-full bg-accent"
                    style={{ width: `${maxCat ? Math.round((val / maxCat) * 100) : 0}%` }}
                  />
                </div>
                <span className="w-8 shrink-0 text-right text-[11px] font-medium tabular-nums text-ink-600">
                  {val}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const DETAIL_TONE: Record<string, { icon: string; bg: string; value: string }> = {
  accent: { icon: "text-accent", bg: "bg-accent-soft", value: "text-accent-ink" },
  success: { icon: "text-success", bg: "bg-success-soft", value: "text-success" },
  info: { icon: "text-info", bg: "bg-info-soft", value: "text-info" },
  danger: { icon: "text-danger", bg: "bg-danger-soft", value: "text-danger-ink" },
  neutral: { icon: "text-ink-400", bg: "bg-surface-2", value: "text-ink" },
};

function DetailStat({
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
  const t = DETAIL_TONE[tone] ?? DETAIL_TONE.neutral;
  return (
    <div className="rounded-xl border border-line bg-surface-2/50 p-2.5">
      <span className={cn("inline-grid h-7 w-7 place-items-center rounded-lg", t.bg)}>
        <span className={t.icon}>{icon}</span>
      </span>
      <p className={cn("mt-1.5 truncate text-base font-semibold tabular-nums leading-none", t.value)}>
        {value}
      </p>
      <p className="mt-1 text-[10px] text-ink-400">{label}</p>
    </div>
  );
}

function Sparkline({ values, className }: { values: number[]; className?: string }) {
  if (values.length < 2 || values.every((v) => v === 0)) {
    return (
      <div className={cn("flex items-center", className)} aria-hidden>
        <span className="h-px w-full bg-line-strong" />
      </div>
    );
  }
  const W = 100;
  const H = 28;
  const max = Math.max(...values);
  const step = W / (values.length - 1);
  const points = values
    .map((v, i) => {
      const x = i * step;
      const y = H - 2 - (v / max) * (H - 4);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={className} aria-hidden>
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function MiniStat({
  value,
  label,
  tone,
}: {
  value: number;
  label: string;
  tone?: "danger";
}) {
  return (
    <GlassCard hover={false} className="p-3.5 text-center">
      <p
        className={cn(
          "font-display text-2xl font-semibold leading-none",
          tone === "danger" ? "text-danger" : "text-ink",
        )}
      >
        <CountUp value={value} />
      </p>
      <p className="mt-1.5 text-[11px] font-medium text-ink-500">{label}</p>
    </GlassCard>
  );
}
