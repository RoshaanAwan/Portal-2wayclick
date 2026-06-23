import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSystemOwner, mintSession } from "@/lib/auth";
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
    const systemOwner = await requireSystemOwner();
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

    // Mint the impersonation session row but DON'T set the cookie here — the
    // System Owner is on the platform host, and the session cookie is host-scoped
    // (no parent domain, to preserve tenant isolation). So the client redirects
    // to a CLAIM url on the TARGET subdomain, which sets the cookie there.
    const { token } = await mintSession(
      target.id,
      target.tenantId,
      systemOwner.id,
    );

    await runWithTenant(target.tenantId, () =>
      audit({
        actor: {
          id: systemOwner.id,
          name: systemOwner.name,
          role: systemOwner.role,
        },
        action: "tenant.impersonate",
        entity: "User",
        entityId: target.id,
        targetUserId: target.id,
        summary: `${systemOwner.name} started impersonating ${target.name} in tenant "${target.tenant.name}"`,
      }),
    );

    return NextResponse.json({
      ok: true,
      subdomain: target.tenant.subdomain,
      // Single-use claim token; the client navigates to the target subdomain's
      // claim route which sets the host-scoped cookie and lands on /dashboard.
      claimToken: token,
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
