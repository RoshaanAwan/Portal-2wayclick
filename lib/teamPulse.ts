import "server-only";
import { db } from "./db";
import { isManagerTier } from "./permissions";
import type { SafeUser } from "./auth";

// ── Team Pulse ────────────────────────────────────────────────────────────────
// Answers "is my team okay right now?" by combining three datasets the portal
// already has — approved time-off, assigned tasks (with due dates + priority),
// and the org tree — into a single per-person capacity read. Nothing here exists
// as a standalone page elsewhere; the value is the COMBINATION.
//
// Scope: a manager sees their own reports (the org subtree under them). Admin
// tier sees the whole company. Built server-side; permission-checked at the page.

export type PulseStatus = "out" | "overloaded" | "busy" | "available";

export interface PulsePerson {
  id: string;
  name: string;
  title: string;
  department: string;
  avatarUrl: string | null;
  status: PulseStatus;
  /** 0–100 workload score (open assigned tasks, weighted by priority + overdue). */
  load: number;
  openTasks: number;
  overdueTasks: number;
  highPriority: number;
  /** If currently on approved leave, when they're back (else null). */
  outUntil: string | null;
  leaveType: string | null;
}

export interface PulseSummary {
  total: number;
  out: number;
  overloaded: number;
  available: number;
  /** Average load across people who are present (not on leave). */
  avgLoad: number;
}

export interface TeamPulse {
  scope: "team" | "company";
  people: PulsePerson[];
  summary: PulseSummary;
  byDepartment: { department: string; people: PulsePerson[] }[];
}

// Weight per open task so load reflects pressure, not just count. Overdue and
// high-priority work weigh more. Tuned so ~5 normal tasks ≈ a busy-but-fine load.
// Exported so the org chart (lib/orgChart.ts) scores load identically — one
// source of truth for "how loaded is this person".
export const W_BASE = 8;
export const W_HIGH = 16;
export const W_OVERDUE = 14;
export const OVERLOAD_AT = 70; // load ≥ this ⇒ "overloaded"
export const BUSY_AT = 35; // load ≥ this ⇒ "busy"

/** All descendant user ids under `rootId` in the manager→reports tree (inclusive opt). */
async function reportSubtreeIds(rootId: string): Promise<string[]> {
  // The tree is shallow in practice; walk it breadth-first with batched queries.
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

function classify(
  onLeave: boolean,
  load: number,
): PulseStatus {
  if (onLeave) return "out";
  if (load >= OVERLOAD_AT) return "overloaded";
  if (load >= BUSY_AT) return "busy";
  return "available";
}

export async function buildTeamPulse(viewer: SafeUser): Promise<TeamPulse> {
  const now = new Date();

  // Decide the population: admins see everyone; managers see their subtree.
  // (Anyone below manager tier shouldn't reach this — the page gates it.)
  const isCompanyWide =
    viewer.role === "SUPER_ADMIN" || viewer.role === "ADMIN" || viewer.role === "HR";

  let people;
  if (isCompanyWide) {
    people = await db.user.findMany({
      select: {
        id: true,
        name: true,
        title: true,
        department: true,
        avatarUrl: true,
      },
      orderBy: { name: "asc" },
    });
  } else {
    const ids = await reportSubtreeIds(viewer.id);
    people = await db.user.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        name: true,
        title: true,
        department: true,
        avatarUrl: true,
      },
      orderBy: { name: "asc" },
    });
  }

  const ids = people.map((p) => p.id);

  if (ids.length === 0) {
    return {
      scope: isCompanyWide ? "company" : "team",
      people: [],
      summary: { total: 0, out: 0, overloaded: 0, available: 0, avgLoad: 0 },
      byDepartment: [],
    };
  }

  // Currently-approved leave for these people (covers today).
  const leaves = await db.leaveRequest.findMany({
    where: {
      ownerId: { in: ids },
      status: "APPROVED",
      startDate: { lte: now },
      endDate: { gte: now },
    },
    select: { ownerId: true, endDate: true, type: true },
  });
  const leaveByUser = new Map(leaves.map((l) => [l.ownerId, l]));

  // Open task assignments for these people. "Open" = not in a list named like
  // Done/Complete/Archived (the boards use free-text list names).
  const assignments = await db.taskAssignee.findMany({
    where: { userId: { in: ids } },
    select: {
      userId: true,
      task: {
        select: {
          priority: true,
          dueDate: true,
          list: { select: { name: true } },
        },
      },
    },
  });

  interface Acc {
    open: number;
    overdue: number;
    high: number;
    load: number;
  }
  const acc = new Map<string, Acc>();
  for (const id of ids) acc.set(id, { open: 0, overdue: 0, high: 0, load: 0 });

  const isDoneList = (name: string) =>
    /done|complete|archiv|shipped|closed/i.test(name);

  for (const a of assignments) {
    if (isDoneList(a.task.list.name)) continue;
    const e = acc.get(a.userId)!;
    e.open += 1;
    let weight = W_BASE;
    if (a.task.priority === "HIGH") {
      e.high += 1;
      weight += W_HIGH - W_BASE;
    }
    if (a.task.dueDate && a.task.dueDate < now) {
      e.overdue += 1;
      weight += W_OVERDUE;
    }
    e.load += weight;
  }

  const result: PulsePerson[] = people.map((p) => {
    const e = acc.get(p.id)!;
    const leave = leaveByUser.get(p.id);
    const onLeave = !!leave;
    const load = Math.min(100, e.load);
    return {
      id: p.id,
      name: p.name,
      title: p.title,
      department: p.department,
      avatarUrl: p.avatarUrl,
      status: classify(onLeave, load),
      load,
      openTasks: e.open,
      overdueTasks: e.overdue,
      highPriority: e.high,
      outUntil: leave ? leave.endDate.toISOString() : null,
      leaveType: leave ? leave.type : null,
    };
  });

  // Summary.
  const present = result.filter((p) => p.status !== "out");
  const summary: PulseSummary = {
    total: result.length,
    out: result.filter((p) => p.status === "out").length,
    overloaded: result.filter((p) => p.status === "overloaded").length,
    available: result.filter((p) => p.status === "available").length,
    avgLoad: present.length
      ? Math.round(present.reduce((s, p) => s + p.load, 0) / present.length)
      : 0,
  };

  // Group by department (sorted by name) for the heatmap rows.
  const deptMap = new Map<string, PulsePerson[]>();
  for (const p of result) {
    if (!deptMap.has(p.department)) deptMap.set(p.department, []);
    deptMap.get(p.department)!.push(p);
  }
  const byDepartment = [...deptMap.entries()]
    .map(([department, ppl]) => ({ department, people: ppl }))
    .sort((a, b) => a.department.localeCompare(b.department));

  return {
    scope: isCompanyWide ? "company" : "team",
    people: result,
    summary,
    byDepartment,
  };
}

/** Guard for the page: who may see Team Pulse at all. */
export function canViewTeamPulse(role: string | null | undefined): boolean {
  return isManagerTier(role);
}
