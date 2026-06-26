import "server-only";
import { redirect } from "next/navigation";
import { adminDb } from "./db";
import { getCurrentUser } from "./auth";
import {
  computeEntitlements,
  hasFeature,
  type Entitlements,
} from "./entitlementsShared";

// ── Plan entitlements (server side) ───────────────────────────────────────────
// The DB-backed resolver + page guard. The route map and pure decision logic
// live in lib/entitlementsShared.ts (isomorphic — safe to import from client
// components like the Sidebar). Re-exported here for server callers' convenience.
//
// POLICY (decided with the product owner): a tenant with NO plan is unrestricted
// (allow-all) — restriction is opt-in per plan. Core/unmapped routes are always
// allowed. Seat caps / suspension are a separate concern (lib/billing.ts).

export {
  FEATURE_ROUTES,
  computeEntitlements,
  hasFeature,
  isRouteAllowed,
  type Entitlements,
} from "./entitlementsShared";

/**
 * Resolve the current tenant's entitlements from its plan. Reads the Tenant row
 * (the tenancy ROOT, not scoped) + its plan's features via adminDb. No plan →
 * unrestricted. Plan.features is a Json column persisting a string[] of labels.
 */
export async function getTenantEntitlements(tenantId: string): Promise<Entitlements> {
  const tenant = await adminDb.tenant.findUnique({
    where: { id: tenantId },
    select: { plan: { select: { features: true } } },
  });
  // No plan at all → allow-all.
  if (!tenant?.plan) return computeEntitlements(null);
  const raw = tenant.plan.features;
  const labels = Array.isArray(raw)
    ? (raw as unknown[]).filter((x): x is string => typeof x === "string")
    : [];
  return computeEntitlements(labels);
}

/**
 * Page guard: call at the top of a server page/route for a feature. If the
 * current tenant's plan doesn't include `key`, redirect to the upgrade screen
 * (which links to /billing). No-ops for unrestricted tenants. System Owners have
 * no tenant and are left for the page's own auth to handle.
 */
export async function requireFeature(key: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user || user.isSystemOwner) return; // not a gated tenant context
  const ent = await getTenantEntitlements(user.tenantId);
  if (!hasFeature(ent, key)) redirect(`/upgrade?feature=${encodeURIComponent(key)}`);
}
