import "server-only";
import { db } from "./db";
import type { SafeUser } from "./auth";
import { isManagerTier } from "./permissions";
import {
  scoreAction,
  ALL_CATEGORIES,
  type WorkCategory,
} from "./auditScore";

// ── Performance ───────────────────────────────────────────────────────────────
// Scores EVERYONE — QA, HR, engineers, finance — from the AuditLog, the one place
// the portal records who-did-what across every department (not just the task
// board). A role-blind metric: HR scores from leave/expense decisions and comms;
// QA from card status changes and bug work; engineers from delivery; finance from
// invoices/salary. Each audited action carries a significance weight (see
// lib/auditScore.ts), so the headline "work score" reflects substance, not raw
// volume — and auth/system noise is excluded so logging in can't inflate it.
//
// Delivery (tasks reaching DONE) is kept as a SECONDARY, board-specific column,
// since it's still a meaningful outcome for people who live on the board.
//
// Population scoping mirrors lib/teamPulse.ts: admins/HR see everyone, managers
// see their report subtree.

/** Period granularity for the report — a single month, or a whole year. */
export type PerfPeriod = "month" | "year";

export interface PerformanceFilters {
  period: PerfPeriod;
  /** 4-digit year, e.g. 2026. */
  year: number;
  /** 0–11 month index — only meaningful when period === "month". */
  month: number;
  /** Optional: narrow the whole report to one person. */
  userId: string | null;
}

/** A user the viewer is allowed to filter by (for the user-wise dropdown). */
export interface PerfUserOption {
  id: string;
  name: string;
}

export interface PerformancePerson {
  id: string;
  name: string;
  title: string;
  department: string;
  avatarUrl: string | null;

  // ── Work score — the primary, role-blind signal (from the AuditLog) ──
  /** Weighted sum of audited work actions in the period. The headline number. */
  workScore: number;
  /** Raw count of counted (non-noise) audited actions in the period. */
  actionCount: number;
  /** Weighted score split by work category (delivery/decision/finance/…). */
  byCategory: Record<WorkCategory, number>;
  /** The category this person spent the most weight on, or null. */
  topCategory: WorkCategory | null;
  /** Distinct calendar days with at least one counted action. */
  activeDays: number;

  // ── Delivery — secondary, board-specific outcome ──
  /** Tasks completed (reached DONE) within the period. */
  delivered: number;
  /** Of delivered tasks that had a due date, how many were done on/before it. */
  onTimeDelivered: number;
  /** Delivered tasks that had a due date (the denominator for onTimeRate). */
  datedDelivered: number;
  /** % on-time among dated deliveries (0–100), or null when none were dated. */
  onTimeRate: number | null;
  /** Tasks assigned to this person not yet in DONE. */
  openTasks: number;
  /** Open tasks whose due date is in the past. */
  overdueTasks: number;

  /** Per-bucket work score across the window (oldest→newest) for a sparkline. */
  spark: number[];
}

/** One point in the team-wide work trend (a day for month view, a month for
 *  year view). */
export interface DailyPoint {
  /** ISO date (YYYY-MM-DD) anchoring the bucket. */
  date: string;
  /** Short label for the axis, e.g. "Jun 3" (month) or "Jun" (year). */
  label: string;
  /** Total work score across all people in this bucket. */
  score: number;
}

export interface PerformanceSummary {
  total: number;
  /** Total work score across everyone in the period. */
  totalScore: number;
  /** Total counted actions across everyone. */
  totalActions: number;
  /** Total tasks delivered across everyone in the period. */
  totalDelivered: number;
  /** Team on-time rate among dated deliveries (0–100), or null. */
  onTimeRate: number | null;
  /** Total open tasks across everyone (current snapshot). */
  openTasks: number;
  /** Total overdue open tasks across everyone (current snapshot). */
  overdueTasks: number;
}

export interface PerformanceReport {
  scope: "team" | "company";
  windowDays: number;
  /** Echo of the filters this report was built with (drives the controls). */
  filters: PerformanceFilters;
  /** Human label for the active period, e.g. "June 2026" or "2026". */
  periodLabel: string;
  /** Years that have data, descending — populates the year dropdown. */
  availableYears: number[];
  /** People the viewer may filter by — populates the user dropdown. */
  userOptions: PerfUserOption[];
  people: PerformancePerson[];
  summary: PerformanceSummary;
  /** Team-wide work-score-per-bucket across the window (oldest→newest). */
  daily: DailyPoint[];
}

