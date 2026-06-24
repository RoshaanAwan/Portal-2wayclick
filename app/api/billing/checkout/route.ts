import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { requireTenantUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { isStripeConfigured } from "@/lib/stripe";
import { createSubscriptionCheckout } from "@/lib/billing";
import { audit } from "@/lib/audit";
import { runWithTenant } from "@/lib/tenantContext";

// Company Owner only: start a Stripe Checkout session to subscribe this tenant to
// a plan. The webhook (not the redirect) links the subscription to the tenant.
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
    const subdomain = (await headers()).get("x-tenant-subdomain");

    const url = await createSubscriptionCheckout(user.tenantId, planId, subdomain);

    // The ALS tenant context can be lost across the Stripe awaits above, so wrap
    // the scoped audit write in the tenant context explicitly (recurring gotcha).
    await runWithTenant(user.tenantId, () =>
      audit({
        actor: user,
        action: "billing.checkout_started",
        entity: "Tenant",
        entityId: user.tenantId,
        summary: `${user.name} started checkout for a subscription`,
        detail: { planId },
      }),
    );

    return NextResponse.json({ url });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (e?.message === "PLATFORM_ONLY")
      return NextResponse.json({ error: "Not available to platform operators." }, { status: 403 });
    if (e?.message === "PLAN_UNAVAILABLE" || e?.message === "PLAN_NOT_SELLABLE")
      return NextResponse.json({ error: "That plan isn’t available." }, { status: 400 });
    if (e instanceof z.ZodError)
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    console.error("[billing.checkout]", e);
    return NextResponse.json({ error: "Could not start checkout" }, { status: 500 });
  }
}
