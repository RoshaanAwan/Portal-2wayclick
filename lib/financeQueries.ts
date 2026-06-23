import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "./db";
import type {
  ExpenseDTO,
  ProjectSalaryDTO,
  ProjectIncomeLineDTO,
  ProjectShareLineDTO,
  ProjectFinanceDTO,
  FinanceStatus,
} from "./finance";
import { computeSalaryPool } from "./finance";

// ── Finance read helpers ──────────────────────────────────────────────────────
// Server-only queries + the Prisma→DTO serializers used by the finance pages.
// Keeping serialization here (not in each page) means the wire shape stays
// identical everywhere — same approach as lib/invoiceQueries.ts.

const expenseInclude = {
  project: { select: { name: true } },
} satisfies Prisma.ExpenseInclude;

type ExpenseRow = Prisma.ExpenseGetPayload<{ include: typeof expenseInclude }>;

export function toExpenseDTO(e: ExpenseRow): ExpenseDTO {
  return {
    id: e.id,
    title: e.title,
    category: e.category,
    amountCents: e.amountCents,
    currency: e.currency,
    status: e.status as FinanceStatus,
    notes: e.notes,
    spentOn: e.spentOn.toISOString(),
    slipUrl: e.slipUrl,
    slipName: e.slipName,
    slipSizeKb: e.slipSizeKb,
    projectId: e.projectId,
    projectName: e.project?.name ?? null,
    submitterId: e.submitterId,
    submitterName: e.submitterName,
    reviewerName: e.reviewerName,
    decidedAt: e.decidedAt ? e.decidedAt.toISOString() : null,
    createdAt: e.createdAt.toISOString(),
  };
}

/** All expenses, newest first, as DTOs. */
export async function listExpenses(): Promise<ExpenseDTO[]> {
  const rows = await db.expense.findMany({
    orderBy: { createdAt: "desc" },
    include: expenseInclude,
  });
  return rows.map(toExpenseDTO);
}

const salaryInclude = {
  project: { select: { name: true } },
  user: { select: { title: true } },
  components: { orderBy: { position: "asc" } },
  payments: { orderBy: { paidOn: "desc" } },
} satisfies Prisma.ProjectSalaryInclude;

type SalaryRow = Prisma.ProjectSalaryGetPayload<{ include: typeof salaryInclude }>;

export function toSalaryDTO(s: SalaryRow): ProjectSalaryDTO {
  const totalCents = s.components.reduce((sum, c) => sum + c.amountCents, 0);
  const paidCents = s.payments.reduce((sum, p) => sum + p.amountCents, 0);
  return {
    id: s.id,
    projectId: s.projectId,
    projectName: s.project.name,
    userId: s.userId,
    userName: s.userName,
    userTitle: s.user?.title ?? null,
    components: s.components.map((c) => ({
      id: c.id,
      label: c.label,
      amountCents: c.amountCents,
      formula: c.formula ?? null,
    })),
    currency: s.currency,
    active: s.active,
    effectiveFrom: s.effectiveFrom.toISOString(),
    createdAt: s.createdAt.toISOString(),
    payments: s.payments.map((p) => ({
      id: p.id,
      amountCents: p.amountCents,
      paidOn: p.paidOn.toISOString(),
      note: p.note ?? null,
    })),
    paidCents,
    // Remaining = salary total − paid. May go negative (overpaid); UI flags it.
    remainingCents: totalCents - paidCents,
  };
}

/** All project salaries, grouped-friendly order (by project, then name). */
export async function listProjectSalaries(): Promise<ProjectSalaryDTO[]> {
  const rows = await db.projectSalary.findMany({
    orderBy: [{ project: { name: "asc" } }, { userName: "asc" }],
    include: salaryInclude,
  });
  return rows.map(toSalaryDTO);
}

// ── Project finance: income → revenue → share lines → salary pool ──────────────

