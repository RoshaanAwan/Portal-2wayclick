/**
 * One-off: recover billing after SWITCHING Stripe accounts.
 *
 * When STRIPE_SECRET_KEY is pointed at a different Stripe account, every Stripe id
 * stored in our DB still references the OLD account and is invalid in the new one.
 * Symptoms in the logs: "No such customer: cus_…" / "No such price: price_…"
 * (StripeInvalidRequestError, code: resource_missing) on checkout/portal.
 *
 * This script makes the DB consistent with the NEW account:
 *   1. PLANS — re-creates a fresh Stripe Product + recurring Price in the new
 *      account for every plan that currently has a stripePriceId, and overwrites
 *      stripeProductId/stripePriceId with the new ids. (Stripe Prices are
 *      immutable and account-scoped, so the old ids can never be reused.)
 *   2. TENANTS — clears the stale stripeCustomerId / stripeSubscriptionId /
 *      subscriptionStatus / currentPeriodEnd so each workspace shows as
 *      "not subscribed" and starts a clean Checkout. (ensureStripeCustomer also
 *      self-heals a stale customer id at checkout time; this just makes the
 *      billing page honest immediately and avoids ghost "subscribed" states.)
 *
 * NOTE: it does NOT migrate live subscriptions across accounts — Stripe can't do
 * that. Tenants re-subscribe in the new account. That's the only correct outcome
 * after an account switch.
 *
 * Safety:
 *   • Dry-run by default. Pass --commit to actually write to the DB + Stripe.
 *   • Idempotent-ish: re-running creates fresh Prices again, so run it ONCE after
 *     the switch. The tenant-clear half is fully idempotent.
 *
 * Run (against whatever DATABASE_URL + STRIPE_SECRET_KEY point at):
 *   npx tsx scripts/stripe-account-reset.ts            # dry-run (no writes)
 *   npx tsx scripts/stripe-account-reset.ts --commit   # apply
 *
 * IMPORTANT: STRIPE_SECRET_KEY must be the NEW account's key, and DATABASE_URL the
 * prod DB. Run it ON the droplet (or with both exported), not against dev.
 */
import { PrismaClient } from "@prisma/client";
import Stripe from "stripe";

const db = new PrismaClient();
const COMMIT = process.argv.includes("--commit");

// The apiVersion literal the installed SDK accepts (same derivation as lib/stripe.ts).
type StripeApiVersion = NonNullable<ConstructorParameters<typeof Stripe>[1]>["apiVersion"];

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set — point it at the NEW account.");
  // Same API version pin as lib/stripe.ts.
  return new Stripe(key, { apiVersion: "2025-09-30.clover" as StripeApiVersion });
}

async function main() {
  const mode = COMMIT ? "COMMIT (writing)" : "DRY-RUN (no writes — pass --commit to apply)";
  console.log(`\n=== Stripe account reset — ${mode} ===\n`);

  const stripe = getStripe();

  // Sanity: confirm the key actually works before touching anything, so a wrong or
  // blank key fails loud here instead of after we've started clearing rows. A
  // missing/invalid key throws (StripeAuthenticationError); a valid one lists fine.
  await stripe.products.list({ limit: 1 });
  console.log("Stripe key OK.\n");

  // ── 1. Plans: re-create Product + Price in the new account ──────────────────
  const plans = await db.plan.findMany({
    where: { stripePriceId: { not: null } },
    select: {
      id: true, name: true, description: true, priceCents: true,
      currency: true, interval: true, stripeProductId: true, stripePriceId: true,
    },
  });

  console.log(`Plans to re-price: ${plans.length}`);
  for (const p of plans) {
    if (!COMMIT) {
      console.log(`  • ${p.name}: would create new Product+Price (old price ${p.stripePriceId})`);
      continue;
    }
    const product = await stripe.products.create({
      name: p.name,
      description: p.description || undefined,
    });
    const price = await stripe.prices.create({
      product: product.id,
      currency: p.currency.toLowerCase(),
      unit_amount: p.priceCents,
      recurring: { interval: p.interval as Stripe.PriceCreateParams.Recurring.Interval },
    });
    await db.plan.update({
      where: { id: p.id },
      data: { stripeProductId: product.id, stripePriceId: price.id },
    });
    console.log(`  • ${p.name}: ${p.stripePriceId} → ${price.id}`);
  }

  // ── 2. Tenants: clear stale Stripe ids so they re-subscribe cleanly ─────────
  const stale = await db.tenant.findMany({
    where: {
      OR: [
        { stripeCustomerId: { not: null } },
        { stripeSubscriptionId: { not: null } },
        { subscriptionStatus: { not: null } },
      ],
    },
    select: { id: true, name: true, stripeCustomerId: true, stripeSubscriptionId: true, subscriptionStatus: true },
  });

  console.log(`\nTenants to clear: ${stale.length}`);
  for (const t of stale) {
    console.log(`  • ${t.name}: cust=${t.stripeCustomerId ?? "—"} sub=${t.stripeSubscriptionId ?? "—"} status=${t.subscriptionStatus ?? "—"}`);
  }
  if (COMMIT && stale.length) {
    const res = await db.tenant.updateMany({
      where: { id: { in: stale.map((t) => t.id) } },
      data: {
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        subscriptionStatus: null,
        currentPeriodEnd: null,
      },
    });
    console.log(`  cleared ${res.count} tenant row(s).`);
  }

  console.log(`\n=== ${COMMIT ? "Done." : "Dry-run complete — re-run with --commit to apply."} ===\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
