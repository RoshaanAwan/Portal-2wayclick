import "server-only";
import type Stripe from "stripe";
import { adminDb } from "./db";
import { getStripe } from "./stripe";
import { appBaseUrl } from "./share";
import { computeTenantAccess, type TenantAccess } from "./access";
import { setTenantStatus } from "./platform";
import { audit } from "./audit";
import { runWithTenant } from "./tenantContext";

export type { TenantAccess } from "./access";

// ── Tenant billing (subscription self-serve) ──────────────────────────────────
// Helpers a Company Owner uses to subscribe their workspace to a Plan and manage
// the subscription. The Tenant row is the multi-tenancy ROOT (not a SCOPED_MODEL),
// so it's always read/written via adminDb by its known id — same as lib/platform.
// Stripe remains the source of truth for subscription state; the webhook syncs it
// back onto the Tenant row (see app/api/stripe/webhook).

export interface TenantBillingState {
  planId: string | null;
  planName: string | null;
  subscriptionStatus: string | null;
  currentPeriodEnd: Date | null;
  hasStripeCustomer: boolean;
}

/**
 * Decide whether a tenant may use the workspace, and surface trial state for the
 * banner. Reads the Tenant row via adminDb (Tenant is the tenancy ROOT, not
 * scoped) and delegates the rules to the pure computeTenantAccess (lib/access).
 */
export async function getTenantAccess(tenantId: string): Promise<TenantAccess> {
  const tenant = await adminDb.tenant.findUnique({
    where: { id: tenantId },
    select: { subscriptionStatus: true, trialEndsAt: true },
  });
  if (!tenant) throw new Error("TENANT_NOT_FOUND");
  return computeTenantAccess(tenant.subscriptionStatus, tenant.trialEndsAt, Date.now());
}

/** Current subscription snapshot for a tenant (for the billing page). */
export async function getTenantBilling(tenantId: string): Promise<TenantBillingState> {
  const tenant = await adminDb.tenant.findUnique({
    where: { id: tenantId },
    select: {
      planId: true,
      subscriptionStatus: true,
      currentPeriodEnd: true,
      stripeCustomerId: true,
      plan: { select: { name: true } },
    },
  });
  if (!tenant) throw new Error("TENANT_NOT_FOUND");
  return {
    planId: tenant.planId,
    planName: tenant.plan?.name ?? null,
    subscriptionStatus: tenant.subscriptionStatus,
    currentPeriodEnd: tenant.currentPeriodEnd,
    hasStripeCustomer: !!tenant.stripeCustomerId,
  };
}

/**
 * Current seat usage for a tenant: how many users exist vs the plan's cap.
 * `limit` is null when the plan has no cap (or there's no plan) — unlimited.
 * Used by the billing UI to show "N of M seats used".
 *
 * Reads the Tenant + Plan + user count via adminDb (Tenant/Plan are not scoped).
 */
export async function getSeatUsage(
  tenantId: string,
): Promise<{ used: number; limit: number | null }> {
  const [tenant, used] = await Promise.all([
    adminDb.tenant.findUnique({
      where: { id: tenantId },
      select: { plan: { select: { maxUsers: true } } },
    }),
    adminDb.user.count({ where: { tenantId, isSystemOwner: false } }),
  ]);
  return { used, limit: tenant?.plan?.maxUsers ?? null };
}

/**
 * Whether a tenant can add another user under its plan's maxUsers cap. Returns
 * the cap details so callers can surface a precise message. A tenant with no
 * plan, or a plan with no cap (maxUsers null), is always allowed.
 *
 * Reads the Tenant + Plan + user count via adminDb (Tenant/Plan are not scoped).
 */
export async function canAddUser(
  tenantId: string,
): Promise<{ allowed: boolean; current: number; max: number | null }> {
  const tenant = await adminDb.tenant.findUnique({
    where: { id: tenantId },
    select: { plan: { select: { maxUsers: true } } },
  });
  const max = tenant?.plan?.maxUsers ?? null;
  if (max == null) return { allowed: true, current: 0, max: null };

  const current = await adminDb.user.count({
    where: { tenantId, isSystemOwner: false },
  });
  return { allowed: current < max, current, max };
}

