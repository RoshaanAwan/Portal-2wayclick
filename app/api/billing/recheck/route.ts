import { NextResponse } from "next/server";
import { requireTenantUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { isStripeConfigured } from "@/lib/stripe";
import { reconcileTenantBillingFromStripe, getSeatUsage } from "@/lib/billing";
import { getPlan } from "@/lib/plans";

// Company Owner only: authoritatively reconcile the workspace's subscription
// against Stripe and return the fresh snapshot. Unlike /api/billing/status (which
// just reads our DB), this PULLS the live subscription from Stripe and syncs it —
// the self-heal path for when the webhook is delayed or misconfigured, so the plan
// can activate without waiting on Stripe reaching our webhook. Never cached.
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const user = await requireTenantUser();
    if (!can.manageBilling(user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (!isStripeConfigured()) {
      return NextResponse.json({ error: "Billing isn’t set up on this platform yet." }, { status: 503 });
    }

    const [billing, seats] = await Promise.all([
      reconcileTenantBillingFromStripe(user.tenantId),
      getSeatUsage(user.tenantId),
    ]);
    // Resolve the plan name even if it was archived since (not in sellable list).
    const plan = billing.planId ? await getPlan(billing.planId) : null;

    return NextResponse.json({
      planId: billing.planId,
      planName: plan?.name ?? billing.planName ?? null,
      subscriptionStatus: billing.subscriptionStatus,
      currentPeriodEnd: billing.currentPeriodEnd
        ? billing.currentPeriodEnd.toISOString()
        : null,
      hasSubscription: billing.hasStripeCustomer,
      seatsUsed: seats.used,
      seatLimit: seats.limit,
    });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (e?.message === "PLATFORM_ONLY")
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    console.error("[billing.recheck]", e);
    return NextResponse.json({ error: "Could not recheck billing status" }, { status: 500 });
  }
}
