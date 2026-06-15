import "server-only";
import { db } from "./db";
import {
  W_BASE,
  W_HIGH,
  W_OVERDUE,
  OVERLOAD_AT,
  BUSY_AT,
  type PulseStatus,
} from "./teamPulse";

// ── Org chart ─────────────────────────────────────────────────────────────────
// Turns the manager→reports relation into a nested tree for the animated org
// chart, decorated with the SAME per-person load read Team Pulse uses (same
// weights, same thresholds — imported, not re-derived). The chart is visible to
// everyone (it's the company structure), but the load ring is the standout: each
// card glows by how loaded that person is, so the whole org reads at a glance.

export interface OrgNode {
  id: string;
  name: string;
  title: string;
  department: string;
  avatarUrl: string | null;
  status: PulseStatus;
  /** 0–100 workload score, identical to Team Pulse's. */
  load: number;
  openTasks: number;
  /** Currently on approved leave covering today. */
  onLeave: boolean;
  /** Number of people in this person's entire subtree (excluding themselves). */
  teamSize: number;
  reports: OrgNode[];
}

interface PersonRow {
  id: string;
  name: string;
  title: string;
  department: string;
  avatarUrl: string | null;
  managerId: string | null;
}

const isDoneList = (name: string) =>
  /done|complete|archiv|shipped|closed/i.test(name);

function classify(onLeave: boolean, load: number): PulseStatus {
  if (onLeave) return "out";
  if (load >= OVERLOAD_AT) return "overloaded";
  if (load >= BUSY_AT) return "busy";
  return "available";
}

/**
 * Build the full company org chart (one tree per top-level person — anyone with
 * no manager is a root). Each node carries its load read and subtree size.
 */
export async function buildOrgChart(): Promise<OrgNode[]> {
  const now = new Date();

  const people: PersonRow[] = await db.user.findMany({
    select: {
      id: true,
      name: true,
      title: true,
      department: true,
      avatarUrl: true,
      managerId: true,
    },
    orderBy: { name: "asc" },
  });

  if (people.length === 0) return [];

  const ids = people.map((p) => p.id);

  // Approved leave covering today (→ "out").
  const leaves = await db.leaveRequest.findMany({
    where: {
      ownerId: { in: ids },
      status: "APPROVED",
      startDate: { lte: now },
      endDate: { gte: now },
    },
    select: { ownerId: true },
  });
  const onLeaveSet = new Set(leaves.map((l) => l.ownerId));

  // Open task load, scored exactly like Team Pulse.
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

  const loadAcc = new Map<string, { load: number; open: number }>();
  for (const id of ids) loadAcc.set(id, { load: 0, open: 0 });
  for (const a of assignments) {
    if (isDoneList(a.task.list.name)) continue;
    const e = loadAcc.get(a.userId)!;
    e.open += 1;
    let weight = W_BASE;
    if (a.task.priority === "HIGH") weight += W_HIGH - W_BASE;
    if (a.task.dueDate && a.task.dueDate < now) weight += W_OVERDUE;
    e.load += weight;
  }

  // Build flat nodes, then link children to parents.
  const nodeById = new Map<string, OrgNode>();
  for (const p of people) {
    const e = loadAcc.get(p.id)!;
    const onLeave = onLeaveSet.has(p.id);
    const load = Math.min(100, e.load);
    nodeById.set(p.id, {
      id: p.id,
      name: p.name,
      title: p.title,
      department: p.department,
      avatarUrl: p.avatarUrl,
      status: classify(onLeave, load),
      load,
      openTasks: e.open,
      onLeave,
      teamSize: 0,
      reports: [],
    });
  }

  const roots: OrgNode[] = [];
  for (const p of people) {
    const node = nodeById.get(p.id)!;
    const parent = p.managerId ? nodeById.get(p.managerId) : null;
    if (parent) parent.reports.push(node);
    else roots.push(node);
  }

  // Compute subtree sizes bottom-up (recursion; the tree is shallow in practice).
  const sizeOf = (node: OrgNode): number => {
    let total = 0;
    for (const r of node.reports) total += 1 + sizeOf(r);
    node.teamSize = total;
    return total;
  };
  roots.forEach(sizeOf);

  // Sort each level: biggest teams first, then name — stable, readable layout.
  const sortLevel = (nodes: OrgNode[]) => {
    nodes.sort((a, b) => b.teamSize - a.teamSize || a.name.localeCompare(b.name));
    nodes.forEach((n) => sortLevel(n.reports));
  };
  sortLevel(roots);

  return roots;
}
