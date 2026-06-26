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
// These labels are ALSO the access gate: a plan's chosen features determine which
// modules its tenant may use. The mapping from feature key → modules/routes, and
// the actual enforcement (sidebar filtering + page guards), live in
// lib/entitlements.ts. Seat caps / suspension still live in lib/billing.ts.

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

// label → stable key, so persisted Plan.features (labels) can be resolved back to
// feature keys for entitlement checks (see lib/entitlements.ts).
const LABEL_TO_KEY = new Map(PLAN_FEATURES.map((f) => [f.label, f.key]));

/** Resolve persisted feature LABELS to their stable feature KEYS (catalog order). */
export function featureKeysFromLabels(features: string[]): string[] {
  const chosen = new Set(
    features.map((f) => LABEL_TO_KEY.get(f)).filter((k): k is string => !!k),
  );
  return PLAN_FEATURES.filter((f) => chosen.has(f.key)).map((f) => f.key);
}

/**
 * Keep only labels that are still in the catalog, de-duplicated, in catalog
 * order. Tolerant of legacy free-text features saved before the checkbox list —
 * unknown strings are dropped on the next save but don't error.
 */
export function sanitizePlanFeatures(features: string[]): string[] {
  const chosen = new Set(features.filter((f) => VALID_LABELS.has(f)));
  return PLAN_FEATURES.filter((f) => chosen.has(f.label)).map((f) => f.label);
}
