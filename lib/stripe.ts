import "server-only";
import Stripe from "stripe";

// The apiVersion literal the installed SDK accepts. Derived from the Stripe
// constructor's own config type so it tracks the SDK without us hard-coding the
// SDK's latest-version string (which is all the SDK's types expose).
type StripeApiVersion = NonNullable<
  ConstructorParameters<typeof Stripe>[1]
>["apiVersion"];

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
      // The integration was written against the 2025-09-30 (clover) API; the
      // installed SDK's types only name its own latest version, so we cast to
      // keep the intended pin without bumping the live API version.
      apiVersion: "2025-09-30.clover" as StripeApiVersion,
      appInfo: { name: "2WayClick Portal" },
    });
  }
  return cached;
}

/** The webhook signing secret (whsec_…), used to verify event authenticity. */
export function stripeWebhookSecret(): string | undefined {
  return process.env.STRIPE_WEBHOOK_SECRET;
}
