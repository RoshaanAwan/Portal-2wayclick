import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSystemOwner } from "@/lib/auth";
import { setPlanActive } from "@/lib/plans";
import { audit } from "@/lib/audit";
import { runWithTenant } from "@/lib/tenantContext";
import { SYSTEM_TENANT_ID } from "@/lib/platform";

// System Owner only: archive (soft-delete) or restore a package. Archiving stops
// new subscriptions; existing subscribers keep their plan.
const schema = z.object({
  id: z.string().min(1),
  active: z.boolean(),
});

export async function POST(req: Request) {
  try {
    const systemOwner = await requireSystemOwner();
    const { id, active } = schema.parse(await req.json());

    const plan = await setPlanActive(id, active);

    await runWithTenant(SYSTEM_TENANT_ID, () =>
      audit({
        actor: { id: systemOwner.id, name: systemOwner.name, role: systemOwner.role },
        action: active ? "plan.restore" : "plan.archive",
        entity: "Plan",
        entityId: plan.id,
        summary: `${systemOwner.name} ${active ? "restored" : "archived"} plan "${plan.name}"`,
      }),
    );

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (e?.message === "FORBIDDEN")
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (e?.message === "PLAN_NOT_FOUND")
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    if (e instanceof z.ZodError)
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    console.error("[plan.status]", e);
    return NextResponse.json({ error: "Could not update plan" }, { status: 500 });
  }
}
