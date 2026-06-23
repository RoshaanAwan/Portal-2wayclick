import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { db, adminDb } from "@/lib/db";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notifications";
import { getStripe, stripeWebhookSecret } from "@/lib/stripe";
import { formatMoney } from "@/lib/invoices";
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
        // Only act when the session is actually paid (async methods can complete
        // unpaid; we also double-check payment_status).
        if (session.payment_status === "paid") {
          await markInvoicePaid(session);
        }
        break;
      }
      // A safety net: if the session completed but payment settled later
      // (async payment methods), this fires when funds clear.
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object as Stripe.Checkout.Session;
        await markInvoicePaid(session);
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
