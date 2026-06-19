import { z } from "zod";
import { CURRENCIES } from "./invoices";

// ── Per-user monthly salary, allocated across projects ───────────────────────────
// The salary model: each user has ONE total monthly salary (totalCents), and that
// total is split across the projects they work on via allocation lines. Each line
// is EITHER a percent of the total (percentBps) OR a fixed amount (amountCents) —
// exactly one is set, mirroring ProjectShareLine. Allocations are informational
// and need NOT sum to the total; the UI surfaces any unallocated remainder.
// Money is integer minor units (cents) everywhere; reuse the finance helpers.

export { formatMoney, toCents, CURRENCIES } from "./invoices";
export type { Currency } from "./invoices";
export { percentToBps, formatPercentBps } from "./finance";

const PERCENT_MAX_BPS = 1_000_000; // 10,000%, a generous bound (matches finance)
const amountMajor = z.number().min(0).max(10_000_000);

// ── Validation ──────────────────────────────────────────────────────────────────

export const allocationInputSchema = z.object({
  projectId: z.string().trim().min(1, "Project required"),
  kind: z.enum(["PERCENT", "FIXED"]),
  // PERCENT: a human percent (40 → 40%). FIXED: major units (converted to cents).
  value: z.number().min(0).max(10_000_000),
});
export type AllocationInput = z.infer<typeof allocationInputSchema>;

export const userSalaryInputSchema = z.object({
  userId: z.string().trim().min(1, "User required"),
  // The user's total monthly salary, in MAJOR units.
  total: amountMajor,
  currency: z.enum(CURRENCIES),
  // Allocation lines (may be empty, may under/over-allocate). A project appears
  // at most once — the route de-dupes / the DB enforces (salaryId, projectId).
  allocations: z.array(allocationInputSchema).max(200).default([]),
  // ISO date the salary takes effect, or empty (defaults to today).
  effectiveFrom: z.string().trim().optional().or(z.literal("")),
});
export type UserSalaryInput = z.infer<typeof userSalaryInputSchema>;

// ── Allocation resolution ───────────────────────────────────────────────────────

/** A stored allocation: exactly one of percentBps / amountCents is set. */
export interface Allocation {
  percentBps: number | null;
  amountCents: number | null;
}

/** Human percent (40) → basis points (4000), clamped. */
export function percentToBpsClamped(percent: number): number {
  return Math.min(Math.max(Math.round(percent * 100), 0), PERCENT_MAX_BPS);
}

/** Resolve one allocation line against the user's total to concrete cents. */
export function resolveAllocation(a: Allocation, totalCents: number): number {
  if (a.percentBps != null) {
    return Math.round((totalCents * a.percentBps) / 10_000);
  }
  return a.amountCents ?? 0;
}

/** Sum of all allocations' resolved cents (what's been carved out of the total). */
export function allocatedCents(
  allocations: Allocation[],
  totalCents: number,
): number {
  return allocations.reduce((sum, a) => sum + resolveAllocation(a, totalCents), 0);
}

// ── DTOs shared between the server page and client components ────────────────────

export interface SalaryAllocationDTO {
  id: string;
  projectId: string;
  projectName: string;
  percentBps: number | null;
  amountCents: number | null;
  // Resolved cents against the salary's total (convenience for the client).
  resolvedCents: number;
}

export interface UserSalaryDTO {
  id: string;
  userId: string;
  userName: string;
  userTitle: string | null;
  totalCents: number;
  currency: string;
  active: boolean;
  effectiveFrom: string;
  allocations: SalaryAllocationDTO[];
  // Derived: sum of allocations and what's left (total − allocated; may be < 0).
  allocatedCents: number;
  unallocatedCents: number;
}

/** A user row for the page, with their salary if one exists. */
export interface SalariedUserDTO {
  userId: string;
  userName: string;
  userTitle: string | null;
  salary: UserSalaryDTO | null;
}

/** One person's contribution to a project's salary cost. */
export interface ProjectContributorDTO {
  userId: string;
  userName: string;
  cents: number;
}

/** What a project spends on salaries = sum of everyone's allocation to it. */
export interface ProjectSalaryCostDTO {
  projectId: string;
  projectName: string;
  currency: string;
  totalCents: number;
  contributors: ProjectContributorDTO[];
}
