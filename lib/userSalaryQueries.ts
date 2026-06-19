import "server-only";
import { db } from "./db";
import {
  resolveAllocation,
  allocatedCents,
  type UserSalaryDTO,
  type SalariedUserDTO,
  type ProjectSalaryCostDTO,
} from "./userSalary";

// ── Per-user salary read helpers ─────────────────────────────────────────────────
// Server-only queries + Prisma→DTO serializers for the payroll (per-user salary)
// page. One UserSalary per user; allocations split the total across projects.

const salaryInclude = {
  user: { select: { name: true, title: true } },
  allocations: {
    orderBy: { position: "asc" as const },
    include: { project: { select: { name: true } } },
  },
};

type SalaryRow = {
  id: string;
  userId: string;
  totalCents: number;
  currency: string;
  active: boolean;
  effectiveFrom: Date;
  user: { name: string; title: string | null };
  allocations: {
    id: string;
    projectId: string;
    percentBps: number | null;
    amountCents: number | null;
    project: { name: string };
  }[];
};

function toUserSalaryDTO(s: SalaryRow): UserSalaryDTO {
  const allocations = s.allocations.map((a) => ({
    id: a.id,
    projectId: a.projectId,
    projectName: a.project.name,
    percentBps: a.percentBps,
    amountCents: a.amountCents,
    resolvedCents: resolveAllocation(
      { percentBps: a.percentBps, amountCents: a.amountCents },
      s.totalCents,
    ),
  }));
  const allocated = allocatedCents(
    allocations.map((a) => ({
      percentBps: a.percentBps,
      amountCents: a.amountCents,
    })),
    s.totalCents,
  );
  return {
    id: s.id,
    userId: s.userId,
    userName: s.user.name,
    userTitle: s.user.title,
    totalCents: s.totalCents,
    currency: s.currency,
    active: s.active,
    effectiveFrom: s.effectiveFrom.toISOString(),
    allocations,
    allocatedCents: allocated,
    unallocatedCents: s.totalCents - allocated,
  };
}

/**
 * Every user, each with their monthly salary (if set). Drives the payroll page,
 * where you can set a salary for any user. Ordered by name.
 */
export async function listSalariedUsers(): Promise<SalariedUserDTO[]> {
  const [users, salaries] = await Promise.all([
    db.user.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, title: true },
    }),
    db.userSalary.findMany({ include: salaryInclude }),
  ]);

  const byUser = new Map<string, SalaryRow>();
  for (const s of salaries) byUser.set(s.userId, s as unknown as SalaryRow);

  return users.map((u) => {
    const row = byUser.get(u.id);
    return {
      userId: u.id,
      userName: u.name,
      userTitle: u.title,
      salary: row ? toUserSalaryDTO(row) : null,
    };
  });
}

/**
 * Project-cost rollup: what each project spends on salaries = the sum of every
 * person's ALLOCATION to it (resolved against their total). Unallocated salary
 * counts toward no project. All salaries count (active or not). Projects with no
 * allocations are omitted. Currency is taken from the contributing salaries (one
 * org currency in practice); the first-seen currency labels each project.
 */
export async function listProjectSalaryCosts(): Promise<ProjectSalaryCostDTO[]> {
  const salaries = await db.userSalary.findMany({ include: salaryInclude });

  // projectId → { name, currency, total, contributors[] }
  const byProject = new Map<
    string,
    {
      projectName: string;
      currency: string;
      totalCents: number;
      contributors: { userId: string; userName: string; cents: number }[];
    }
  >();

  for (const raw of salaries) {
    const s = raw as unknown as SalaryRow;
    for (const a of s.allocations) {
      const cents = resolveAllocation(
        { percentBps: a.percentBps, amountCents: a.amountCents },
        s.totalCents,
      );
      if (cents <= 0) continue;
      const entry = byProject.get(a.projectId) ?? {
        projectName: a.project.name,
        currency: s.currency,
        totalCents: 0,
        contributors: [],
      };
      entry.totalCents += cents;
      entry.contributors.push({
        userId: s.userId,
        userName: s.user.name,
        cents,
      });
      byProject.set(a.projectId, entry);
    }
  }

  return [...byProject.entries()]
    .map(([projectId, e]) => ({
      projectId,
      projectName: e.projectName,
      currency: e.currency,
      totalCents: e.totalCents,
      // Biggest contributors first.
      contributors: e.contributors.sort((a, b) => b.cents - a.cents),
    }))
    .sort((a, b) => b.totalCents - a.totalCents); // costliest project first
}
