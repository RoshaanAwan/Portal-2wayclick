import "server-only";
import { db } from "./db";
import type { SafeUser } from "./auth";
import { isManagerTier } from "./permissions";
import { DONE_LIST_KEYWORDS, isDoneList } from "./teamPulse";
import { netWorkedMinutes } from "./attendance";

// ── Performance ───────────────────────────────────────────────────────────────
// A retrospective, per-person read over a rolling 30-day window, built from two
// independent signals the portal already tracks:
//   • Tasks — output and reliability (completed work, on-time vs overdue).
//   • Attendance — presence and punctuality (Slack check-ins, see lib/attendance).
// We deliberately surface TWO separate 0–100 scores (task + attendance) plus the
// raw stats behind them, rather than one blended number — managers judge the mix.
//
// Mirrors lib/teamPulse.ts: same population scoping (admins/HR see everyone,
// managers see their report subtree) and the same done-list detection, so
// "completed" means the same thing everywhere.

export const PERF_WINDOW_DAYS = 30;

// Attendance scoring knobs.
const PUNCTUAL_BY_HOUR = 10; // checked in by 10:00 local-ish = punctual
const FULL_DAY_MINUTES = 6 * 60; // ≥ 6h worked (net of breaks) counts as a full day

export interface PerformancePerson {
  id: string;
  name: string;
  title: string;
  department: string;
  avatarUrl: string | null;

  /** 0–100 — task output & reliability over the window. */
  taskScore: number;
  /** 0–100 — presence & punctuality over the window. */
  attendanceScore: number;

  // ── Raw task stats (the numbers behind taskScore) ──
  completedTasks: number;
  onTimeTasks: number;
  overdueOpenTasks: number;
  openTasks: number;
  /** % of completed-with-a-due-date tasks that were done on time (0–100, null if N/A). */
  onTimeRate: number | null;

  // ── Raw attendance stats (the numbers behind attendanceScore) ──
  daysPresent: number;
  expectedDays: number; // weekdays in the window
  punctualDays: number;
  fullDays: number;
  /** % of expected weekdays present (0–100). */
  presenceRate: number;
}

export interface PerformanceSummary {
  total: number;
  avgTaskScore: number;
  avgAttendanceScore: number;
  /** Count of people with both scores ≥ 75. */
  topPerformers: number;
}

