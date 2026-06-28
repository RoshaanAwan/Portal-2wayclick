import "server-only";
import type Stripe from "stripe";
import { adminDb } from "./db";
import { getStripe, isStripeConfigured } from "./stripe";
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
  // A downgrade scheduled to take effect at renewal (null when none is pending).
  // Surfaced so the billing UI can show "switching to X on <date>" — the tenant
  // keeps the current plan until then, see switchTenantPlan's downgrade branch.
  scheduledChange: { planName: string | null; effectiveAt: Date } | null;
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
      stripeSubscriptionId: true,
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
    scheduledChange: await getScheduledChange(
      tenant.stripeSubscriptionId,
      tenant.planId,
    ),
  };
}

/**
 * Read a pending DOWNGRADE off the subscription's Stripe schedule, if any.
 * switchTenantPlan defers downgrades by attaching a Subscription Schedule whose
 * SECOND phase carries the cheaper price (starting at renewal). We surface that
 * future phase so the UI can show "switching to X on <date>" while the tenant
 * keeps the current plan until then.
 *
 * Returns null when there's no subscription, no schedule, or the schedule's next
 * phase is the same plan they're already on (nothing meaningfully pending).
 * Best-effort: any Stripe error resolves to null so the billing page still renders.
 */
async function getScheduledChange(
  stripeSubscriptionId: string | null,
  currentPlanId: string | null,
): Promise<{ planName: string | null; effectiveAt: Date } | null> {
  if (!stripeSubscriptionId || !isStripeConfigured()) return null;
  try {
    const stripe = getStripe();
    const sub = await stripe.subscriptions.retrieve(stripeSubscriptionId);
    const scheduleId =
      typeof sub.schedule === "string" ? sub.schedule : (sub.schedule?.id ?? null);
    if (!scheduleId) return null;

    const schedule = await stripe.subscriptionSchedules.retrieve(scheduleId);
    // The upcoming phase = the first phase that starts in the future.
    const nowUnix = Math.floor(Date.now() / 1000);
    const next = schedule.phases.find((p) => (p.start_date ?? 0) > nowUnix);
    if (!next) return null;

    const nextPriceId =
      typeof next.items?.[0]?.price === "string"
        ? next.items[0].price
        : (next.items?.[0]?.price as { id?: string } | undefined)?.id ?? null;
    if (!nextPriceId) return null;

    const plan = await adminDb.plan.findFirst({
      where: { stripePriceId: nextPriceId },
      select: { id: true, name: true },
    });
    // Already on this plan (e.g. a downgrade that's effectively a no-op) — nothing
    // to announce.
    if (plan && plan.id === currentPlanId) return null;

    return { planName: plan?.name ?? null, effectiveAt: new Date(next.start_date! * 1000) };
  } catch {
    return null;
  }
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
 *
 * A stored stripeCustomerId is VALIDATED against Stripe before we trust it: if it
 * no longer exists (test→live key switch, wiped test account, deleted customer)
 * we recreate the customer and overwrite the dead id, instead of letting every
 * Checkout/Portal call 500 with "No such customer: cus_…" (resource_missing).
 */
async function ensureStripeCustomer(tenantId: string): Promise<string> {
  const tenant = await adminDb.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, name: true, subdomain: true, stripeCustomerId: true },
  });
  if (!tenant) throw new Error("TENANT_NOT_FOUND");

  const stripe = getStripe();

  if (tenant.stripeCustomerId) {
    try {
      const existing = await stripe.customers.retrieve(tenant.stripeCustomerId);
      // A deleted customer still resolves but is flagged `deleted: true`.
      if (!("deleted" in existing) || !existing.deleted) {
        return tenant.stripeCustomerId;
      }
    } catch (err) {
      // Only self-heal on "this customer doesn't exist here". Re-throw anything
      // else (network, auth, rate limit) so we don't mask real Stripe outages.
      if (!isStripeResourceMissing(err)) throw err;
    }
    // Fell through: the stored id is dead — recreate below and overwrite it.
  }

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

