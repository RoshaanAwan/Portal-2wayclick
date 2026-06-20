// Shared domain constants. Postgres has no enum requirement here, so these
// string unions are the source of truth across the app.

// Roles & role-based permissions live in lib/permissions.ts; re-export the
// role list/type here so existing imports from "@/lib/constants" keep working.
export { ROLES, ROLE_LABELS, type Role } from "./permissions";

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

// ── JIRA-like issues ────────────────────────────────────────────────────────
// The card (Task) is the "issue". These string unions are the source of truth
// for its type, workflow status, links, and sprint state — mirroring the
// Postgres-no-enum convention above. Display helpers live alongside; the
// workflow rules (which status follows which list, allowed transitions) live in
// lib/issues.ts since they need both the list names and these constants.

export const ISSUE_TYPES = ["STORY", "BUG", "TASK", "EPIC", "SUBTASK"] as const;
export type IssueType = (typeof ISSUE_TYPES)[number];

export const issueTypeLabel: Record<IssueType, string> = {
  STORY: "Story",
  BUG: "Bug",
  TASK: "Task",
  EPIC: "Epic",
  SUBTASK: "Subtask",
};

// Workflow lifecycle. Kept in lock-step with the board's Kanban columns:
// statusForList (lib/issues.ts) maps a list name → status on every move, and
// the board groups by list while filters group by status.
export const WORKFLOW_STATUSES = [
  "TODO",
  "IN_PROGRESS",
  "IN_REVIEW",
  "DONE",
] as const;
export type WorkflowStatus = (typeof WORKFLOW_STATUSES)[number];

export const statusLabel: Record<WorkflowStatus, string> = {
  TODO: "To Do",
  IN_PROGRESS: "In Progress",
  IN_REVIEW: "In Review",
  DONE: "Done",
};

export const statusBadge: Record<
  WorkflowStatus,
  "neutral" | "accent" | "amber" | "emerald"
> = {
  TODO: "neutral",
  IN_PROGRESS: "accent",
  IN_REVIEW: "amber",
  DONE: "emerald",
};

// Directed issue-link relationships. `inward` is how the *target* card reads the
// link ("is blocked by"), `outward` how the *source* reads it ("blocks").
export const ISSUE_LINK_TYPES = [
  "BLOCKS",
  "RELATES",
  "DUPLICATES",
  "PARENT",
] as const;
export type IssueLinkType = (typeof ISSUE_LINK_TYPES)[number];

export const issueLinkPhrasing: Record<
  IssueLinkType,
  { outward: string; inward: string }
> = {
  BLOCKS: { outward: "blocks", inward: "is blocked by" },
  RELATES: { outward: "relates to", inward: "relates to" },
  DUPLICATES: { outward: "duplicates", inward: "is duplicated by" },
  PARENT: { outward: "is parent of", inward: "is child of" },
};

export const SPRINT_STATUSES = ["PLANNED", "ACTIVE", "COMPLETED"] as const;
export type SprintStatus = (typeof SPRINT_STATUSES)[number];

// Story-point options offered in the estimate picker (a Fibonacci scale, the
// JIRA default). Stored as a plain Int on the card, so any value is accepted by
// the API — these just drive the picker.
export const STORY_POINT_OPTIONS = [1, 2, 3, 5, 8, 13, 21] as const;
