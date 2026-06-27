import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { isStripeConfigured } from "@/lib/stripe";
import { switchTenantPlan, getSeatUsage } from "@/lib/billing";
import { getPlan } from "@/lib/plans";
import { audit } from "@/lib/audit";
import { runWithTenant } from "@/lib/tenantContext";

// Company Owner only: switch an already-subscribed workspace to a different plan
// IN PLACE (update the existing Stripe subscription's price) — no new Checkout, no
// duplicate subscription. Returns the fresh billing snapshot so the page updates
// without a redirect. Never cached.
export const dynamic = "force-dynamic";

const schema = z.object({ planId: z.string().min(1) });

export async function POST(req: Request) {
  try {
    const user = await requireTenantUser();
    if (!can.manageBilling(user.role)) {
      return NextResponse.json({ error: "Only the Company Owner can manage billing." }, { status: 403 });
    }
    if (!isStripeConfigured()) {
      return NextResponse.json({ error: "Billing isn’t set up on this platform yet." }, { status: 503 });
    }

    const { planId } = schema.parse(await req.json());
    const billing = await switchTenantPlan(user.tenantId, planId);
    const seats = await getSeatUsage(user.tenantId);
    const plan = billing.planId ? await getPlan(billing.planId) : null;

    await runWithTenant(user.tenantId, () =>
      audit({
        actor: user,
        action: "billing.plan_switched",
        entity: "Tenant",
        entityId: user.tenantId,
        summary: `${user.name} switched the workspace plan`,
        detail: { planId },
      }),
    );

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
      return NextResponse.json({ error: "Not available to platform operators." }, { status: 403 });
    if (e?.message === "NO_SUBSCRIPTION")
      return NextResponse.json({ error: "No active subscription to switch. Subscribe first." }, { status: 400 });
    if (e?.message === "PLAN_UNAVAILABLE" || e?.message === "PLAN_NOT_SELLABLE")
      return NextResponse.json({ error: "That plan isn’t available." }, { status: 400 });
    if (e instanceof z.ZodError)
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    console.error("[billing.switch]", e);
    return NextResponse.json({ error: "Could not switch plan" }, { status: 500 });
  }
}
