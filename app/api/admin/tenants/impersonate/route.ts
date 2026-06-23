import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePlatformAdmin, createSession } from "@/lib/auth";
import { adminDb } from "@/lib/db";
import { audit } from "@/lib/audit";
import { runWithTenant } from "@/lib/tenantContext";

// Platform-admin only: start impersonating a user in some tenant. Mints a session
// for that user, stamped with impersonatedBy = the platform admin's id (drives
// the persistent banner + audit trail). The session is tenant-bound and the
// cookie is host-scoped, so it only works on the target tenant's subdomain — the
// caller redirects there. Returns the subdomain so the client can navigate.
const schema = z.object({ userId: z.string().min(1) });

export async function POST(req: Request) {
  try {
    const platformAdmin = await requirePlatformAdmin();
    const { userId } = schema.parse(await req.json());

    const target = await adminDb.user.findUnique({
      where: { id: userId },
      include: { tenant: true },
    });
    if (!target) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    if (target.disabledAt) {
      return NextResponse.json(
        { error: "That account is disabled." },
        { status: 409 },
      );
    }

    // Mint the impersonation session (replaces the platform admin's cookie on
    // this browser; they re-authenticate or use a separate browser to return).
    await createSession(target.id, target.tenantId, platformAdmin.id);

    await runWithTenant(target.tenantId, () =>
      audit({
        actor: {
          id: platformAdmin.id,
          name: platformAdmin.name,
          role: platformAdmin.role,
        },
        action: "tenant.impersonate",
        entity: "User",
        entityId: target.id,
        targetUserId: target.id,
        summary: `${platformAdmin.name} started impersonating ${target.name} in tenant "${target.tenant.name}"`,
      }),
    );

    return NextResponse.json({
      ok: true,
      subdomain: target.tenant.subdomain,
    });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (e?.message === "FORBIDDEN")
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (e instanceof z.ZodError)
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    console.error("[tenant.impersonate]", e);
    return NextResponse.json({ error: "Could not impersonate" }, { status: 500 });
  }
}
