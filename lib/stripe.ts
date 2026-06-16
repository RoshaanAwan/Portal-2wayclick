import "server-only";
import Stripe from "stripe";

// ── Stripe client ─────────────────────────────────────────────────────────────
// A single lazily-created Stripe instance. We DON'T construct it at module load:
// the key may be absent (Stripe is optional — the portal runs fine without it),
// and constructing with an empty key would throw on import and take down every
// route that transitively imports this. Instead getStripe() builds it on first
// use and throws a clear error only if actually called without a key.
//
// Test vs live is decided entirely by which secret key you set (sk_test_… vs
// sk_live_…) — there's no separate flag here.

let cached: Stripe | null = null;

/** True when a Stripe secret key is configured (gates the "Pay now" UI). */
export function isStripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

/**
 * The shared Stripe client. Throws if STRIPE_SECRET_KEY is missing — callers
 * should gate on isStripeConfigured() first and surface a friendly message.
 */
export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "Stripe is not configured — set STRIPE_SECRET_KEY in the environment.",
    );
  }
  if (!cached) {
    cached = new Stripe(key, {
      // Pin the API version so Stripe-side changes never silently alter behavior.
      apiVersion: "2025-09-30.clover",
      appInfo: { name: "2WayClick Portal" },
    });
  }
  return cached;
}

/** The webhook signing secret (whsec_…), used to verify event authenticity. */
export function stripeWebhookSecret(): string | undefined {
  return process.env.STRIPE_WEBHOOK_SECRET;
}
