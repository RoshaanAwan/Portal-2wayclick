import "server-only";
import { adminDb } from "./db";
import { getStripe } from "./stripe";
import { appBaseUrl } from "./share";

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
