import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSystemOwner } from "@/lib/auth";
import { createTenant, isValidSubdomain } from "@/lib/platform";
import { audit } from "@/lib/audit";
import { runWithTenant } from "@/lib/tenantContext";

// Platform-admin only: provision a new tenant + its first SUPER_ADMIN.
const schema = z.object({
  name: z.string().trim().min(2).max(120),
  subdomain: z.string().trim().toLowerCase().min(1).max(32),
  adminName: z.string().trim().min(2).max(120),
  adminEmail: z.string().trim().toLowerCase().email(),
  adminPassword: z.string().min(8).max(200),
  // Free-trial length granted to this workspace (0 = none).
  trialDays: z.number().int().min(0).max(365).default(0),
});

export async function POST(req: Request) {
  try {
    const systemOwner = await requireSystemOwner();
    const data = schema.parse(await req.json());

    if (!isValidSubdomain(data.subdomain)) {
      return NextResponse.json(
        { error: "Subdomain must be lowercase letters/numbers/hyphens and not reserved." },
        { status: 400 },
      );
    }

    const tenant = await createTenant(data);

    // Record the provisioning against the NEW tenant's audit log.
    await runWithTenant(tenant.id, () =>
      audit({
        actor: {
          id: systemOwner.id,
          name: systemOwner.name,
          role: systemOwner.role,
        },
        action: "tenant.create",
        entity: "Tenant",
        entityId: tenant.id,
        summary: `${systemOwner.name} created tenant "${tenant.name}" (${tenant.subdomain})${
          data.trialDays > 0 ? ` with a ${data.trialDays}-day trial` : ""
        }`,
        detail: { trialDays: data.trialDays },
      }),
    );

    return NextResponse.json({ ok: true, id: tenant.id });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (e?.message === "FORBIDDEN")
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (e?.message === "SUBDOMAIN_TAKEN")
      return NextResponse.json({ error: "That subdomain is taken." }, { status: 409 });
    if (e instanceof z.ZodError)
      return NextResponse.json({ error: e.errors[0]?.message ?? "Invalid input" }, { status: 400 });
    console.error("[tenant.create]", e);
    return NextResponse.json({ error: "Could not create tenant" }, { status: 500 });
  }
}
