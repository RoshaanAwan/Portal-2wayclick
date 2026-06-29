"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ArcElement,
  Filler,
  Tooltip,
  type ChartOptions,
  type ScriptableContext,
} from "chart.js";
import { Line, Doughnut } from "react-chartjs-2";
import { GlassCard } from "@/components/ui/GlassCard";
import { useTheme, useAccentColor } from "@/components/ThemeProvider";
import { CATEGORY_LABELS, type WorkCategory } from "@/lib/auditScore";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ArcElement,
  Filler,
  Tooltip,
);

const AXIS = {
  dark: { tick: "#74747f", grid: "rgba(255,255,255,0.05)" },
  light: { tick: "#84848e", grid: "rgba(0,0,0,0.05)" },
} as const;

// Per-category colors for the doughnut + legend. Delivery rides the accent.
const CATEGORY_COLOR: Record<WorkCategory, string> = {
  delivery: "#f5683f",
  decision: "#8b5cf6",
  finance: "#10b981",
  people: "#3b82f6",
  collab: "#eab308",
};

// On-time delivery split colors.
const DELIVERY_COLORS = ["#10b981", "#f43f5e", "#74747f"] as const; // on-time, late, no due date

export interface PersonChartsData {
  /** Per-bucket work score across the period (oldest→newest). */
  spark: number[];
  /** Axis labels for each bucket (e.g. "Jun 3"). Same length as spark. */
  labels: string[];
  /** Weighted score per category (only non-zero entries are charted). */
  byCategory: Record<WorkCategory, number>;
  /** Delivered tasks that had a due date. */
  datedDelivered: number;
  /** Of dated deliveries, how many were on/before the due date. */
  onTimeDelivered: number;
  /** Total tasks delivered in the period. */
  delivered: number;
  firstName: string;
}

export function PersonCharts({ data }: { data: PersonChartsData }) {
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <div className="lg:col-span-2">
        <WorkTrendChart spark={data.spark} labels={data.labels} />
      </div>
      <CategoryDoughnut byCategory={data.byCategory} firstName={data.firstName} />
      <DeliveryDoughnut
        delivered={data.delivered}
        dated={data.datedDelivered}
        onTime={data.onTimeDelivered}
      />
    </div>
  );
}

// ── Work trend (per-person score over the period) ─────────────────────────────

