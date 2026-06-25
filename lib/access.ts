// ── Tenant access decision (pure) ─────────────────────────────────────────────
// The trial/subscription gate logic, kept free of I/O and `server-only` so it can
// be unit-tested directly. lib/billing.ts reads the Tenant row and delegates the
// decision here; app/(app)/layout.tsx enforces the result.

// Subscription statuses that grant access (Stripe is paying or trialing). A
// past_due/canceled/unpaid sub does NOT count as healthy.
const HEALTHY_SUB_STATUSES = new Set(["active", "trialing"]);

export interface TenantAccess {
  /** False once the free trial has lapsed with no healthy paid subscription. */
  hasAccess: boolean;
  /** True while inside the provisioning trial window (no paid sub yet). */
  inTrial: boolean;
  /** When the provisioning trial ends (null = no trial window granted). */
  trialEndsAt: Date | null;
  /** Whole days left in the trial (>=0), or null if not in a trial. */
  trialDaysLeft: number | null;
  /** True when the gate is closed specifically because the trial expired. */
  trialExpired: boolean;
}

/**
 * Pure access decision (no I/O). Rules, in order:
 *  1. A healthy Stripe subscription (active/trialing) → full access, no trial UI.
 *  2. Otherwise, inside the provisioning trial window (trialEndsAt in future) →
 *     full access, show a countdown.
 *  3. Otherwise, if a trial was granted and has passed → NO access (trialExpired);
 *     the layout sends them to /trial-ended, which only links to /billing.
 *  4. No trial window and no sub → access allowed (legacy/manual tenants created
 *     before trials existed are not retroactively locked out).
 *
 * `now` (epoch ms) is injected for deterministic tests.
 */
export function computeTenantAccess(
  subscriptionStatus: string | null,
  trialEndsAt: Date | null,
  now: number,
): TenantAccess {
  const hasHealthySub =
    !!subscriptionStatus && HEALTHY_SUB_STATUSES.has(subscriptionStatus);

  // A paid/trialing Stripe subscription always grants access and supersedes the
  // provisioning trial entirely (no countdown once they've subscribed).
  if (hasHealthySub) {
    return { hasAccess: true, inTrial: false, trialEndsAt, trialDaysLeft: null, trialExpired: false };
  }

  // No healthy sub: access hinges on the provisioning trial window.
  if (trialEndsAt) {
    const msLeft = trialEndsAt.getTime() - now;
    if (msLeft > 0) {
      return {
        hasAccess: true,
        inTrial: true,
        trialEndsAt,
        trialDaysLeft: Math.ceil(msLeft / 86_400_000),
        trialExpired: false,
      };
    }
    // Trial granted and now elapsed with nothing paid → gate closed.
    return { hasAccess: false, inTrial: false, trialEndsAt, trialDaysLeft: 0, trialExpired: true };
  }

  // No trial granted and no sub → not gated.
  return { hasAccess: true, inTrial: false, trialEndsAt: null, trialDaysLeft: null, trialExpired: false };
}
