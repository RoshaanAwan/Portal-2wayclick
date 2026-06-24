import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSystemOwner } from "@/lib/auth";
import { createPlan } from "@/lib/plans";
import { audit } from "@/lib/audit";
import { runWithTenant } from "@/lib/tenantContext";
import { SYSTEM_TENANT_ID } from "@/lib/platform";

// System Owner only: create a subscription package (+ its Stripe Product/Price).
const schema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).optional().transform((v) => v || null),
  priceCents: z.number().int().min(0).max(100_000_000),
  currency: z.string().trim().toLowerCase().length(3).default("usd"),
  interval: z.enum(["month", "year"]),
  trialDays: z.number().int().min(0).max(365).default(0),
  maxUsers: z.number().int().min(1).max(1_000_000).nullable().optional(),
  features: z.array(z.string().trim().max(200)).max(50).default([]),
});

export async function POST(req: Request) {
  try {
    const systemOwner = await requireSystemOwner();
    const data = schema.parse(await req.json());

    const plan = await createPlan({
      ...data,
      maxUsers: data.maxUsers ?? null,
    });

    // Platform action — audit it in the reserved system tenant's log.
    await runWithTenant(SYSTEM_TENANT_ID, () =>
      audit({
        actor: { id: systemOwner.id, name: systemOwner.name, role: systemOwner.role },
        action: "plan.create",
        entity: "Plan",
        entityId: plan.id,
        summary: `${systemOwner.name} created plan "${plan.name}"`,
        detail: { priceCents: plan.priceCents, interval: plan.interval, sellable: plan.sellable },
      }),
    );

    return NextResponse.json({ ok: true, id: plan.id, sellable: plan.sellable });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (e?.message === "FORBIDDEN")
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (e instanceof z.ZodError)
      return NextResponse.json({ error: e.errors[0]?.message ?? "Invalid input" }, { status: 400 });
    console.error("[plan.create]", e);
    return NextResponse.json({ error: "Could not create plan" }, { status: 500 });
  }
}