function WorkTrendChart({ spark, labels }: { spark: number[]; labels: string[] }) {
  const { theme } = useTheme();
  const c = AXIS[theme];
  const accentColor = useAccentColor();
  const accentSoft = useAccentColor("--c-accent", 0.15);

  const peak = spark.reduce((m, v) => Math.max(m, v), 0);
  const allZero = spark.every((v) => v === 0);

  const chartData = useMemo(
    () => ({
      labels,
      datasets: [
        {
          data: spark,
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
    [labels, spark, accentColor, accentSoft],
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
          <p className="text-[11px] text-ink-400">Work score per day over the period</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-ink-500">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          Peak {peak}
        </span>
      </div>

      {allZero ? (
        <div className="grid h-44 place-items-center text-sm text-ink-400">
          No scored activity in this period.
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="h-44 w-full"
        >
          <Line data={chartData} options={options} />
        </motion.div>
      )}
    </GlassCard>
  );
}

// ── Score by category (doughnut + legend) ─────────────────────────────────────

function CategoryDoughnut({
  byCategory,
  firstName,
}: {
  byCategory: Record<WorkCategory, number>;
  firstName: string;
}) {
  const { theme } = useTheme();
  const c = AXIS[theme];

  const cats = (Object.entries(byCategory) as [WorkCategory, number][])
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);
  const total = cats.reduce((s, [, v]) => s + v, 0);

  const chartData = useMemo(
    () => ({
      labels: cats.map(([cat]) => CATEGORY_LABELS[cat]),
      datasets: [
        {
          data: cats.map(([, v]) => v),
          backgroundColor: cats.map(([cat]) => CATEGORY_COLOR[cat]),
          borderColor: "transparent",
          borderWidth: 0,
          hoverOffset: 6,
        },
      ],
    }),
    [cats],
  );

  const options = useMemo<ChartOptions<"doughnut">>(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      cutout: "66%",
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
          callbacks: {
            label: (item) => {
              const v = item.parsed;
              const pct = total ? Math.round((v / total) * 100) : 0;
              return `${v} (${pct}%)`;
            },
          },
        },
      },
    }),
    [theme, c.grid, total],
  );

  return (
    <GlassCard hover={false}>
      <h2 className="font-display text-[15px] font-semibold tracking-tight text-ink">
        Score by category
      </h2>
      <p className="mt-0.5 text-[11px] text-ink-400">
        How {firstName}&apos;s work score breaks down
      </p>

      {cats.length === 0 ? (
        <p className="mt-6 text-sm text-ink-400">No counted work in this period.</p>
      ) : (
        <div className="mt-4 flex items-center gap-5">
          <div className="relative h-36 w-36 shrink-0">
            <Doughnut data={chartData} options={options} />
            <div className="pointer-events-none absolute inset-0 grid place-items-center">
              <div className="text-center">
                <p className="font-display text-xl font-semibold leading-none text-ink">
                  {total}
                </p>
                <p className="mt-0.5 text-[10px] text-ink-400">total</p>
              </div>
            </div>
          </div>
          <ul className="min-w-0 flex-1 space-y-1.5">
            {cats.map(([cat, v]) => (
              <li key={cat} className="flex items-center gap-2 text-xs">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: CATEGORY_COLOR[cat] }}
                />
                <span className="min-w-0 flex-1 truncate text-ink-600">
                  {CATEGORY_LABELS[cat]}
                </span>
                <span className="shrink-0 font-medium tabular-nums text-ink">{v}</span>
                <span className="w-9 shrink-0 text-right tabular-nums text-ink-400">
                  {total ? Math.round((v / total) * 100) : 0}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </GlassCard>
  );
}

// ── Delivery quality (on-time vs late vs undated) ─────────────────────────────

function DeliveryDoughnut({
  delivered,
  dated,
  onTime,
}: {
  delivered: number;
  dated: number;
  onTime: number;
}) {
  const { theme } = useTheme();
  const c = AXIS[theme];

  const late = Math.max(0, dated - onTime);
  const undated = Math.max(0, delivered - dated);
  const segments: { label: string; value: number; color: string }[] = [
    { label: "On time", value: onTime, color: DELIVERY_COLORS[0] },
    { label: "Late", value: late, color: DELIVERY_COLORS[1] },
    { label: "No due date", value: undated, color: DELIVERY_COLORS[2] },
  ].filter((s) => s.value > 0);

  const onTimePct = dated > 0 ? Math.round((onTime / dated) * 100) : null;

  const chartData = useMemo(
    () => ({
      labels: segments.map((s) => s.label),
      datasets: [
        {
          data: segments.map((s) => s.value),
          backgroundColor: segments.map((s) => s.color),
          borderColor: "transparent",
          borderWidth: 0,
          hoverOffset: 6,
        },
      ],
    }),
    [segments],
  );

  const options = useMemo<ChartOptions<"doughnut">>(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      cutout: "66%",
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
        },
      },
    }),
    [theme, c.grid],
  );

  return (
    <GlassCard hover={false}>
      <h2 className="font-display text-[15px] font-semibold tracking-tight text-ink">
        Delivery quality
      </h2>
      <p className="mt-0.5 text-[11px] text-ink-400">
        On-time rate among delivered tasks
      </p>

      {delivered === 0 ? (
        <p className="mt-6 text-sm text-ink-400">No tasks delivered in this period.</p>
      ) : (
        <div className="mt-4 flex items-center gap-5">
          <div className="relative h-36 w-36 shrink-0">
            <Doughnut data={chartData} options={options} />
            <div className="pointer-events-none absolute inset-0 grid place-items-center">
              <div className="text-center">
                <p className="font-display text-xl font-semibold leading-none text-ink">
                  {onTimePct === null ? "—" : `${onTimePct}%`}
                </p>
                <p className="mt-0.5 text-[10px] text-ink-400">on time</p>
              </div>
            </div>
          </div>
          <ul className="min-w-0 flex-1 space-y-1.5">
            {segments.map((s) => (
              <li key={s.label} className="flex items-center gap-2 text-xs">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: s.color }}
                />
                <span className="min-w-0 flex-1 truncate text-ink-600">{s.label}</span>
                <span className="shrink-0 font-medium tabular-nums text-ink">
                  {s.value}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </GlassCard>
  );
}
