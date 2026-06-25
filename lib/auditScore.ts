// ── Audit-action performance weighting ───────────────────────────────────────
// The Performance view scores everyone — QA, HR, engineers, finance — from the
// AuditLog, because that's the ONE place the portal records who-did-what across
// every department (not just the task board). This module is the judgement layer
// on top of that raw trail: which audited actions count as productive work, and
// how much each is worth.
//
// Client-safe (no server imports) so both the server aggregator and the client
// board can share the vocabulary and labels.

/** Coarse work categories, for the per-person breakdown + tinting. */
export type WorkCategory =
  | "delivery" // shipping/creating work — tasks, projects, sprints
  | "decision" // approvals/denials — leave, expense, invoices
  | "finance" // money — invoices, salary
  | "people" // HR/people ops — users, announcements, documents
  | "collab"; // lighter collaboration — comments, links, reactions

/**
 * Weight per audit action. Heavier = more substantial work.
 *   3 — substantive deliverable or decision
 *   2 — a meaningful progression
 *   1 — a small contribution
 * Any action NOT listed here scores 0 (excluded as noise): auth.*, *.sync,
 * impersonation, personal-account admin, and self-cleanup deletes. Excluding
 * them keeps the score about work, and stops "log in a lot" from inflating it.
 */
interface ActionMeta {
  weight: number;
  category: WorkCategory;
}

export const ACTION_WEIGHTS: Record<string, ActionMeta> = {
  // ── Delivery (tasks / projects / sprints) ──
  "task.create": { weight: 3, category: "delivery" },
  "task.move": { weight: 2, category: "delivery" },
  "task.update": { weight: 2, category: "delivery" },
  "task.assign": { weight: 2, category: "delivery" },
  "task.comment": { weight: 1, category: "collab" },
  "task.link": { weight: 1, category: "collab" },
  "task.unlink": { weight: 1, category: "collab" },
  "task.attachment_add": { weight: 1, category: "collab" },
  "project.create": { weight: 3, category: "delivery" },
  "project.update": { weight: 2, category: "delivery" },
  "project.list_create": { weight: 1, category: "delivery" },
  "project.list_move": { weight: 1, category: "delivery" },
  "project.member_add": { weight: 2, category: "people" },
  "project.income_add": { weight: 2, category: "finance" },
  "sprint.create": { weight: 2, category: "delivery" },
  "sprint.start": { weight: 2, category: "delivery" },
  "sprint.complete": { weight: 3, category: "delivery" },

  // ── Decisions (the heart of HR / manager / finance approval work) ──
  "leave.create": { weight: 1, category: "decision" },
  "leave.decide": { weight: 3, category: "decision" },
  "expense.create": { weight: 1, category: "finance" },
  "expense.decide": { weight: 3, category: "decision" },
  "expense.update": { weight: 1, category: "finance" },

  // ── Finance (invoices / salary) ──
  "invoice.create": { weight: 3, category: "finance" },
  "invoice.update": { weight: 1, category: "finance" },
  "invoice.paid": { weight: 2, category: "finance" },
  "invoice.status_change": { weight: 1, category: "finance" },
  "salary.create": { weight: 3, category: "finance" },
  "salary.payment_add": { weight: 2, category: "finance" },

  // ── People / comms (HR + leads) ──
  "user.create": { weight: 3, category: "people" },
  "user.profile_update": { weight: 1, category: "people" },
  "announcement.create": { weight: 3, category: "people" },
  "announcement.update": { weight: 1, category: "people" },
  "announcement.comment": { weight: 1, category: "collab" },
  "document.upload": { weight: 3, category: "people" },
  "document.create": { weight: 2, category: "people" },
  "document.update": { weight: 1, category: "people" },
  "integration.update": { weight: 1, category: "people" },
  "branding.update": { weight: 1, category: "people" },
};

export interface ScoredAction {
  weight: number;
  category: WorkCategory;
}

/** Weight + category for an action, or null if it doesn't count as work. */
export function scoreAction(action: string): ScoredAction | null {
  return ACTION_WEIGHTS[action] ?? null;
}

/** Display labels for the categories (used in the breakdown). */
export const CATEGORY_LABELS: Record<WorkCategory, string> = {
  delivery: "Delivery",
  decision: "Decisions",
  finance: "Finance",
  people: "People & comms",
  collab: "Collaboration",
};

export const ALL_CATEGORIES: WorkCategory[] = [
  "delivery",
  "decision",
  "finance",
  "people",
  "collab",
];
