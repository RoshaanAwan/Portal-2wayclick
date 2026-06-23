import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePlatformAdmin } from "@/lib/auth";
import { setTenantStatus } from "@/lib/platform";
import { adminDb } from "@/lib/db";
import { audit } from "@/lib/audit";
import { runWithTenant } from "@/lib/tenantContext";

// Platform-admin only: suspend or reactivate a tenant. A suspended tenant is
// blocked at middleware (its subdomain shows a "suspended" page).
const schema = z.object({
  tenantId: z.string().min(1),
  status: z.enum(["active", "suspended"]),
});

export async function POST(req: Request) {
  try {
    const platformAdmin = await requirePlatformAdmin();
    const { tenantId, status } = schema.parse(await req.json());

    const tenant = await adminDb.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
    }

    await setTenantStatus(tenantId, status);

    await runWithTenant(tenantId, () =>
      audit({
        actor: {
          id: platformAdmin.id,
          name: platformAdmin.name,
          role: platformAdmin.role,
        },
        action: status === "suspended" ? "tenant.suspend" : "tenant.reactivate",
        entity: "Tenant",
        entityId: tenantId,
        summary: `${platformAdmin.name} ${status === "suspended" ? "suspended" : "reactivated"} tenant "${tenant.name}"`,
      }),
    );

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (e?.message === "FORBIDDEN")
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (e instanceof z.ZodError)
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    console.error("[tenant.status]", e);
    return NextResponse.json({ error: "Could not update tenant" }, { status: 500 });
  }
}
