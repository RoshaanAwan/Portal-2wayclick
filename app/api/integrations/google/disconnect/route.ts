import { NextResponse } from "next/server";
import { requireTenantUser } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/permissions";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { runWithTenant } from "@/lib/tenantContext";
import { open } from "@/lib/cryptoBox";
import { revokeToken } from "@/lib/integrations/google";

// Disconnects the tenant's Drive (the Company Owner's connection): revokes the
// token at Google (best-effort) and deletes the stored connection. Owner only.
// Idempotent.

export async function POST() {
  try {
    const user = await requireTenantUser();
    if (!isSuperAdmin(user.role)) {
      return NextResponse.json(
        { error: "Only the company owner can disconnect the workspace Drive." },
        { status: 403 },
      );
    }

    const conn = await db.googleDriveConnection.findUnique({
      where: { userId: user.id },
      select: { id: true, refreshToken: true },
    });
    if (!conn) return NextResponse.json({ ok: true }); // already gone

    const refresh = open(conn.refreshToken);
    if (refresh) await revokeToken(refresh);

    await db.googleDriveConnection.delete({ where: { userId: user.id } });

    await runWithTenant(user.tenantId, () =>
      audit({
        actor: user,
        action: "integration.update",
        entity: "GoogleDriveConnection",
        entityId: user.id,
        targetUserId: user.id,
        summary: `${user.name} disconnected their Google Drive`,
      }),
    );

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[google.disconnect]", e);
    return NextResponse.json({ error: "Disconnect failed" }, { status: 500 });
  }
}