export interface PerformanceReport {
  scope: "team" | "company";
  windowDays: number;
  people: PerformancePerson[];
  summary: PerformanceSummary;
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

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/** Count the weekdays (Mon–Fri) in [start, end]. The expected-presence baseline. */
function weekdaysBetween(start: Date, end: Date): number {
  let count = 0;
  const d = new Date(start);
  d.setHours(0, 0, 0, 0);
  const last = new Date(end);
  last.setHours(0, 0, 0, 0);
  while (d <= last) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

export async function buildPerformance(
  viewer: SafeUser,
): Promise<PerformanceReport> {
  const now = new Date();
  const windowStart = new Date(now);
  windowStart.setDate(windowStart.getDate() - PERF_WINDOW_DAYS);

  // Population: admins/HR see everyone; managers see their subtree.
  const isCompanyWide =
    viewer.role === "SUPER_ADMIN" ||
    viewer.role === "ADMIN" ||
    viewer.role === "HR";

  const people = isCompanyWide
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

  const ids = people.map((p) => p.id);
  if (ids.length === 0) {
    return {
      scope: isCompanyWide ? "company" : "team",
      windowDays: PERF_WINDOW_DAYS,
      people: [],
      summary: {
        total: 0,
        avgTaskScore: 0,
        avgAttendanceScore: 0,
        topPerformers: 0,
      },
    };
  }

  const expectedDays = Math.max(1, weekdaysBetween(windowStart, now));

  // Pull the two signals in parallel.
  //  • Task assignments whose task was created within the window (the only
  //    timestamp we have — tasks carry no completedAt). list name tells us
  //    whether it's "done" (closed column) or still open.
  //  • Attendance rows in the window.
  const [assignments, attendance] = await Promise.all([
    db.taskAssignee.findMany({
      where: {
        userId: { in: ids },
        task: { createdAt: { gte: windowStart } },
      },
      select: {
        userId: true,
        task: {
          select: {
            dueDate: true,
            createdAt: true,
            list: { select: { name: true } },
          },
        },
      },
    }),
    db.attendance.findMany({
      where: { userId: { in: ids }, day: { gte: windowStart } },
      select: {
        userId: true,
        checkInAt: true,
        checkOutAt: true,
        breaks: { select: { breakInAt: true, breakOutAt: true } },
      },
    }),
  ]);

  // ── Aggregate tasks per user ──
  interface TaskAgg {
    completed: number;
    onTime: number;
    dueCompleted: number; // completed tasks that had a due date
    overdueOpen: number;
    open: number;
  }
  const taskAgg = new Map<string, TaskAgg>();
  const ensureTask = (id: string) => {
    let a = taskAgg.get(id);
    if (!a) {
      a = { completed: 0, onTime: 0, dueCompleted: 0, overdueOpen: 0, open: 0 };
      taskAgg.set(id, a);
    }
    return a;
  };

  for (const row of assignments) {
    const a = ensureTask(row.userId);
    const done = isDoneList(row.task.list.name);
    if (done) {
      a.completed++;
      // On-time rate is computed only over completed tasks that HAD a due date.
      // We have no completedAt, so the proxy is: a done task whose due date is
      // not in the past was closed on/before its deadline = on time; one with a
      // past-due date was closed late. Undated completed tasks don't affect the
      // rate (they can't be "late").
      if (row.task.dueDate) {
        a.dueCompleted++;
        if (row.task.dueDate >= now) a.onTime++;
      }
    } else {
      a.open++;
      if (row.task.dueDate && row.task.dueDate < now) a.overdueOpen++;
    }
  }

  // ── Aggregate attendance per user ──
  interface AttAgg {
    present: number;
    punctual: number;
    full: number;
  }
  const attAgg = new Map<string, AttAgg>();
  const ensureAtt = (id: string) => {
    let a = attAgg.get(id);
    if (!a) {
      a = { present: 0, punctual: 0, full: 0 };
      attAgg.set(id, a);
    }
    return a;
  };

  for (const row of attendance) {
    const a = ensureAtt(row.userId);
    a.present++;
    if (row.checkInAt && row.checkInAt.getHours() < PUNCTUAL_BY_HOUR) {
      a.punctual++;
    }
    // "Full day" is worked time, net of breaks — consistent with /attendance.
    const mins = netWorkedMinutes(row.checkInAt, row.checkOutAt, row.breaks);
    if (mins !== null && mins >= FULL_DAY_MINUTES) a.full++;
  }

  const result: PerformancePerson[] = people.map((p) => {
    const t = taskAgg.get(p.id) ?? {
      completed: 0,
      onTime: 0,
      dueCompleted: 0,
      overdueOpen: 0,
      open: 0,
    };
    const at = attAgg.get(p.id) ?? { present: 0, punctual: 0, full: 0 };

    // ── Task score ──
    // Output curve: ~8 completed tasks in 30 days saturates the volume half.
    const volume = Math.min(1, t.completed / 8); // 0–1
    const onTimeRate =
      t.dueCompleted > 0 ? t.onTime / t.dueCompleted : null; // 0–1 or null
    // Reliability: on-time rate when we have dated work, else neutral 0.8.
    const reliability = onTimeRate ?? 0.8;
    // Penalty for overdue open work (each overdue task shaves a few points).
    const overduePenalty = Math.min(20, t.overdueOpen * 6);
    const taskScore = clamp(
      (volume * 55 + reliability * 45) - overduePenalty,
    );

    // ── Attendance score ──
    const presenceRate = at.present / expectedDays; // 0–1 (can exceed if weekend work)
    const punctualityRate = at.present > 0 ? at.punctual / at.present : 0;
    const attendanceScore = clamp(
      Math.min(1, presenceRate) * 80 + punctualityRate * 20,
    );

    return {
      id: p.id,
      name: p.name,
      title: p.title,
      department: p.department,
      avatarUrl: p.avatarUrl,
      taskScore,
      attendanceScore,
      completedTasks: t.completed,
      onTimeTasks: t.onTime,
      overdueOpenTasks: t.overdueOpen,
      openTasks: t.open,
      onTimeRate: onTimeRate === null ? null : Math.round(onTimeRate * 100),
      daysPresent: at.present,
      expectedDays,
      punctualDays: at.punctual,
      fullDays: at.full,
      presenceRate: clamp(Math.min(1, presenceRate) * 100),
    };
  });

  const total = result.length;
  const avg = (sel: (p: PerformancePerson) => number) =>
    total ? Math.round(result.reduce((s, p) => s + sel(p), 0) / total) : 0;

  return {
    scope: isCompanyWide ? "company" : "team",
    windowDays: PERF_WINDOW_DAYS,
    people: result,
    summary: {
      total,
      avgTaskScore: avg((p) => p.taskScore),
      avgAttendanceScore: avg((p) => p.attendanceScore),
      topPerformers: result.filter(
        (p) => p.taskScore >= 75 && p.attendanceScore >= 75,
      ).length,
    },
  };
}
