import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { db, adminDb } from "@/lib/db";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notifications";
import { getStripe, stripeWebhookSecret } from "@/lib/stripe";
import { formatMoney } from "@/lib/invoices";
import { syncSubscriptionToTenant } from "@/lib/billing";
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
        await syncSubscriptionToTenant(sub);
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

  // Guard against a stale/foreign tenant id (e.g. checkout created against a
  // different DB): updating a non-existent id throws P2025. Verify it exists
  // first and log loudly instead of 500-ing — the subscription.* events will
  // still resolve via the customer id once it's linked.
  const exists = await adminDb.tenant.findUnique({ where: { id: tenantId }, select: { id: true } });
  if (!exists) {
    console.error(
      "[stripe.webhook] checkout tenantId not found in DB — cannot link subscription",
      JSON.stringify({ sessionId: session.id, tenantId, customerId }),
    );
    return;
  }

  await adminDb.tenant.update({
    where: { id: tenantId },
    data: {
      ...(planId ? { planId } : {}),
      ...(subscriptionId ? { stripeSubscriptionId: subscriptionId } : {}),
      ...(customerId ? { stripeCustomerId: customerId } : {}),
    },
  });
}
