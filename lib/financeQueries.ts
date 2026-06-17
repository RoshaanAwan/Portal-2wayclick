import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "./db";
import type {
  ExpenseDTO,
  CanteenExpenseDTO,
  ProjectSalaryDTO,
  FinanceStatus,
} from "./finance";

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
} satisfies Prisma.ProjectSalaryInclude;

type SalaryRow = Prisma.ProjectSalaryGetPayload<{ include: typeof salaryInclude }>;

export function toSalaryDTO(s: SalaryRow): ProjectSalaryDTO {
  return {
    id: s.id,
    projectId: s.projectId,
    projectName: s.project.name,
    userId: s.userId,
    userName: s.userName,
    userTitle: s.user?.title ?? null,
    amountCents: s.amountCents,
    currency: s.currency,
    active: s.active,
    effectiveFrom: s.effectiveFrom.toISOString(),
    createdAt: s.createdAt.toISOString(),
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
