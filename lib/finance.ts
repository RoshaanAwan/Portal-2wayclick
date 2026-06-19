import { z } from "zod";
import { CURRENCIES } from "./invoices";

// ── Finance domain helpers ────────────────────────────────────────────────────
// Shared types, enums, money helpers, and validation for the finance module:
// general expenses and per-project monthly salaries. Money is integer minor units
// (cents) everywhere, exactly like lib/invoices.ts — never a float. formatMoney/
// toCents live there (the single source of money math); we re-export them so
// finance callers have one import.

export { formatMoney, toCents, CURRENCIES } from "./invoices";
export type { Currency } from "./invoices";

// ── Approval status ────────────────────────────────────────────────────────────
// Expenses ride a two-party workflow: a submitter raises a claim (PENDING) and a
// different Admin-tier user approves or rejects it.

export const FINANCE_STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;
export type FinanceStatus = (typeof FINANCE_STATUSES)[number];

export function isFinanceStatus(v: unknown): v is FinanceStatus {
  return (
    typeof v === "string" && (FINANCE_STATUSES as readonly string[]).includes(v)
  );
}

/** Label + badge variant per status (variants match components/ui/Badge). */
export const FINANCE_STATUS_META: Record<
  FinanceStatus,
  { label: string; badge: "amber" | "emerald" | "red" }
> = {
  PENDING: { label: "Pending", badge: "amber" },
  APPROVED: { label: "Approved", badge: "emerald" },
  REJECTED: { label: "Rejected", badge: "red" },
};

// ── Expense categories ─────────────────────────────────────────────────────────
// The kinds of expense a claim can fall under. Stored as a plain string on the
// row; validated against this list at write time.

