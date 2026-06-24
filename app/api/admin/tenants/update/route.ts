import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSystemOwner } from "@/lib/auth";
import { updateTenant } from "@/lib/platform";
import { adminDb } from "@/lib/db";
import { audit } from "@/lib/audit";
import { runWithTenant } from "@/lib/tenantContext";

const schema = z.object({
  tenantId: z.string().min(1),
  name: z.string().min(1).max(100),
  subdomain: z.string().min(1).max(32),
});

export async function POST(req: Request) {
  try {
    const systemOwner = await requireSystemOwner();
    const { tenantId, name, subdomain } = schema.parse(await req.json());

    const tenant = await adminDb.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
    }

    await updateTenant(tenantId, { name, subdomain });

    await runWithTenant(tenantId, () =>
      audit({
        actor: { id: systemOwner.id, name: systemOwner.name, role: systemOwner.role },
        action: "tenant.update",
        entity: "Tenant",
        entityId: tenantId,
        summary: `${systemOwner.name} updated tenant "${tenant.name}" → name: "${name}", subdomain: "${subdomain}"`,
      }),
    );

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (e?.message === "FORBIDDEN")
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (e?.message === "SUBDOMAIN_TAKEN")
      return NextResponse.json({ error: "Subdomain already in use" }, { status: 409 });
    if (e?.message === "SUBDOMAIN_INVALID")
      return NextResponse.json({ error: "Invalid subdomain" }, { status: 400 });
    if (e instanceof z.ZodError)
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    console.error("[tenant.update]", e);
    return NextResponse.json({ error: "Could not update tenant" }, { status: 500 });
  }
}
