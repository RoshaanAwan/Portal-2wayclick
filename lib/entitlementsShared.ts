import { featureKeysFromLabels } from "./planFeatures";

// ── Plan entitlements (PURE / isomorphic) ─────────────────────────────────────
// The route map + pure decision logic, with NO server-only or DB imports, so it
// can be used from both the server (lib/entitlements.ts) and client components
// (components/Sidebar.tsx). The DB-backed resolver + page guard live in the
// server-only lib/entitlements.ts.

/**
 * Feature key → the route prefixes that feature unlocks. A request path is gated
 * only if it matches a prefix here AND the tenant's plan omits that key. Keys not
 * listed here are advertise-only (e.g. "priority-support") and gate no routes.
 */
export const FEATURE_ROUTES: Record<string, string[]> = {
  projects: ["/projects"],
  tasks: ["/tasks"],
  finance: ["/expenses", "/salaries", "/canteen", "/invoices"],
  attendance: ["/attendance", "/requests"],
  performance: ["/performance", "/pulse"],
  ai: [], // the floating assistant widget, gated in the layout (no route)
  chat: ["/messages"],
  integrations: ["/tools", "/admin/integrations"],
  branding: ["/admin/branding"],
};

/** All keys that actually control routes — used to decide if a path is gateable. */
const GATEABLE_KEYS = Object.keys(FEATURE_ROUTES).filter(
  (k) => FEATURE_ROUTES[k].length > 0,
);

export interface Entitlements {
  /** True when no plan restricts anything (allow-all). */
  unrestricted: boolean;
  /** The set of entitled feature keys (only meaningful when !unrestricted). */
  keys: Set<string>;
}

/**
 * Pure entitlement computation. `planFeatureLabels` is the Plan.features array
 * (human labels) for the tenant's plan, or null when the tenant has no plan.
 *  - null            → unrestricted (allow-all)
 *  - [] or [labels…] → restricted to exactly the keys those labels resolve to
 */
export function computeEntitlements(planFeatureLabels: string[] | null): Entitlements {
  if (planFeatureLabels === null) return { unrestricted: true, keys: new Set() };
  return { unrestricted: false, keys: new Set(featureKeysFromLabels(planFeatureLabels)) };
}

/** Whether a feature key is granted under these entitlements. */
export function hasFeature(ent: Entitlements, key: string): boolean {
  return ent.unrestricted || ent.keys.has(key);
}

/**
 * Whether a route path is allowed under these entitlements. A path is blocked
 * only when it matches a gateable feature's prefix and that feature isn't granted.
 * Paths mapping to no feature (core surfaces) are always allowed.
 */
export function isRouteAllowed(ent: Entitlements, path: string): boolean {
  if (ent.unrestricted) return true;
  for (const key of GATEABLE_KEYS) {
    if (FEATURE_ROUTES[key].some((p) => path === p || path.startsWith(p + "/"))) {
      // This path belongs to a gated feature — allow only if entitled.
      return ent.keys.has(key);
    }
  }
  return true; // not a gated route
}
