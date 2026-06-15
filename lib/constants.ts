// Shared domain constants. SQLite has no native enums, so these string
// unions are the source of truth across the app.

export const ROLES = ["ADMIN", "MANAGER", "EMPLOYEE"] as const;
export type Role = (typeof ROLES)[number];

export const REQUEST_STATUSES = ["PENDING", "APPROVED", "DENIED"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const LEAVE_TYPES = ["Vacation", "Sick", "Personal", "WFH"] as const;
export type LeaveType = (typeof LEAVE_TYPES)[number];

export const ANNOUNCEMENT_CATEGORIES = [
  "General",
  "Product",
  "People",
  "Policy",
  "Event",
] as const;

export const DOC_CATEGORIES = [
  "HR",
  "Engineering",
  "Finance",
  "Legal",
  "Brand",
  "General",
] as const;

export const DEPARTMENTS = [
  "Executive",
  "Engineering",
  "People",
  "Design",
  "Marketing",
  "Data",
  "Finance",
  "Sales",
] as const;

export const statusVariant: Record<RequestStatus, "amber" | "emerald" | "red"> = {
  PENDING: "amber",
  APPROVED: "emerald",
  DENIED: "red",
};

// ── Task board ──────────────────────────────────────────────────────────────

export const TASK_PRIORITIES = ["LOW", "MEDIUM", "HIGH"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const priorityVariant: Record<
  TaskPriority,
  "neutral" | "amber" | "red"
> = {
  LOW: "neutral",
  MEDIUM: "amber",
  HIGH: "red",
};

export const priorityLabel: Record<TaskPriority, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
};
