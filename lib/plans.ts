import "server-only";
import { adminDb } from "./db";
import { getStripe, isStripeConfigured } from "./stripe";
import { sanitizePlanFeatures } from "./planFeatures";

// ── Plans (subscription package catalog) ──────────────────────────────────────
// Platform-level CRUD for the packages a System Owner sells to tenants. Every
// function here uses adminDb and is meant to run ONLY behind requireSystemOwner()
// — Plan is not tenant-scoped, exactly like lib/platform.ts's tenant ops.
//
// Each plan mirrors a Stripe Product + a recurring Price. We keep Stripe as the
// source of truth for the catalog: a plan is only "sellable" once it has a
// stripePriceId, which a tenant's Checkout session references.
//
// Stripe gotcha encoded here: a Price is IMMUTABLE. To change the amount/interval
// of a live plan we must archive the old Price and create a new one, then swap
// the stored stripePriceId — callers of updatePlan never have to think about it.

export interface PlanInput {
  name: string;
  description?: string | null;
  priceCents: number;
  currency: string;
  interval: "month" | "year";
  trialDays: number;
  maxUsers?: number | null;
  features: string[];
}

export interface PlanDTO {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  currency: string;
  interval: string;
  trialDays: number;
  maxUsers: number | null;
  features: string[];
  active: boolean;
  sortOrder: number;
  stripePriceId: string | null;
  // True once it has a Stripe price and can actually be subscribed to.
  sellable: boolean;
  // How many tenants are currently on this plan (so the UI can warn on archive).
  tenantCount: number;
  createdAt: Date;
}

/** Normalize the Json `features` column (unknown) into a clean string[]. */
function readFeatures(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((f): f is string => typeof f === "string");
}

function toDTO(p: {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  currency: string;
  interval: string;
  trialDays: number;
  maxUsers: number | null;
  features: unknown;
  active: boolean;
  sortOrder: number;
  stripePriceId: string | null;
  createdAt: Date;
  _count?: { tenants: number };
}): PlanDTO {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    priceCents: p.priceCents,
    currency: p.currency,
    interval: p.interval,
    trialDays: p.trialDays,
    maxUsers: p.maxUsers,
    features: readFeatures(p.features),
    active: p.active,
    sortOrder: p.sortOrder,
    stripePriceId: p.stripePriceId,
    sellable: !!p.stripePriceId,
    tenantCount: p._count?.tenants ?? 0,
    createdAt: p.createdAt,
  };
}