export const EXPENSE_CATEGORIES = [
  "Travel",
  "Meals",
  "Supplies",
  "Software",
  "Hardware",
  "Utilities",
  "Marketing",
  "Training",
  "Other",
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

// ── Slip attachment ────────────────────────────────────────────────────────────
// A receipt/slip uploaded for an expense. Mirrors the Document upload return
// shape: a hosted (or data) URL plus name + size.

export interface SlipMeta {
  url: string;
  name: string;
  sizeKb: number;
}

const slipSchema = z
  .object({
    url: z.string().trim().min(1).max(5000),
    name: z.string().trim().min(1).max(200),
    sizeKb: z.number().int().min(0).max(50 * 1024),
  })
  .nullable()
  .optional();

// ── Validation (shared by the API routes) ──────────────────────────────────────

/** A user-entered amount in major units (e.g. "1250.50"), 0–10,000,000. */
const amountMajor = z.number().min(0).max(10_000_000);

export const expenseInputSchema = z.object({
  title: z.string().trim().min(1, "Title required").max(200),
  category: z.enum(EXPENSE_CATEGORIES),
  // Amount in MAJOR units; the route converts to cents with toCents.
  amount: amountMajor,
  currency: z.enum(CURRENCIES),
  // Optional project this expense is charged to.
  projectId: z.string().trim().min(1).optional().or(z.literal("")),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
  // ISO date (yyyy-mm-dd) the expense was incurred, or empty (defaults to today).
  spentOn: z.string().trim().optional().or(z.literal("")),
  // Optional receipt/slip.
  slip: slipSchema,
});
export type ExpenseInput = z.infer<typeof expenseInputSchema>;

export const decisionSchema = z.object({
  id: z.string().min(1),
  decision: z.enum(["APPROVED", "REJECTED"]),
});

// ── Salary components ───────────────────────────────────────────────────────────
// A salary is a list of named components (a label + an amount in MAJOR units).
// "Dev", "BD", and "Lead" are the suggested defaults, but an admin can rename,
// remove, or add custom ones ("QA", "Bonus", …). The route converts each amount
// to cents. The total is always the sum — never sent or stored separately.

/** The default component labels offered when composing a new salary. */
export const DEFAULT_SALARY_COMPONENTS = ["Dev", "BD", "Lead"] as const;

const salaryComponentInput = z.object({
  label: z.string().trim().min(1, "Component name required").max(40),
  amount: amountMajor,
  // Optional Excel-style formula in canonical label form ("={Dev}*1.1"). When
  // present, `amount` is its client-evaluated result (the server re-checks it).
  formula: z.string().trim().max(256).optional(),
});

export const salaryInputSchema = z
  .object({
    projectId: z.string().trim().min(1, "Project required"),
    // A salary is EITHER for a real employee (userId) OR a free-text name
    // (userName, no userId). Exactly one of the two identifies the row; the
    // refine below enforces that at least one is present.
    userId: z.string().trim().min(1).optional(),
    userName: z.string().trim().min(1).max(120).optional(),
    // At least one component, each with a positive total across the list.
    components: z
      .array(salaryComponentInput)
      .min(1, "Add at least one component"),
    currency: z.enum(CURRENCIES),
    // ISO date the salary takes effect, or empty (defaults to today).
    effectiveFrom: z.string().trim().optional().or(z.literal("")),
  })
  .refine((v) => !!v.userId || !!v.userName, {
    message: "Employee required",
    path: ["userId"],
  });
export type SalaryInput = z.infer<typeof salaryInputSchema>;

/** Total monthly salary = sum of its component amounts. Single source of truth. */
export function salaryTotalCents(s: {
  components: { amountCents: number }[];
}): number {
  return s.components.reduce((sum, c) => sum + c.amountCents, 0);
}

// ── Project income ──────────────────────────────────────────────────────────────
// A project's income is a list of named lines (milestones, retainers, …). Each is
// a label + an amount in MAJOR units; the route converts to cents. The project's
// total revenue is the sum of its lines — and that total is what the share lines
// and salary pool are computed from. The project currency is set alongside.

export const incomeLineInputSchema = z.object({
  projectId: z.string().trim().min(1, "Project required"),
  label: z.string().trim().min(1, "Name required").max(80),
  amount: amountMajor,
  // The project currency. Set on every income line so the first line establishes
  // it; later lines may re-set it (the route updates the project's currency).
  currency: z.enum(CURRENCIES),
});
export type IncomeLineInput = z.infer<typeof incomeLineInputSchema>;

// ── Project share lines ─────────────────────────────────────────────────────────
// Named amounts carved out of revenue before payroll. A line is EITHER a percent
// of revenue (basis points) OR a fixed amount — the input takes one `kind` and a
// single `value`, and the route stores it in the matching column.

const PERCENT_MAX_BPS = 1_000_000; // 10,000% — a generous upper bound.

export const shareLineInputSchema = z.object({
  projectId: z.string().trim().min(1, "Project required"),
  label: z.string().trim().min(1, "Name required").max(60),
  kind: z.enum(["PERCENT", "FIXED"]),
  // For PERCENT: a human percent (e.g. 40 → 40%). For FIXED: major units.
  value: z.number().min(0).max(10_000_000),
});
export type ShareLineInput = z.infer<typeof shareLineInputSchema>;

/** A share line as stored: exactly one of percentBps / amountCents is set. */
export interface ShareLine {
  label: string;
  percentBps: number | null;
  amountCents: number | null;
}

/** Human percent (40) → basis points (4000), clamped to a sane range. */
export function percentToBps(percent: number): number {
  return Math.min(Math.max(Math.round(percent * 100), 0), PERCENT_MAX_BPS);
}

/** Basis points (4000) → human percent string ("40%"). */
export function formatPercentBps(bps: number): string {
  return `${(bps / 100).toFixed(2).replace(/\.?0+$/, "")}%`;
}

/** Resolve one share line against a revenue figure to a concrete cents amount. */
export function resolveShareLine(line: ShareLine, revenueCents: number): number {
  if (line.percentBps != null) {
    return Math.round((revenueCents * line.percentBps) / 10_000);
  }
  return line.amountCents ?? 0;
}

// ── Salary pool ─────────────────────────────────────────────────────────────────
// What's left of a project's revenue after every share line is taken out — the
// money available to pay salaries from. Clamped at 0 (shares can't go negative
// pool). `committedCents` (sum of active salaries) is compared against it to
// show whether payroll fits the pool.

export interface SalaryPool {
  revenueCents: number;
  sharedCents: number; // total carved out by share lines
  poolCents: number; // revenue − shared, floored at 0
}

export function computeSalaryPool(
  revenueCents: number,
  lines: ShareLine[],
): SalaryPool {
  const sharedCents = lines.reduce(
    (sum, l) => sum + resolveShareLine(l, revenueCents),
    0,
  );
  return {
    revenueCents,
    sharedCents,
    poolCents: Math.max(0, revenueCents - sharedCents),
  };
}

// ── DTOs shared between server pages and client components ──────────────────────

export interface ExpenseDTO {
  id: string;
  title: string;
  category: string;
  amountCents: number;
  currency: string;
  status: FinanceStatus;
  notes: string | null;
  spentOn: string;
  slipUrl: string | null;
  slipName: string | null;
  slipSizeKb: number | null;
  projectId: string | null;
  projectName: string | null;
  submitterId: string | null;
  submitterName: string;
  reviewerName: string | null;
  decidedAt: string | null;
  createdAt: string;
}

export interface SalaryComponentDTO {
  id: string;
  label: string;
  amountCents: number;
  // Canonical formula ("={Dev}*1.1") if this cell is a formula, else null.
  formula: string | null;
}

export interface SalaryPaymentDTO {
  id: string;
  amountCents: number;
  paidOn: string; // ISO date
  note: string | null;
}

export interface ProjectSalaryDTO {
  id: string;
  projectId: string;
  projectName: string;
  userId: string | null;
  userName: string;
  userTitle: string | null;
  // Named components (ordered). Total = sum of amounts (use salaryTotalCents).
  components: SalaryComponentDTO[];
  currency: string;
  active: boolean;
  effectiveFrom: string;
  createdAt: string;
  // Payment log (newest first) + derived paid / remaining against the total.
  payments: SalaryPaymentDTO[];
  paidCents: number;
  remainingCents: number;
}

export interface ProjectIncomeLineDTO {
  id: string;
  label: string;
  amountCents: number;
}

export interface ProjectShareLineDTO {
  id: string;
  label: string;
  percentBps: number | null;
  amountCents: number | null;
}

/** A project's finance summary: income, revenue, share lines, and salary pool. */
export interface ProjectFinanceDTO {
  projectId: string;
  projectName: string;
  // The income lines and their sum (= revenueCents, the cached project total).
  incomeLines: ProjectIncomeLineDTO[];
  revenueCents: number;
  currency: string;
  shareLines: ProjectShareLineDTO[];
  // Derived (computeSalaryPool): what's carved out and what's left for payroll.
  sharedCents: number;
  poolCents: number;
  // Sum of this project's ACTIVE salary totals (payroll committed against pool).
  committedCents: number;
}
