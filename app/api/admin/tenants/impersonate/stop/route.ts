import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { adminDb } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { runWithTenant } from "@/lib/tenantContext";

const SESSION_COOKIE = "twayclick_session";

// Stop impersonating: the current session is an impersonation session (a tenant
// user with `impersonatedBy` set to a System Owner). Tear it DOWN completely and
// mint a fresh System Owner session, so the operator returns to the platform
// area with no lingering tenant access.
//
// Security: we delete the impersonation Session row (not just clear the cookie)
// and verify the operator is still a valid System Owner before re-minting — a
// leftover tenant session must never survive the stop. No requireSystemOwner()
// here because the CURRENT identity is the impersonated tenant user, not the
// System Owner; we recover the operator from session.impersonatedBy.
export async function POST() {
  try {
    const store = await cookies();
    const token = store.get(SESSION_COOKIE)?.value;
    if (!token) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }

    const session = await adminDb.session.findUnique({
      where: { token },
      select: { id: true, impersonatedBy: true, tenantId: true },
    });
    if (!session || !session.impersonatedBy) {
      return NextResponse.json(
        { error: "Not an impersonation session" },
        { status: 400 },
      );
    }

    // The operator who started the impersonation must still be a valid,
    // enabled System Owner to return to the platform.
    const operator = await adminDb.user.findUnique({
      where: { id: session.impersonatedBy },
      select: { id: true, name: true, role: true, tenantId: true, isSystemOwner: true, disabledAt: true },
    });
    if (!operator || !operator.isSystemOwner || operator.disabledAt) {
      // Can't safely return them to the platform — just sign out entirely.
      await adminDb.session.delete({ where: { id: session.id } });
      store.delete(SESSION_COOKIE);
      return NextResponse.json({ ok: true, signedOut: true });
    }

    // Audit the end of impersonation under the tenant it happened in.
    await runWithTenant(session.tenantId, () =>
      audit({
        actor: { id: operator.id, name: operator.name, role: operator.role },
        action: "tenant.impersonate",
        entity: "Session",
        entityId: session.id,
        summary: `${operator.name} stopped impersonating`,
        detail: { stopped: true },
      }),
    );

    // TEAR DOWN the impersonation session completely, then mint a fresh System
    // Owner session (in the system tenant). createSession overwrites the cookie.
    await adminDb.session.delete({ where: { id: session.id } });
    await createSession(operator.id, operator.tenantId);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("[impersonate.stop]", e);
    return NextResponse.json({ error: "Could not stop" }, { status: 500 });
  }
}
