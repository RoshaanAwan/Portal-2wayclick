// ── Plan feature catalog ──────────────────────────────────────────────────────
// The curated set of feature options a System Owner can include in a Plan. Shown
// as a checkbox list on the plan create/edit form (instead of free text), and
// rendered back as the plan's bullet list on the tenant billing page.
//
// We persist the human LABEL strings (not keys) in the existing Plan.features
// Json column so nothing downstream (billing page, plan cards) needs to change —
// they already render features as a string[]. Keep this list curated: adding an
// entry here is all it takes for it to appear as a new checkbox.
//
// This is a marketing/positioning list — what the plan advertises. It is NOT an
// access-control gate; entitlement enforcement (seat caps, suspension) lives in
// lib/billing.ts. Treat these as descriptive copy.

export interface PlanFeatureOption {
  /** Stable identifier (for keys / future entitlement wiring); not persisted. */
  key: string;
  /** The label persisted into Plan.features and shown to tenants. */
  label: string;
}

export const PLAN_FEATURES: readonly PlanFeatureOption[] = [
  { key: "projects", label: "Unlimited projects" },
  { key: "tasks", label: "Tasks & issue tracking" },
  { key: "finance", label: "Finance (expenses, salary, canteen)" },
  { key: "attendance", label: "Attendance & leave tracking" },
  { key: "performance", label: "Performance & team pulse" },
  { key: "ai", label: "AI assistant" },
  { key: "chat", label: "Team chat & messaging" },
  { key: "integrations", label: "Third-party integrations" },
  { key: "branding", label: "Custom branding (white-label)" },
  { key: "priority-support", label: "Priority support" },
  { key: "advanced-analytics", label: "Advanced analytics" },
] as const;

const VALID_LABELS = new Set(PLAN_FEATURES.map((f) => f.label));

/**
 * Keep only labels that are still in the catalog, de-duplicated, in catalog
 * order. Tolerant of legacy free-text features saved before the checkbox list —
 * unknown strings are dropped on the next save but don't error.
 */
export function sanitizePlanFeatures(features: string[]): string[] {
  const chosen = new Set(features.filter((f) => VALID_LABELS.has(f)));
  return PLAN_FEATURES.filter((f) => chosen.has(f.label)).map((f) => f.label);
}