/**
 * Find (or lazily create) the Stripe Customer for a tenant. We key the Customer
 * by tenantId in its metadata so the webhook can map events back even if our
 * stored id is ever lost. The created id is persisted on the Tenant row.
 */
async function ensureStripeCustomer(tenantId: string): Promise<string> {
  const tenant = await adminDb.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, name: true, subdomain: true, stripeCustomerId: true },
  });
  if (!tenant) throw new Error("TENANT_NOT_FOUND");
  if (tenant.stripeCustomerId) return tenant.stripeCustomerId;

  const stripe = getStripe();
  const customer = await stripe.customers.create({
    name: tenant.name,
    metadata: { tenantId: tenant.id, subdomain: tenant.subdomain },
  });
  await adminDb.tenant.update({
    where: { id: tenant.id },
    data: { stripeCustomerId: customer.id },
  });
  return customer.id;
}

/**
 * Start a Stripe Checkout session in subscription mode for the given plan.
 * Returns the hosted Checkout URL. The webhook — not the redirect — is what
 * actually links the subscription to the tenant.
 *
 * @param subdomain the tenant's subdomain, for building same-host return URLs.
 */
export async function createSubscriptionCheckout(
  tenantId: string,
  planId: string,
  subdomain: string | null,
): Promise<string> {
  const plan = await adminDb.plan.findUnique({
    where: { id: planId },
    select: { id: true, active: true, stripePriceId: true, trialDays: true },
  });
  if (!plan || !plan.active) throw new Error("PLAN_UNAVAILABLE");
  if (!plan.stripePriceId) throw new Error("PLAN_NOT_SELLABLE");

  const customerId = await ensureStripeCustomer(tenantId);
  const stripe = getStripe();
  const base = appBaseUrl(subdomain);

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: plan.stripePriceId, quantity: 1 }],
    // The trustworthy link from the Stripe subscription back to our tenant + plan.
    client_reference_id: tenantId,
    subscription_data: {
      metadata: { tenantId, planId: plan.id },
      ...(plan.trialDays > 0 ? { trial_period_days: plan.trialDays } : {}),
    },
    metadata: { tenantId, planId: plan.id },
    success_url: `${base}/billing?status=success`,
    cancel_url: `${base}/billing?status=canceled`,
  });

  if (!session.url) throw new Error("CHECKOUT_FAILED");
  return session.url;
}

/**
 * Open the Stripe Billing Portal so the tenant can update payment method, view
 * invoices, switch plan, or cancel — without us building any of that UI. Returns
 * the portal URL. Requires an existing Stripe customer (i.e. they've subscribed).
 */
export async function createBillingPortal(
  tenantId: string,
  subdomain: string | null,
): Promise<string> {
  const tenant = await adminDb.tenant.findUnique({
    where: { id: tenantId },
    select: { stripeCustomerId: true },
  });
  if (!tenant?.stripeCustomerId) throw new Error("NO_SUBSCRIPTION");

  const stripe = getStripe();
  const base = appBaseUrl(subdomain);
  const session = await stripe.billingPortal.sessions.create({
    customer: tenant.stripeCustomerId,
    return_url: `${base}/billing`,
  });
  return session.url;
}

/**
 * Sync a Stripe Subscription's state onto its tenant. This is the SOURCE OF TRUTH
 * for "is the tenant's plan active". Per the auto-suspend policy: a canceled or
 * past_due/unpaid subscription suspends the tenant; any healthy status reactivates.
 *
 * Resolves the tenant by metadata.tenantId first (set at checkout), then falls
 * back to the Stripe customer id — both via adminDb (no request context here).
 *
 * Called from TWO places that must stay in lock-step: the Stripe webhook (the
 * normal path) and reconcileTenantBillingFromStripe (the self-heal path used when
 * the webhook is delayed or misconfigured). Keep the logic here, not duplicated.
 */