function toIncomeLineDTO(l: {
  id: string;
  label: string;
  amountCents: number;
}): ProjectIncomeLineDTO {
  return { id: l.id, label: l.label, amountCents: l.amountCents };
}

function toShareLineDTO(l: {
  id: string;
  label: string;
  percentBps: number | null;
  amountCents: number | null;
}): ProjectShareLineDTO {
  return {
    id: l.id,
    label: l.label,
    percentBps: l.percentBps,
    amountCents: l.amountCents,
  };
}

const projectFinanceInclude = {
  incomeLines: { orderBy: { position: "asc" } },
  shareLines: { orderBy: { position: "asc" } },
  // committedCents (payroll total) is a CACHED column on Project — recomputed on
  // every salary/component write by recomputeProjectCommitted — so the read no
  // longer hydrates every active salary's components into Node just to sum them.
  // This keeps the finance read O(projects) regardless of headcount.
} satisfies Prisma.ProjectInclude;

type ProjectFinanceRow = Prisma.ProjectGetPayload<{
  include: typeof projectFinanceInclude;
}>;

export function toProjectFinanceDTO(p: ProjectFinanceRow): ProjectFinanceDTO {
  const incomeLines = p.incomeLines.map(toIncomeLineDTO);
  const shareLines = p.shareLines.map(toShareLineDTO);
  const { sharedCents, poolCents } = computeSalaryPool(p.revenueCents, shareLines);
  return {
    projectId: p.id,
    projectName: p.name,
    incomeLines,
    revenueCents: p.revenueCents,
    currency: p.revenueCurrency,
    shareLines,
    sharedCents,
    poolCents,
    committedCents: p.committedCents,
  };
}

/**
 * Recompute and persist Project.revenueCents as the sum of its income lines.
 * Call after any income line is added or removed so the cached total (which all
 * the share/pool math reads) stays in sync. Returns the new total.
 */
export async function recomputeProjectRevenue(
  projectId: string,
): Promise<number> {
  const agg = await db.projectIncomeLine.aggregate({
    where: { projectId },
    _sum: { amountCents: true },
  });
  const revenueCents = agg._sum.amountCents ?? 0;
  await db.project.update({ where: { id: projectId }, data: { revenueCents } });
  return revenueCents;
}

/**
 * Recompute and persist Project.committedCents as the sum of every ACTIVE
 * salary's component total for the project. Call after any salary/component is
 * created, edited, (de)activated, or deleted so the cached payroll total (read
 * by every finance page) stays in sync — mirrors recomputeProjectRevenue.
 *
 * The sum is done in Postgres (no salary/component rows hydrated into Node),
 * keeping this cheap and flat regardless of headcount. Returns the new total.
 */
export async function recomputeProjectCommitted(
  projectId: string,
): Promise<number> {
  const rows = await db.$queryRaw<{ cents: bigint }[]>`
    SELECT COALESCE(SUM(c."amountCents"), 0) AS cents
    FROM "ProjectSalary" s
    JOIN "SalaryComponent" c ON c."salaryId" = s.id
    WHERE s.active = true AND s."projectId" = ${projectId}
  `;
  const committedCents = Number(rows[0]?.cents ?? 0);
  await db.project.update({
    where: { id: projectId },
    data: { committedCents },
  });
  return committedCents;
}

/** Finance summary (revenue, shares, pool, committed payroll) for one project. */
export async function getProjectFinance(
  projectId: string,
): Promise<ProjectFinanceDTO | null> {
  const p = await db.project.findUnique({
    where: { id: projectId },
    include: projectFinanceInclude,
  });
  return p ? toProjectFinanceDTO(p) : null;
}

/** Finance summary for every project (for the salaries page roll-up). */
export async function listProjectFinances(): Promise<ProjectFinanceDTO[]> {
  const rows = await db.project.findMany({
    orderBy: { name: "asc" },
    include: projectFinanceInclude,
  });
  return rows.map(toProjectFinanceDTO);
}
