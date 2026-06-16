import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { invoiceShareUrl } from "@/lib/invoiceQueries";

// POST /api/invoices/pay/[token] — start a Stripe Checkout Session for the
// invoice behind this public share token. UNAUTHENTICATED on purpose: the client
// paying has no portal login, only the opaque token (the same gate as viewing
// the invoice). Returns { url } to redirect the browser to Stripe's hosted page.
//
// The webhook (POST /api/stripe/webhook) — not this route — is what actually
// marks the invoice PAID; the redirect back to us is only a UX convenience.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    if (!isStripeConfigured()) {
      return NextResponse.json(
        { error: "Online payment isn’t set up for this invoice." },
        { status: 503 },
      );
    }

    const { token } = await params;

    const invoice = await db.invoice.findUnique({
      where: { shareToken: token },
      select: {
        id: true,
        number: true,
        status: true,
        currency: true,
        totalCents: true,
        clientName: true,
        clientEmail: true,
        creatorName: true,
      },
    });

    // Unknown/revoked token → 404, same as the page (don't confirm existence).
    if (!invoice) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (invoice.status === "PAID") {
      return NextResponse.json(
        { error: "This invoice is already paid." },
        { status: 409 },
      );
    }
    if (invoice.status === "CANCELLED") {
      return NextResponse.json(
        { error: "This invoice has been cancelled." },
        { status: 409 },
      );
    }
    if (invoice.totalCents <= 0) {
      return NextResponse.json(
        { error: "This invoice has no amount due." },
        { status: 400 },
      );
    }

    const stripe = getStripe();
    const returnBase = invoiceShareUrl(token);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      // Prefill the client's email on Stripe's page when we know it.
      customer_email: invoice.clientEmail || undefined,
      line_items: [
        {
          quantity: 1,
          price_data: {
            // Stripe wants the ISO currency lowercased.
            currency: invoice.currency.toLowerCase(),
            // Stripe charges in the smallest currency unit — exactly our cents.
            unit_amount: invoice.totalCents,
            product_data: {
              name: `Invoice ${invoice.number}`,
              description: `Payment from ${invoice.clientName}`,
            },
          },
        },
      ],
      // Carried back verbatim on the webhook event — the trustworthy link from a
      // Stripe payment to our invoice (never trust amounts from the client).
      metadata: { invoiceId: invoice.id, invoiceNumber: invoice.number },
      payment_intent_data: {
        metadata: { invoiceId: invoice.id, invoiceNumber: invoice.number },
      },
      success_url: `${returnBase}?paid=1`,
      cancel_url: `${returnBase}?canceled=1`,
    });

    if (!session.url) {
      return NextResponse.json(
        { error: "Could not start checkout." },
        { status: 502 },
      );
    }

    // Remember the session so the webhook (and a resumed payment) can correlate.
    await db.invoice.update({
      where: { id: invoice.id },
      data: { stripeSessionId: session.id },
    });

    // System-actor audit entry (no logged-in user — the client did this).
    await audit({
      actor: { id: null, name: "Client", role: "PUBLIC" },
      action: "invoice.payment_started",
      entity: "Invoice",
      entityId: invoice.id,
      summary: `Client started a Stripe payment for invoice ${invoice.number}`,
      detail: { sessionId: session.id, totalCents: invoice.totalCents },
    });

    return NextResponse.json({ url: session.url });
  } catch (e: any) {
    console.error("[invoices.pay]", e);
    return NextResponse.json(
      { error: "Could not start checkout." },
      { status: 500 },
    );
  }
}