export async function syncSubscriptionToTenant(sub: Stripe.Subscription): Promise<void> {
  const metaTenantId = sub.metadata?.tenantId;
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;

  // Resolve by metadata.tenantId FIRST, then fall back to the Stripe customer id
  // if that misses. The fallback must run when the metadata lookup returns NULL
  // (stale/foreign id), not only when metadata is absent.
  let tenant =
    metaTenantId
      ? await adminDb.tenant.findUnique({ where: { id: metaTenantId }, select: { id: true, status: true } })
      : null;
  if (!tenant && customerId) {
    tenant = await adminDb.tenant.findUnique({
      where: { stripeCustomerId: customerId },
      select: { id: true, status: true },
    });
  }

  if (!tenant) {
    console.error(
      "[billing.sync] no tenant for subscription",
      JSON.stringify({ subId: sub.id, metaTenantId: metaTenantId ?? null, customerId: customerId ?? null }),
    );
    return;
  }

  // current_period_end lives on the subscription ITEM in this API version (the
  // top-level field was removed). It's a Unix timestamp in seconds.
  const periodEndUnix = sub.items?.data?.[0]?.current_period_end ?? null;
  const status = sub.status;
  const planId = sub.metadata?.planId ?? undefined;

  await adminDb.tenant.update({
    where: { id: tenant.id },
    data: {
      subscriptionStatus: status,
      stripeSubscriptionId: sub.id,
      currentPeriodEnd: periodEndUnix ? new Date(periodEndUnix * 1000) : null,
      ...(planId ? { planId } : {}),
      ...(customerId ? { stripeCustomerId: customerId } : {}),
    },
  });

  // Auto-suspend / reactivate policy. "active" and "trialing" are healthy;
  // everything terminal/unpaid suspends access.
  const healthy = status === "active" || status === "trialing";
  const shouldSuspend = !healthy && (status === "canceled" || status === "past_due" || status === "unpaid");

  if (shouldSuspend && tenant.status !== "suspended") {
    await setTenantStatus(tenant.id, "suspended");
  } else if (healthy && tenant.status === "suspended") {
    await setTenantStatus(tenant.id, "active");
  }

  await runWithTenant(tenant.id, () =>
    audit({
      actor: { id: null, name: "Stripe", role: "SYSTEM" },
      action: "subscription.sync",
      entity: "Tenant",
      entityId: tenant.id,
      summary: `Subscription is now ${status}`,
      detail: { subscriptionId: sub.id, status, suspended: shouldSuspend },
    }),
  );
}

/**
 * Self-heal: pull the tenant's subscription straight from Stripe and sync it,
 * then return the fresh billing snapshot. This is the fallback for when the
 * webhook hasn't landed (delayed delivery, or a misconfigured endpoint) — it
 * makes activation NOT depend solely on Stripe reaching our webhook.
 *
 * Resolves the live subscription by the stored stripeSubscriptionId, falling
 * back to the most recent subscription on the stored Stripe customer. A tenant
 * that never started checkout (no customer/subscription) is a cheap no-op.
 */
export async function reconcileTenantBillingFromStripe(
  tenantId: string,
): Promise<TenantBillingState> {
  const tenant = await adminDb.tenant.findUnique({
    where: { id: tenantId },
    select: { stripeSubscriptionId: true, stripeCustomerId: true },
  });
  if (!tenant) throw new Error("TENANT_NOT_FOUND");

  // No Stripe footprint yet — nothing to reconcile against.
  if (!tenant.stripeSubscriptionId && !tenant.stripeCustomerId) {
    return getTenantBilling(tenantId);
  }

  const stripe = getStripe();
  let sub: Stripe.Subscription | null = null;
  try {
    if (tenant.stripeSubscriptionId) {
      sub = await stripe.subscriptions.retrieve(tenant.stripeSubscriptionId);
    } else if (tenant.stripeCustomerId) {
      const list = await stripe.subscriptions.list({
        customer: tenant.stripeCustomerId,
        status: "all",
        limit: 1,
      });
      sub = list.data[0] ?? null;
    }
  } catch (err) {
    // A failed Stripe lookup shouldn't blow up the billing page — return the
    // current DB snapshot and let the caller retry.
    console.error("[billing.reconcile] stripe lookup failed", err);
  }

  if (sub) await syncSubscriptionToTenant(sub);
  return getTenantBilling(tenantId);
}