/** All plans, active first then archived, ordered for the management table. */
export async function listPlans(): Promise<PlanDTO[]> {
  const plans = await adminDb.plan.findMany({
    orderBy: [{ active: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
    include: { _count: { select: { tenants: true } } },
  });
  return plans.map(toDTO);
}

/** Only sellable, active plans — what the tenant billing page shows. */
export async function listSellablePlans(): Promise<PlanDTO[]> {
  const plans = await adminDb.plan.findMany({
    where: { active: true, stripePriceId: { not: null } },
    orderBy: [{ sortOrder: "asc" }, { priceCents: "asc" }],
  });
  return plans.map((p) => toDTO(p));
}

export async function getPlan(id: string): Promise<PlanDTO | null> {
  const p = await adminDb.plan.findUnique({
    where: { id },
    include: { _count: { select: { tenants: true } } },
  });
  return p ? toDTO(p) : null;
}

/**
 * Create a plan and its Stripe Product + recurring Price. If Stripe isn't
 * configured the row is still created (so the catalog can be drafted), just
 * without Stripe ids — it won't be sellable until Stripe is set up and the plan
 * is re-saved.
 */
export async function createPlan(input: PlanInput): Promise<PlanDTO> {
  let stripeProductId: string | null = null;
  let stripePriceId: string | null = null;

  if (isStripeConfigured()) {
    const stripe = getStripe();
    const product = await stripe.products.create({
      name: input.name,
      description: input.description || undefined,
    });
    const price = await stripe.prices.create({
      product: product.id,
      currency: input.currency.toLowerCase(),
      unit_amount: input.priceCents,
      recurring: { interval: input.interval },
    });
    stripeProductId = product.id;
    stripePriceId = price.id;
  }

  const created = await adminDb.plan.create({
    data: {
      name: input.name,
      description: input.description || null,
      priceCents: input.priceCents,
      currency: input.currency.toLowerCase(),
      interval: input.interval,
      trialDays: input.trialDays,
      maxUsers: input.maxUsers ?? null,
      features: sanitizePlanFeatures(input.features),
      stripeProductId,
      stripePriceId,
    },
    include: { _count: { select: { tenants: true } } },
  });
  return toDTO(created);
}

/**
 * Update a plan. Name/description/features/trial/limits change in place. A price
 * or interval or currency change is special: Stripe Prices are immutable, so we
 * create a NEW Price (and Product if none existed), archive the old Price, and
 * store the new id. The old Price stays valid for any tenant already on it until
 * their subscription is migrated — we never delete it.
 */
export async function updatePlan(id: string, input: PlanInput): Promise<PlanDTO> {
  const existing = await adminDb.plan.findUnique({ where: { id } });
  if (!existing) throw new Error("PLAN_NOT_FOUND");

  let stripeProductId = existing.stripeProductId;
  let stripePriceId = existing.stripePriceId;

  if (isStripeConfigured()) {
    const stripe = getStripe();

    // Ensure a Product exists (older drafts created before Stripe was set up).
    if (!stripeProductId) {
      const product = await stripe.products.create({
        name: input.name,
        description: input.description || undefined,
      });
      stripeProductId = product.id;
    } else {
      // Keep the Product's display fields in sync (these are mutable).
      await stripe.products.update(stripeProductId, {
        name: input.name,
        description: input.description || undefined,
      });
    }

    const priceChanged =
      existing.priceCents !== input.priceCents ||
      existing.currency.toLowerCase() !== input.currency.toLowerCase() ||
      existing.interval !== input.interval;

    if (!stripePriceId || priceChanged) {
      // New immutable Price for the new terms.
      const price = await stripe.prices.create({
        product: stripeProductId,
        currency: input.currency.toLowerCase(),
        unit_amount: input.priceCents,
        recurring: { interval: input.interval },
      });
      // Archive the superseded Price (no new subscriptions can use it).
      if (stripePriceId) {
        await stripe.prices.update(stripePriceId, { active: false });
      }
      stripePriceId = price.id;
    }
  }

  const updated = await adminDb.plan.update({
    where: { id },
    data: {
      name: input.name,
      description: input.description || null,
      priceCents: input.priceCents,
      currency: input.currency.toLowerCase(),
      interval: input.interval,
      trialDays: input.trialDays,
      maxUsers: input.maxUsers ?? null,
      features: sanitizePlanFeatures(input.features),
      stripeProductId,
      stripePriceId,
    },
    include: { _count: { select: { tenants: true } } },
  });
  return toDTO(updated);
}

/**
 * Archive (soft-delete) or restore a plan. Archiving hides it from the tenant
 * billing page and deactivates its Stripe Product + Price so no NEW subscriptions
 * can start; tenants already on it keep their subscription. We never hard-delete
 * because that would orphan live Stripe subscriptions.
 */
export async function setPlanActive(id: string, active: boolean): Promise<PlanDTO> {
  const existing = await adminDb.plan.findUnique({ where: { id } });
  if (!existing) throw new Error("PLAN_NOT_FOUND");

  if (isStripeConfigured() && existing.stripeProductId) {
    const stripe = getStripe();
    // Deactivating the Product also stops it being purchasable; re-activating
    // restores it. The Price's active flag is managed alongside.
    await stripe.products.update(existing.stripeProductId, { active });
    if (existing.stripePriceId) {
      await stripe.prices.update(existing.stripePriceId, { active });
    }
  }

  const updated = await adminDb.plan.update({
    where: { id },
    data: { active },
    include: { _count: { select: { tenants: true } } },
  });
  return toDTO(updated);
}
