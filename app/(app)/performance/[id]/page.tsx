import Link from "@/components/Link";
import { notFound, redirect } from "next/navigation";
import {
  ArrowLeft,
  Gauge,
  Zap,
  Activity,
  CheckCircle2,
  CalendarDays,
  ListTodo,
  AlertTriangle,
} from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui/PageHeader";
import { GlassCard } from "@/components/ui/GlassCard";
import { Avatar } from "@/components/ui/Avatar";
import {
  buildPerformance,
  canViewPerformance,
  normalizeFilters,
  type PerformancePerson,
} from "@/lib/performance";
import { CATEGORY_LABELS } from "@/lib/auditScore";
import { cn } from "@/lib/utils";
import { PersonCharts } from "./PersonCharts";

export const metadata = { title: "Performance · Person" };

export default async function PerformancePersonPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    period?: string;
    year?: string;
    month?: string;
    user?: string;
  }>;
}) {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/login");
  // Same manager-tier gate as the board.
  if (!canViewPerformance(viewer.role)) redirect("/dashboard");

  const { id } = await params;
  const sp = await searchParams;
  const filters = normalizeFilters(sp);

  // Rebuild the report for the active period and pick this person out of the
  // viewer's scope — guarantees the same numbers as the board and enforces that
  // the viewer is actually allowed to see this person (out-of-scope ids 404).
  const report = await buildPerformance(viewer, filters);
  const person = report.people.find((p) => p.id === id);
  if (!person) notFound();

  // Preserve the active period when returning to the board.
  const backQuery = new URLSearchParams();
  backQuery.set("period", filters.period);
  backQuery.set("year", String(filters.year));
  if (filters.period === "month") backQuery.set("month", String(filters.month));
  const backHref = `/performance?${backQuery.toString()}`;

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Link
        href={backHref}
        className="inline-flex items-center gap-1.5 text-sm text-ink-500 transition hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to performance
      </Link>

      <PageHeader
        icon={Gauge}
        title={person.name}
        subtitle={`${person.title}${person.department ? ` · ${person.department}` : ""} — ${report.periodLabel}.`}
      />

      <PersonDetail person={person} />

      <PersonCharts
        data={{
          spark: person.spark,
          labels: report.daily.map((d) => d.label),
          byCategory: person.byCategory,
          datedDelivered: person.datedDelivered,
          onTimeDelivered: person.onTimeDelivered,
          delivered: person.delivered,
          firstName: person.name.split(" ")[0],
        }}
      />
    </div>
  );
}

// Per-person identity + headline stat tiles. The richer charts (trend +
// category/delivery doughnuts) live in <PersonCharts>. All from the report
// payload — no extra fetch.
function PersonDetail({ person: p }: { person: PerformancePerson }) {
  return (
    <GlassCard hover={false}>
      <div className="flex items-center gap-3">
        <Avatar name={p.name} src={p.avatarUrl} size="lg" ring />
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-ink">{p.name}</p>
          <p className="truncate text-xs text-ink-400">
            {p.title}
            {p.department ? ` · ${p.department}` : ""}
          </p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
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
          value={p.topCategory ? CATEGORY_LABELS[p.topCategory] : "—"}
          label="Focus"
        />
      </div>
    </GlassCard>
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