/** True when a Stripe error is the "No such <resource>" (resource_missing) case. */
function isStripeResourceMissing(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: string }).code === "resource_missing"
  );
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

  // Guard against stacking subscriptions: if this tenant already has a live
  // (active/trialing) subscription, a plan change must go through switchTenantPlan
  // (in-place update), NOT a fresh Checkout — otherwise every "switch" creates a
  // second subscription on the same customer and they get billed for both.
  const existing = await adminDb.tenant.findUnique({
    where: { id: tenantId },
    select: { subscriptionStatus: true, stripeSubscriptionId: true },
  });
  if (
    existing?.stripeSubscriptionId &&
    (existing.subscriptionStatus === "active" || existing.subscriptionStatus === "trialing")
  ) {
    throw new Error("ALREADY_SUBSCRIBED");
  }

  const customerId = await ensureStripeCustomer(tenantId);
  const stripe = getStripe();
  const base = appBaseUrl(subdomain);

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: plan.stripePriceId, quantity: 1 }],
    // The trustworthy link from the Stripe subscription back to our tenant + plan.
    client_reference_id: tenantId,
    // Require a card UP FRONT, even for trials — so a subscription can never reach
    // its first billing date with nothing to charge.
    payment_method_collection: "always",
    subscription_data: {
      metadata: { tenantId, planId: plan.id },
      ...(plan.trialDays > 0
        ? {
            trial_period_days: plan.trialDays,
            // Belt-and-suspenders: if a trial ever somehow ends without a usable
            // payment method, cancel it rather than create an unpaid invoice.
            trial_settings: { end_behavior: { missing_payment_method: "cancel" } },
          }
        : {}),
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
  // Only tenants who have actually subscribed get a portal — don't lazily mint a
  // customer here. But if their stored id is stale, ensureStripeCustomer re-creates
  // a valid one (and overwrites the dead id) so the portal still opens.
  if (!tenant?.stripeCustomerId) throw new Error("NO_SUBSCRIPTION");

  const customerId = await ensureStripeCustomer(tenantId);
  const stripe = getStripe();
  const base = appBaseUrl(subdomain);
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${base}/billing`,
  });
  return session.url;
}

/**
 * Build (once per process) a Billing Portal CONFIGURATION that allows subscription
 * plan updates across all sellable plans, and return its id. We do NOT rely on the
 * account's DEFAULT portal configuration: that has "Customers can switch plans" off
 * by default (Stripe rejects subscription_update flows with "the subscription update
 * feature in the portal configuration is disabled"), and even when enabled it must
 * be hand-edited to list every product — so a newly-created Plan would silently
 * break upgrades. Creating our own config from the live plan catalog keeps the
 * upgrade flow self-sufficient and free of dashboard upkeep.
 *
 * Cached in-process by the set of price ids it covers, so we don't recreate it on
 * every call but DO refresh when the plan catalog changes.
 */
let cachedPortalConfig: { key: string; id: string } | null = null;

async function ensureUpgradePortalConfig(): Promise<string> {
  const plans = await adminDb.plan.findMany({
    where: { active: true, stripePriceId: { not: null }, stripeProductId: { not: null } },
    select: { stripeProductId: true, stripePriceId: true },
  });

  // The products customers may switch to, in Stripe's expected shape.
  const products = plans
    .filter((p): p is { stripeProductId: string; stripePriceId: string } =>
      !!p.stripeProductId && !!p.stripePriceId,
    )
    .map((p) => ({ product: p.stripeProductId, prices: [p.stripePriceId] }));

  if (products.length === 0) throw new Error("PLAN_NOT_SELLABLE");

  // Cache key = the exact set of price ids covered; if the catalog changes we rebuild.
  const key = products.map((p) => p.prices[0]).sort().join(",");
  if (cachedPortalConfig?.key === key) return cachedPortalConfig.id;

  const stripe = getStripe();
  const config = await stripe.billingPortal.configurations.create({
    // Minimal feature set — we need the subscription_update path enabled. Stripe
    // requires payment_method_update to be enabled alongside it (a plan switch can
    // prorate a charge, so the customer must be able to manage their card), so we
    // enable both. The hosted confirm flow we deep-link to uses these permissions.
    features: {
      subscription_update: {
        enabled: true,
        default_allowed_updates: ["price"],
        // Charge the prorated upgrade difference IMMEDIATELY (finalize + pay an
        // invoice the moment the user confirms on Stripe), rather than letting it
        // ride on the next renewal invoice.
        proration_behavior: "always_invoice",
        products,
      },
      payment_method_update: { enabled: true },
    },
    // No business_profile/headline needed for a flow we drive programmatically (the
    // account's default business profile is used).
  });

  cachedPortalConfig = { key, id: config.id };
  return config.id;
}

/**
 * UPGRADE via Stripe's hosted Billing Portal confirmation page. Rather than swap
 * the price silently (a charge the user never explicitly OK'd), this deep-links the
 * tenant straight to Stripe's "confirm subscription update" screen, where Stripe
 * itself shows the prorated amount due and the user confirms ON STRIPE. On confirm,
 * Stripe updates the EXISTING subscription (no second subscription, no double-bill,
 * card on file reused) and fires customer.subscription.updated — which our webhook
 * syncs back onto the tenant.
 *
 * Used for upgrades only; downgrades stay deferred-to-renewal (switchTenantPlan).
 * Returns the portal URL to redirect to.
 */
export async function createUpgradePortalSession(
  tenantId: string,
  planId: string,
  subdomain: string | null,
): Promise<string> {
  const plan = await adminDb.plan.findUnique({
    where: { id: planId },
    select: { id: true, active: true, stripePriceId: true },
  });
  if (!plan || !plan.active) throw new Error("PLAN_UNAVAILABLE");
  if (!plan.stripePriceId) throw new Error("PLAN_NOT_SELLABLE");

  const tenant = await adminDb.tenant.findUnique({
    where: { id: tenantId },
    select: { stripeSubscriptionId: true, planId: true },
  });
  if (!tenant?.stripeSubscriptionId) throw new Error("NO_SUBSCRIPTION");
  if (tenant.planId === plan.id) throw new Error("ALREADY_ON_PLAN");

  const customerId = await ensureStripeCustomer(tenantId);
  const stripe = getStripe();

  // Need the live subscription item id to target the update flow.
  let sub: Stripe.Subscription;
  try {
    sub = await stripe.subscriptions.retrieve(tenant.stripeSubscriptionId);
  } catch (err) {
    // Subscription gone from the active account (key switched) — clear it and tell
    // the caller to start a fresh Checkout instead.
    if (isStripeResourceMissing(err)) {
      await adminDb.tenant.update({
        where: { id: tenantId },
        data: { stripeSubscriptionId: null, subscriptionStatus: null, currentPeriodEnd: null },
      });
      throw new Error("NO_SUBSCRIPTION");
    }
    throw err;
  }
  const itemId = sub.items?.data?.[0]?.id;
  if (!itemId) throw new Error("NO_SUBSCRIPTION");

  // Use OUR portal configuration (subscription updates enabled across all sellable
  // plans), not the account default — see ensureUpgradePortalConfig.
  const configuration = await ensureUpgradePortalConfig();

  const base = appBaseUrl(subdomain);
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    configuration,
    return_url: `${base}/billing`,
    // Deep-link straight to the confirm-update screen for THIS subscription + price.
    // Stripe renders the proration preview and applies it on confirm.
    flow_data: {
      type: "subscription_update_confirm",
      subscription_update_confirm: {
        subscription: tenant.stripeSubscriptionId,
        items: [{ id: itemId, price: plan.stripePriceId, quantity: 1 }],
      },
      after_completion: {
        type: "redirect",
        redirect: { return_url: `${base}/billing?status=upgraded` },
      },
    },
  });
  return session.url;
}

/**
 * True if moving the tenant onto `planId` is an UPGRADE (the target plan costs more
 * than the tenant's current plan). Upgrades go through the hosted-portal confirm
 * flow (createUpgradePortalSession); everything else (same price, downgrade, or no
 * resolvable current plan) is handled in place by switchTenantPlan. Returns false
 * when there's nothing to compare against, so the conservative in-place path runs.
 */
export async function isPlanUpgrade(tenantId: string, planId: string): Promise<boolean> {
  const target = await adminDb.plan.findUnique({
    where: { id: planId },
    select: { priceCents: true },
  });
  if (!target) return false;

  const tenant = await adminDb.tenant.findUnique({
    where: { id: tenantId },
    select: { planId: true, stripeSubscriptionId: true },
  });
  // Only an already-subscribed tenant with a known current plan can "upgrade".
  if (!tenant?.stripeSubscriptionId || !tenant.planId) return false;

  const current = await adminDb.plan.findUnique({
    where: { id: tenant.planId },
    select: { priceCents: true },
  });
  if (!current) return false;

  return target.priceCents > current.priceCents;
}

/**
 * Switch an ALREADY-SUBSCRIBED tenant to a different plan, without creating a
 * second subscription (going through Checkout again would double-bill). The
 * behavior depends on the DIRECTION of the change:
 *
 *   • UPGRADE (new plan costs more) — applies IMMEDIATELY. The price swaps on the
 *     live subscription and the prorated difference is charged now. Synced to the
 *     tenant on the spot, so the billing page reflects it right away.
 *
 *   • DOWNGRADE (new plan costs less) — DEFERRED to the next renewal via a Stripe
 *     Subscription Schedule. The tenant keeps the (more expensive) plan they've
 *     already paid for until the current period ends — no immediate charge, no
 *     credit — then renews onto the cheaper plan. The DB plan flips only when
 *     Stripe phases into the new price (synced by the subscription.updated webhook),
 *     so the returned snapshot still shows the current plan until then.
 *
 * Returns the fresh billing snapshot.
 */
export async function switchTenantPlan(
  tenantId: string,
  planId: string,
): Promise<TenantBillingState> {
  const plan = await adminDb.plan.findUnique({
    where: { id: planId },
    select: { id: true, active: true, stripePriceId: true, priceCents: true },
  });
  if (!plan || !plan.active) throw new Error("PLAN_UNAVAILABLE");
  if (!plan.stripePriceId) throw new Error("PLAN_NOT_SELLABLE");

  const tenant = await adminDb.tenant.findUnique({
    where: { id: tenantId },
    select: { stripeSubscriptionId: true, planId: true },
  });
  // No live subscription to switch — the caller should start a Checkout instead.
  if (!tenant?.stripeSubscriptionId) throw new Error("NO_SUBSCRIPTION");
  // Already on this plan — nothing to do.
  if (tenant.planId === plan.id) return getTenantBilling(tenantId);

  // Compare prices to decide UPGRADE vs DOWNGRADE. A downgrade must NOT take effect
  // (or charge/credit) immediately — the tenant keeps the plan they already paid for
  // until the current period ends, then renews onto the cheaper plan.
  const currentPlan = tenant.planId
    ? await adminDb.plan.findUnique({ where: { id: tenant.planId }, select: { priceCents: true } })
    : null;
  // If we can't determine the current price, treat as an upgrade (apply now) — the
  // conservative choice, since downgrades are the case that needs deferral.
  const isDowngrade = currentPlan != null && plan.priceCents < currentPlan.priceCents;

  const stripe = getStripe();
  let sub: Stripe.Subscription;
  try {
    sub = await stripe.subscriptions.retrieve(tenant.stripeSubscriptionId);
  } catch (err) {
    // Stored subscription is gone from the active Stripe account (account key
    // switched). Clear the dead id and signal NO_SUBSCRIPTION so the caller starts
    // a fresh Checkout instead of trying to switch a ghost subscription.
    if (isStripeResourceMissing(err)) {
      await adminDb.tenant.update({
        where: { id: tenantId },
        data: { stripeSubscriptionId: null, subscriptionStatus: null, currentPeriodEnd: null },
      });
      throw new Error("NO_SUBSCRIPTION");
    }
    throw err;
  }
  const item = sub.items?.data?.[0];
  const itemId = item?.id;
  if (!itemId) throw new Error("NO_SUBSCRIPTION");

  if (isDowngrade) {
    // DOWNGRADE → schedule the price change for the next renewal via a Subscription
    // Schedule. Phase 1 runs the CURRENT price to period end (no proration, no charge,
    // no credit — they keep what they paid for); phase 2 switches to the new price
    // ongoing. We deliberately do NOT change metadata.planId now: the tenant stays on
    // the current plan in our DB until Stripe phases into the new price at renewal, at
    // which point customer.subscription.updated fires and syncSubscriptionToTenant
    // resolves the new plan from the live price id (the price-derived plan wins).
    const currentPriceId = item.price?.id;
    if (!currentPriceId) throw new Error("NO_SUBSCRIPTION");
    const periodEndUnix = item.current_period_end;
    if (!periodEndUnix) throw new Error("NO_SUBSCRIPTION");

    // Reuse an existing schedule on this subscription, else create one FROM it so the
    // current phase keeps its real start. release on completion so it reverts to a
    // plain subscription once the downgrade has landed.
    const scheduleId =
      typeof sub.schedule === "string" ? sub.schedule : (sub.schedule?.id ?? null);
    const schedule = scheduleId
      ? await stripe.subscriptionSchedules.retrieve(scheduleId)
      : await stripe.subscriptionSchedules.create({ from_subscription: sub.id });

    await stripe.subscriptionSchedules.update(schedule.id, {
      end_behavior: "release",
      phases: [
        {
          // Phase 1: the plan they're on now, to the end of the paid period.
          items: [{ price: currentPriceId, quantity: 1 }],
          start_date: schedule.phases[0]?.start_date ?? "now",
          end_date: periodEndUnix,
          proration_behavior: "none",
        },
        {
          // Phase 2: the cheaper plan, starting at renewal. Stamp metadata.planId so
          // the post-transition sync has it too (belt-and-suspenders with the
          // price-derived resolution).
          items: [{ price: plan.stripePriceId, quantity: 1 }],
          proration_behavior: "none",
          metadata: { tenantId, planId: plan.id },
        },
      ],
    });

    // No immediate plan change in our DB: snapshot still shows the current plan,
    // which is exactly what the tenant keeps until renewal.
    return getTenantBilling(tenantId);
  }

  // UPGRADE → apply NOW and CHARGE the prorated difference immediately. "always_invoice"
  // makes Stripe finalize + pay an invoice for the proration on the spot (card on file),
  // rather than "create_prorations" which only stages the difference onto the next
  // renewal invoice. Keep the plan id in metadata so syncSubscriptionToTenant stamps it.
  const updated = await stripe.subscriptions.update(tenant.stripeSubscriptionId, {
    items: [{ id: itemId, price: plan.stripePriceId }],
    proration_behavior: "always_invoice",
    metadata: { ...(sub.metadata ?? {}), tenantId, planId: plan.id },
  });

  await syncSubscriptionToTenant(updated);
  return getTenantBilling(tenantId);
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

  // Which plan is the subscription ACTUALLY on? Prefer the explicit metadata.planId
  // (set at checkout / immediate switch), but fall back to resolving the plan from
  // the live price id on the line item. The fallback is what makes a SCHEDULED
  // downgrade land at the right moment: when the schedule phases into the new price
  // at period end, the price id is authoritative even if metadata lags. Resolving by
  // price keeps the DB plan in lock-step with what Stripe is billing.
  let planId = sub.metadata?.planId ?? undefined;
  const livePriceId = sub.items?.data?.[0]?.price?.id;
  if (livePriceId) {
    const byPrice = await adminDb.plan.findFirst({
      where: { stripePriceId: livePriceId },
      select: { id: true },
    });
    // The price-derived plan WINS over stale metadata: it's what's being billed.
    if (byPrice) planId = byPrice.id;
  }

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
    // The stored subscription doesn't exist in the active Stripe account (e.g. the
    // account key was switched). Clear the dead ids so the tenant shows as "not
    // subscribed" and can start a clean Checkout, rather than looking subscribed
    // against a ghost id forever.
    if (isStripeResourceMissing(err)) {
      await adminDb.tenant.update({
        where: { id: tenantId },
        data: { stripeSubscriptionId: null, subscriptionStatus: null, currentPeriodEnd: null },
      });
      return getTenantBilling(tenantId);
    }
    // Any other failed Stripe lookup shouldn't blow up the billing page — return
    // the current DB snapshot and let the caller retry.
    console.error("[billing.reconcile] stripe lookup failed", err);
  }

  if (sub) await syncSubscriptionToTenant(sub);
  return getTenantBilling(tenantId);
}
