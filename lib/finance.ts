import { z } from "zod";
import { CURRENCIES } from "./invoices";

// ── Finance domain helpers ────────────────────────────────────────────────────
// Shared types, enums, money helpers, and validation for the finance module:
// general expenses, canteen expenses, and per-project monthly salaries. Money is
// integer minor units (cents) everywhere, exactly like lib/invoices.ts — never a
// float. formatMoney/toCents live there (the single source of money math); we
// re-export them so finance callers have one import.

export { formatMoney, toCents, CURRENCIES } from "./invoices";
export type { Currency } from "./invoices";

// ── Approval status ────────────────────────────────────────────────────────────
// Both expenses and canteen expenses ride the same workflow: a submitter raises a
// claim (PENDING) and a different Admin-tier user approves or rejects it.

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
// The kinds of general (non-canteen) expense a claim can fall under. Stored as a
// plain string on the row; validated against this list at write time.

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
// A receipt/slip uploaded for an expense (general or canteen). Mirrors the
// Document upload return shape: a hosted (or data) URL plus name + size.

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

export const canteenInputSchema = z.object({
  vendor: z.string().trim().min(1, "Vendor required").max(200),
  amount: amountMajor,
  currency: z.enum(CURRENCIES),
  // How many people the meal covered (≥1).
  headcount: z.number().int().min(1, "Headcount must be at least 1").max(10_000),
  // ISO date (yyyy-mm-dd) the meal happened, or empty (defaults to today).
  mealDate: z.string().trim().optional().or(z.literal("")),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
  // The slip is REQUIRED for canteen expenses.
  slip: z.object({
    url: z.string().trim().min(1).max(5000),
    name: z.string().trim().min(1).max(200),
    sizeKb: z.number().int().min(0).max(50 * 1024),
  }),
});
export type CanteenInput = z.infer<typeof canteenInputSchema>;

export const decisionSchema = z.object({
  id: z.string().min(1),
  decision: z.enum(["APPROVED", "REJECTED"]),
});

export const salaryInputSchema = z.object({
  projectId: z.string().trim().min(1, "Project required"),
  userId: z.string().trim().min(1, "Employee required"),
  // Monthly salary in MAJOR units; the route converts to cents.
  amount: amountMajor,
  currency: z.enum(CURRENCIES),
  // ISO date the salary takes effect, or empty (defaults to today).
  effectiveFrom: z.string().trim().optional().or(z.literal("")),
});
export type SalaryInput = z.infer<typeof salaryInputSchema>;

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

export interface CanteenExpenseDTO {
  id: string;
  vendor: string;
  amountCents: number;
  currency: string;
  headcount: number;
  status: FinanceStatus;
  notes: string | null;
  mealDate: string;
  slipUrl: string;
  slipName: string;
  slipSizeKb: number;
  submitterId: string | null;
  submitterName: string;
  reviewerName: string | null;
  decidedAt: string | null;
  createdAt: string;
}

export interface ProjectSalaryDTO {
  id: string;
  projectId: string;
  projectName: string;
  userId: string | null;
  userName: string;
  userTitle: string | null;
  amountCents: number;
  currency: string;
  active: boolean;
  effectiveFrom: string;
  createdAt: string;
}
