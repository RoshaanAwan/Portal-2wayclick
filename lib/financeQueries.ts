import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "./db";
import type {
  ExpenseDTO,
  CanteenExpenseDTO,
  ProjectSalaryDTO,
  ProjectIncomeLineDTO,
  ProjectShareLineDTO,
  ProjectFinanceDTO,
  FinanceStatus,
} from "./finance";
import { computeSalaryPool, salaryTotalCents } from "./finance";

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

export function toCanteenDTO(c: {
  id: string;
  vendor: string;
  amountCents: number;
  currency: string;
  headcount: number;
  status: string;
  notes: string | null;
  mealDate: Date;
  slipUrl: string;
  slipName: string;
  slipSizeKb: number;
  submitterId: string | null;
  submitterName: string;
  reviewerName: string | null;
  decidedAt: Date | null;
  createdAt: Date;
}): CanteenExpenseDTO {
  return {
    id: c.id,
    vendor: c.vendor,
    amountCents: c.amountCents,
    currency: c.currency,
    headcount: c.headcount,
    status: c.status as FinanceStatus,
    notes: c.notes,
    mealDate: c.mealDate.toISOString(),
    slipUrl: c.slipUrl,
    slipName: c.slipName,
    slipSizeKb: c.slipSizeKb,
    submitterId: c.submitterId,
    submitterName: c.submitterName,
    reviewerName: c.reviewerName,
    decidedAt: c.decidedAt ? c.decidedAt.toISOString() : null,
    createdAt: c.createdAt.toISOString(),
  };
}

/** All canteen expenses, newest first, as DTOs. */
export async function listCanteenExpenses(): Promise<CanteenExpenseDTO[]> {
  const rows = await db.canteenExpense.findMany({
    orderBy: { createdAt: "desc" },
  });
  return rows.map(toCanteenDTO);
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
  salaries: {
    where: { active: true },
    select: { components: { select: { amountCents: true } } },
  },
} satisfies Prisma.ProjectInclude;

type ProjectFinanceRow = Prisma.ProjectGetPayload<{
  include: typeof projectFinanceInclude;
}>;

export function toProjectFinanceDTO(p: ProjectFinanceRow): ProjectFinanceDTO {
  const incomeLines = p.incomeLines.map(toIncomeLineDTO);
  const shareLines = p.shareLines.map(toShareLineDTO);
  const { sharedCents, poolCents } = computeSalaryPool(p.revenueCents, shareLines);
  // Payroll committed = sum of every active salary's component total.
  const committedCents = p.salaries.reduce(
    (sum, s) => sum + salaryTotalCents(s),
    0,
  );
  return {
    projectId: p.id,
    projectName: p.name,
    incomeLines,
    revenueCents: p.revenueCents,
    currency: p.revenueCurrency,
    shareLines,
    sharedCents,
    poolCents,
    committedCents,
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
