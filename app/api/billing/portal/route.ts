import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { requireTenantUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { isStripeConfigured } from "@/lib/stripe";
import { createBillingPortal } from "@/lib/billing";

// Company Owner only: open the Stripe Billing Portal (manage payment method,
// view invoices, switch plan, cancel). Requires an existing subscription.
export async function POST() {
  try {
    const user = await requireTenantUser();
    if (!can.manageBilling(user.role)) {
      return NextResponse.json({ error: "Only the Company Owner can manage billing." }, { status: 403 });
    }
    if (!isStripeConfigured()) {
      return NextResponse.json({ error: "Billing isn’t set up on this platform yet." }, { status: 503 });
    }

    const subdomain = (await headers()).get("x-tenant-subdomain");
    const url = await createBillingPortal(user.tenantId, subdomain);
    return NextResponse.json({ url });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (e?.message === "PLATFORM_ONLY")
      return NextResponse.json({ error: "Not available to platform operators." }, { status: 403 });
    if (e?.message === "NO_SUBSCRIPTION")
      return NextResponse.json({ error: "No subscription yet — subscribe to a plan first." }, { status: 400 });
    console.error("[billing.portal]", e);
    return NextResponse.json({ error: "Could not open billing portal" }, { status: 500 });
  }
}
