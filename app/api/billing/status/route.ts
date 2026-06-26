import { NextResponse } from "next/server";
import { requireTenantUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getTenantBilling, getSeatUsage } from "@/lib/billing";
import { getPlan } from "@/lib/plans";

// Company Owner only: a lightweight snapshot of the workspace's current
// subscription state. The billing page polls this after a Checkout redirect so
// the plan flips to "active" as soon as the Stripe webhook lands — without the
// user having to reload. Read-only; never cached.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireTenantUser();
    if (!can.manageBilling(user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const [billing, seats] = await Promise.all([
      getTenantBilling(user.tenantId),
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
    console.error("[billing.status]", e);
    return NextResponse.json({ error: "Could not load billing status" }, { status: 500 });
  }
}
