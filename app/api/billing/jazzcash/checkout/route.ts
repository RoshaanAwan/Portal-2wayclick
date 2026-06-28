import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { requireTenantUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { adminDb } from "@/lib/db";
import { appBaseUrl } from "@/lib/share";
import { audit } from "@/lib/audit";
import { runWithTenant } from "@/lib/tenantContext";
import {
  isJazzCashConfigured,
  buildJazzCashForm,
  newTxnRef,
} from "@/lib/jazzcash";

// Company Owner only: start a JazzCash hosted-form payment for one plan period.
// We don't redirect server-side — JazzCash needs a POST with our signed pp_*
// fields, so we hand the client the endpoint + fields and it auto-submits a form.
// The callback route (verified) is what actually activates the plan; this just
// kicks off the hosted payment.
const schema = z.object({ planId: z.string().min(1) });

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const user = await requireTenantUser();
    if (!can.manageBilling(user.role)) {
      return NextResponse.json(
        { error: "Only the Company Owner can manage billing." },
        { status: 403 },
      );
    }
    if (!isJazzCashConfigured()) {
      return NextResponse.json(
        { error: "JazzCash isn’t set up on this platform yet." },
        { status: 503 },
      );
    }

    const { planId } = schema.parse(await req.json());

    // Plan must exist, be active, and be priced. The price is charged as PKR (whole
    // rupees) — plans sold via JazzCash are priced in PKR. priceCents stores the
    // smallest unit, so rupees = priceCents / 100.
    const plan = await adminDb.plan.findUnique({
      where: { id: planId },
      select: { id: true, name: true, active: true, priceCents: true },
    });
    if (!plan || !plan.active) {
      return NextResponse.json({ error: "That plan isn’t available." }, { status: 400 });
    }
    if (plan.priceCents <= 0) {
      return NextResponse.json({ error: "That plan isn’t purchasable." }, { status: 400 });
    }

    const subdomain = (await headers()).get("x-tenant-subdomain");
    const base = appBaseUrl(subdomain);
    const txnRef = newTxnRef();

    // JazzCash redirects (POSTs) back here on completion. We carry the context as
    // query params so the callback can resolve the tenant/plan even though JazzCash
    // doesn't echo arbitrary metadata. The callback re-verifies the signed hash
    // before trusting any of it — these params alone can't fake a payment.
    const callbackUrl =
      `${base}/api/billing/jazzcash/callback` +
      `?tenantId=${encodeURIComponent(user.tenantId)}` +
      `&planId=${encodeURIComponent(plan.id)}` +
      `&txnRef=${encodeURIComponent(txnRef)}`;

    const form = buildJazzCashForm({
      amountPkr: plan.priceCents / 100,
      txnRef,
      billRef: `PLAN-${plan.id.slice(0, 8)}`,
      description: `Subscription: ${plan.name}`,
      returnUrl: callbackUrl,
    });

    // ALS tenant context can be lost across the awaits above; wrap the scoped
    // audit write in the tenant context explicitly (recurring gotcha in this repo).
    await runWithTenant(user.tenantId, () =>
      audit({
        actor: user,
        action: "billing.jazzcash_started",
        entity: "Tenant",
        entityId: user.tenantId,
        summary: `${user.name} started a JazzCash payment for ${plan.name}`,
        detail: { planId: plan.id, txnRef },
      }),
    );

    return NextResponse.json({ endpoint: form.endpoint, fields: form.fields });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (e?.message === "PLATFORM_ONLY")
      return NextResponse.json({ error: "Not available to platform operators." }, { status: 403 });
    if (e instanceof z.ZodError)
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    console.error("[billing.jazzcash.checkout]", e);
    return NextResponse.json({ error: "Could not start JazzCash payment" }, { status: 500 });
  }
}