/** Guard for the page: who may see Performance at all (manager tier and up). */
export function canViewPerformance(role: string | null | undefined): boolean {
  return isManagerTier(role);
}

/** All descendant user ids under `rootId` in the manager→reports tree. */
async function reportSubtreeIds(rootId: string): Promise<string[]> {
  const collected = new Set<string>();
  let frontier = [rootId];
  while (frontier.length) {
    const reports = await db.user.findMany({
      where: { managerId: { in: frontier } },
      select: { id: true },
    });
    const next: string[] = [];
    for (const r of reports) {
      if (!collected.has(r.id)) {
        collected.add(r.id);
        next.push(r.id);
      }
    }
    frontier = next;
  }
  return [...collected];
}

function emptyByCategory(): Record<WorkCategory, number> {
  const o = {} as Record<WorkCategory, number>;
  for (const c of ALL_CATEGORIES) o[c] = 0;
  return o;
}

/** A local YYYY-MM-DD key, so "active days" counts calendar days not 24h slices. */
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

interface DayBucket {
  /** Matches dayKey() so events index straight in. */
  key: string;
  /** ISO date for the payload. */
  iso: string;
  /** Short axis label, e.g. "Jun 3". */
  label: string;
}

/** Ordered calendar days (oldest→newest) covering [start, end] inclusive. */
function buildDayBuckets(start: Date, end: Date): DayBucket[] {
  const out: DayBucket[] = [];
  const d = new Date(start);
  d.setHours(0, 0, 0, 0);
  const last = new Date(end);
  last.setHours(0, 0, 0, 0);
  while (d <= last) {
    out.push({
      key: dayKey(d),
      iso: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
        d.getDate(),
      ).padStart(2, "0")}`,
      label: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    });
    d.setDate(d.getDate() + 1);
  }
  return out;
}

/** A month-key (YYYY-M), so year-view events index into the right month. */
function monthKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}`;
}

/** The 12 months of `year` as ordered buckets (Jan→Dec). */
function buildMonthBuckets(year: number): DayBucket[] {
  const out: DayBucket[] = [];
  for (let m = 0; m < 12; m++) {
    const first = new Date(year, m, 1);
    out.push({
      key: monthKey(first),
      iso: `${year}-${String(m + 1).padStart(2, "0")}-01`,
      label: first.toLocaleDateString(undefined, { month: "short" }),
    });
  }
  return out;
}

/**
 * Resolve a period filter to a concrete [start, end) window plus the matching
 * bucket timeline. Month view → one calendar month, daily buckets keyed by day.
 * Year view → the whole year, monthly buckets keyed by month.
 */
function resolveWindow(filters: PerformanceFilters): {
  start: Date;
  end: Date;
  buckets: DayBucket[];
  keyOf: (d: Date) => string;
  periodLabel: string;
} {
  if (filters.period === "year") {
    const start = new Date(filters.year, 0, 1);
    const end = new Date(filters.year + 1, 0, 1); // exclusive
    return {
      start,
      end,
      buckets: buildMonthBuckets(filters.year),
      keyOf: monthKey,
      periodLabel: String(filters.year),
    };
  }
  // Month view.
  const start = new Date(filters.year, filters.month, 1);
  const end = new Date(filters.year, filters.month + 1, 1); // exclusive
  const lastDay = new Date(end.getTime() - 1);
  return {
    start,
    end,
    buckets: buildDayBuckets(start, lastDay),
    keyOf: dayKey,
    periodLabel: start.toLocaleDateString(undefined, {
      month: "long",
      year: "numeric",
    }),
  };
}

/** Coerce raw URL params into a valid, in-range filter set. */
export function normalizeFilters(raw: {
  period?: string;
  year?: string;
  month?: string;
  user?: string;
}): PerformanceFilters {
  const now = new Date();
  const period: PerfPeriod = raw.period === "year" ? "year" : "month";
  const year = Number.isFinite(Number(raw.year))
    ? Math.trunc(Number(raw.year))
    : now.getFullYear();
  const monthRaw = Number(raw.month);
  const month =
    Number.isInteger(monthRaw) && monthRaw >= 0 && monthRaw <= 11
      ? monthRaw
      : now.getMonth();
  return {
    period,
    year,
    month,
    userId: raw.user && raw.user.trim() ? raw.user.trim() : null,
  };
}

export async function buildPerformance(
  viewer: SafeUser,
  filters: PerformanceFilters = normalizeFilters({}),
): Promise<PerformanceReport> {
  const { start, end, buckets, keyOf, periodLabel } = resolveWindow(filters);
  const bucketIndex = new Map(buckets.map((b, i) => [b.key, i]));

  const windowDayCount = Math.max(
    1,
    Math.round((end.getTime() - start.getTime()) / 86_400_000),
  );

  // Population: admins/HR see everyone; managers see their subtree. The full set
  // (pre user-filter) populates the user dropdown.
  const isCompanyWide =
    viewer.role === "SUPER_ADMIN" ||
    viewer.role === "ADMIN" ||
    viewer.role === "HR";

  const audience = isCompanyWide
    ? await db.user.findMany({
        select: {
          id: true,
          name: true,
          title: true,
          department: true,
          avatarUrl: true,
        },
        orderBy: { name: "asc" },
      })
    : await db.user.findMany({
        where: { id: { in: await reportSubtreeIds(viewer.id) } },
        select: {
          id: true,
          name: true,
          title: true,
          department: true,
          avatarUrl: true,
        },
        orderBy: { name: "asc" },
      });

  const userOptions: PerfUserOption[] = audience.map((u) => ({
    id: u.id,
    name: u.name,
  }));

  // Apply the user-wise filter (ignore an id the viewer isn't allowed to see).
  const allowed = new Set(audience.map((u) => u.id));
  const effectiveUserId =
    filters.userId && allowed.has(filters.userId) ? filters.userId : null;
  const people = effectiveUserId
    ? audience.filter((u) => u.id === effectiveUserId)
    : audience;

  // Distinct years with activity, for the year dropdown (best-effort).
  const availableYears = await activityYears(audience.map((u) => u.id));

  const ids = people.map((p) => p.id);
  if (ids.length === 0) {
    return {
      scope: isCompanyWide ? "company" : "team",
      windowDays: windowDayCount,
      filters: { ...filters, userId: effectiveUserId },
      periodLabel,
      availableYears,
      userOptions,
      people: [],
      summary: {
        total: 0,
        totalScore: 0,
        totalActions: 0,
        totalDelivered: 0,
        onTimeRate: null,
        openTasks: 0,
        overdueTasks: 0,
      },
      daily: buckets.map((b) => ({ date: b.iso, label: b.label, score: 0 })),
    };
  }

  const now = new Date();

  // Three reads in parallel:
  //  1. Audit actions in the window — the PRIMARY signal (every department's work
  //     lands here; we weight + bucket each one into a work score).
  //  2. Deliveries: assignments whose task was COMPLETED in the window — the
  //     secondary, board-specific outcome.
  //  3. Load: assignments whose task is NOT done — a current open/overdue snapshot.
  const [auditRows, deliveries, openLoad] = await Promise.all([
    db.auditLog.findMany({
      where: { actorId: { in: ids }, createdAt: { gte: start, lt: end } },
      select: { actorId: true, action: true, createdAt: true },
    }),
    db.taskAssignee.findMany({
      where: {
        userId: { in: ids },
        task: { completedAt: { gte: start, lt: end } },
      },
      select: {
        userId: true,
        task: { select: { completedAt: true, dueDate: true } },
      },
    }),
    db.taskAssignee.findMany({
      where: { userId: { in: ids }, task: { status: { not: "DONE" } } },
      select: { userId: true, task: { select: { dueDate: true } } },
    }),
  ]);

  // ── Per-user aggregation ──
  interface Agg {
    score: number;
    actions: number;
    byCategory: Record<WorkCategory, number>;
    days: Set<string>;
    delivered: number;
    onTime: number;
    dated: number;
    open: number;
    overdue: number;
    spark: number[];
  }
  const agg = new Map<string, Agg>();
  const ensure = (id: string) => {
    let a = agg.get(id);
    if (!a) {
      a = {
        score: 0,
        actions: 0,
        byCategory: emptyByCategory(),
        days: new Set(),
        delivered: 0,
        onTime: 0,
        dated: 0,
        open: 0,
        overdue: 0,
        spark: new Array(buckets.length).fill(0),
      };
      agg.set(id, a);
    }
    return a;
  };

  // Team-wide work score per bucket (the headline trend).
  const scorePerBucket = new Array(buckets.length).fill(0);

  for (const row of auditRows) {
    if (!row.actorId) continue;
    const scored = scoreAction(row.action);
    if (!scored) continue; // excluded noise (auth/system/etc.)
    const a = ensure(row.actorId);
    a.score += scored.weight;
    a.actions++;
    a.byCategory[scored.category] += scored.weight;
    a.days.add(dayKey(row.createdAt));
    const bi = bucketIndex.get(keyOf(row.createdAt));
    if (bi !== undefined) {
      a.spark[bi] += scored.weight;
      scorePerBucket[bi] += scored.weight;
    }
  }

  for (const row of deliveries) {
    const a = ensure(row.userId);
    const t = row.task;
    if (!t.completedAt) continue; // the where-clause guarantees it; satisfies the type
    a.delivered++;
    if (t.dueDate) {
      a.dated++;
      if (t.completedAt <= endOfDay(t.dueDate)) a.onTime++;
    }
  }

  for (const row of openLoad) {
    const a = ensure(row.userId);
    a.open++;
    if (row.task.dueDate && row.task.dueDate < now) a.overdue++;
  }

  const result: PerformancePerson[] = people.map((p) => {
    const a = agg.get(p.id);
    const byCategory = a?.byCategory ?? emptyByCategory();
    const dated = a?.dated ?? 0;
    const onTime = a?.onTime ?? 0;

    // Category this person put the most weight into.
    let topCategory: WorkCategory | null = null;
    let topWeight = 0;
    for (const c of ALL_CATEGORIES) {
      if (byCategory[c] > topWeight) {
        topWeight = byCategory[c];
        topCategory = c;
      }
    }

    return {
      id: p.id,
      name: p.name,
      title: p.title,
      department: p.department,
      avatarUrl: p.avatarUrl,
      workScore: a?.score ?? 0,
      actionCount: a?.actions ?? 0,
      byCategory,
      topCategory,
      activeDays: a?.days.size ?? 0,
      delivered: a?.delivered ?? 0,
      onTimeDelivered: onTime,
      datedDelivered: dated,
      onTimeRate: dated > 0 ? Math.round((onTime / dated) * 100) : null,
      openTasks: a?.open ?? 0,
      overdueTasks: a?.overdue ?? 0,
      spark: a?.spark ?? new Array(buckets.length).fill(0),
    };
  });

  // Team summary. On-time rate is pooled (sum on-time / sum dated), not an
  // average of per-person rates, so one lone dated task can't swing it.
  const sum = (sel: (p: PerformancePerson) => number) =>
    result.reduce((s, p) => s + sel(p), 0);
  const teamDated = sum((p) => p.datedDelivered);
  const teamOnTime = sum((p) => p.onTimeDelivered);

  return {
    scope: isCompanyWide ? "company" : "team",
    windowDays: windowDayCount,
    filters: { ...filters, userId: effectiveUserId },
    periodLabel,
    availableYears,
    userOptions,
    people: result,
    summary: {
      total: result.length,
      totalScore: sum((p) => p.workScore),
      totalActions: sum((p) => p.actionCount),
      totalDelivered: sum((p) => p.delivered),
      onTimeRate: teamDated > 0 ? Math.round((teamOnTime / teamDated) * 100) : null,
      openTasks: sum((p) => p.openTasks),
      overdueTasks: sum((p) => p.overdueTasks),
    },
    daily: buckets.map((b, i) => ({
      date: b.iso,
      label: b.label,
      score: scorePerBucket[i],
    })),
  };
}

/** End-of-day for a due date, so a same-day completion counts as on time. */
function endOfDay(d: Date): Date {
  const e = new Date(d);
  e.setHours(23, 59, 59, 999);
  return e;
}

/**
 * Years to offer in the dropdown: from the earliest signal (a tracked task or an
 * activity event) up to this year, contiguous. Newest first.
 */
async function activityYears(ids: string[]): Promise<number[]> {
  const years = new Set<number>([new Date().getFullYear()]);
  if (ids.length > 0) {
    // Bound by whichever is older — the first task created or the first feed
    // event — so a year with deliveries still appears even with no feed events.
    const [oldestTask, oldestAudit] = await Promise.all([
      db.task.findFirst({
        where: { creatorId: { in: ids } },
        orderBy: { createdAt: "asc" },
        select: { createdAt: true },
      }),
      db.auditLog.findFirst({
        where: { actorId: { in: ids } },
        orderBy: { createdAt: "asc" },
        select: { createdAt: true },
      }),
    ]);
    const earliest = [oldestTask?.createdAt, oldestAudit?.createdAt]
      .filter((d): d is Date => !!d)
      .sort((a, b) => a.getTime() - b.getTime())[0];
    if (earliest) {
      const to = new Date().getFullYear();
      for (let y = earliest.getFullYear(); y <= to; y++) years.add(y);
    }
  }
  return [...years].sort((a, b) => b - a);
}
