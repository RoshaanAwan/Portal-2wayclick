import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { db, adminDb } from "@/lib/db";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notifications";
import { getStripe, stripeWebhookSecret } from "@/lib/stripe";
import { formatMoney } from "@/lib/invoices";
import { setTenantStatus } from "@/lib/platform";
import { runWithTenant } from "@/lib/tenantContext";

// ── Stripe webhook ─────────────────────────────────────────────────────────────
// The SOURCE OF TRUTH for "did the client pay". Stripe POSTs events here; we
// verify the signature against STRIPE_WEBHOOK_SECRET (so a forged request can't
// mark invoices paid), then act on the ones we care about. The redirect back to
// the share page is only cosmetic — payment is confirmed HERE.
//
// Signature verification needs the EXACT raw body bytes, so we must not let any
// framework parse/transform it. Reading req.text() in the App Router gives us
// the untouched body; we never call req.json() here.

// Never cache; this must run on every delivery.
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const secret = stripeWebhookSecret();
  if (!secret) {
    console.error("[stripe.webhook] STRIPE_WEBHOOK_SECRET is not set");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    const raw = await req.text(); // raw bytes — required for verification
    event = getStripe().webhooks.constructEvent(raw, signature, secret);
  } catch (err: any) {
    // Bad/forged signature, or wrong secret. 400 tells Stripe not to retry.
    console.error("[stripe.webhook] signature verification failed:", err.message);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        // Two kinds of checkout flow through here. A one-off invoice payment
        // (mode "payment") flips an Invoice to PAID; a subscription checkout
        // (mode "subscription") links the new subscription to the tenant.
        if (session.mode === "subscription") {
          await linkTenantSubscription(session);
        } else if (session.payment_status === "paid") {
          // Only act when actually paid (async methods can complete unpaid).
          await markInvoicePaid(session);
        }
        break;
      }
      // A safety net: if the session completed but payment settled later
      // (async payment methods), this fires when funds clear. Invoices only.
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode !== "subscription") await markInvoicePaid(session);
        break;
      }
      // Subscription lifecycle — the source of truth for a tenant's plan state.
      // created fires right after checkout; updated covers renewals, trial→active,
      // past_due, plan switches; deleted is a full cancellation.
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await syncTenantSubscription(sub);
        break;
      }
      default:
        // Ignore everything else; returning 200 stops Stripe from retrying.
        break;
    }
  } catch (err) {
    // Returning 500 makes Stripe retry the delivery — desirable for transient
    // DB hiccups, since markInvoicePaid is idempotent.
    console.error("[stripe.webhook] handler error:", err);
    return NextResponse.json({ error: "Handler error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

/**
 * Flip the invoice to PAID. Idempotent: keyed off the invoiceId we put in
 * session.metadata, and a no-op if the invoice is already PAID — so Stripe's
 * at-least-once delivery (and the async-success safety net) can't double-fire
 * notifications or audit rows.
 */
async function markInvoicePaid(session: Stripe.Checkout.Session): Promise<void> {
  const invoiceId = session.metadata?.invoiceId;
  if (!invoiceId) {
    console.error("[stripe.webhook] session has no invoiceId metadata", session.id);
    return;
  }

  // The webhook has no session/host, so resolve the invoice + its owning tenant
  // via adminDb, then do all scoped writes inside that tenant's context.
  const invoice = await adminDb.invoice.findUnique({
    where: { id: invoiceId },
    select: {
      id: true,
      tenantId: true,
      number: true,
      status: true,
      currency: true,
      totalCents: true,
      clientName: true,
      creatorId: true,
    },
  });
  if (!invoice) {
    console.error("[stripe.webhook] no invoice for id", invoiceId);
    return;
  }
  // Already settled — nothing to do (idempotency guard).
  if (invoice.status === "PAID") return;

  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : (session.payment_intent?.id ?? null);

  await runWithTenant(invoice.tenantId, async () => {
    await db.invoice.update({
      where: { id: invoice.id },
      data: {
        status: "PAID",
        paidAt: new Date(),
        stripePaymentIntentId: paymentIntentId,
        stripeSessionId: session.id,
      },
    });

    await audit({
      actor: { id: null, name: "Stripe", role: "SYSTEM" },
      action: "invoice.paid",
      entity: "Invoice",
      entityId: invoice.id,
      summary: `Invoice ${invoice.number} was paid online (${formatMoney(
        invoice.totalCents,
        invoice.currency,
      )})`,
      detail: { sessionId: session.id, paymentIntentId },
    });

    // Tell whoever raised the invoice that it's been paid.
    if (invoice.creatorId) {
      await notify({
        userId: invoice.creatorId,
        type: "invoice.paid",
        message: `Invoice ${invoice.number} was paid by ${invoice.clientName}`,
        link: `/invoices/${invoice.id}`,
      });
    }
  });
}

/**
 * Right after a subscription checkout completes: stamp the chosen plan + Stripe
 * ids onto the tenant. The full status sync happens via the subscription.* events
 * (which also fire), but doing it here too means the billing page reflects the
 * plan immediately on redirect without waiting for event ordering.
 */
async function linkTenantSubscription(session: Stripe.Checkout.Session): Promise<void> {
  const tenantId = session.metadata?.tenantId ?? session.client_reference_id ?? undefined;
  const planId = session.metadata?.planId ?? undefined;
  if (!tenantId) {
    console.error("[stripe.webhook] subscription session has no tenantId", session.id);
    return;
  }
  const subscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : (session.subscription?.id ?? null);
  const customerId =
    typeof session.customer === "string" ? session.customer : (session.customer?.id ?? null);

  await adminDb.tenant.update({
    where: { id: tenantId },
    data: {
      ...(planId ? { planId } : {}),
      ...(subscriptionId ? { stripeSubscriptionId: subscriptionId } : {}),
      ...(customerId ? { stripeCustomerId: customerId } : {}),
    },
  });
}

/**
 * Sync a Stripe Subscription's state onto its tenant. This is the SOURCE OF TRUTH
 * for "is the tenant's plan active". Per the auto-suspend policy: a canceled or
 * past_due/unpaid subscription suspends the tenant (the existing middleware block
 * + /suspended page); any healthy status reactivates it.
 *
 * Resolves the tenant by metadata.tenantId first (set at checkout), then falls
 * back to the Stripe customer id — both via adminDb (the webhook has no context).
 */
async function syncTenantSubscription(sub: Stripe.Subscription): Promise<void> {
  const metaTenantId = sub.metadata?.tenantId;
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;

  const tenant = metaTenantId
    ? await adminDb.tenant.findUnique({ where: { id: metaTenantId }, select: { id: true, status: true } })
    : customerId
      ? await adminDb.tenant.findUnique({ where: { stripeCustomerId: customerId }, select: { id: true, status: true } })
      : null;

  if (!tenant) {
    console.error("[stripe.webhook] no tenant for subscription", sub.id);
    return;
  }

  // current_period_end lives on the subscription ITEM in this API version (the
  // top-level field was removed). It's a Unix timestamp in seconds.
  const periodEndUnix = sub.items?.data?.[0]?.current_period_end ?? null;
  // A deletion event always means canceled, regardless of the object's status.
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
    // Payment recovered (e.g. past_due → active) — restore access.
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
