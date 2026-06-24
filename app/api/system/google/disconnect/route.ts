import { NextResponse } from "next/server";
import { requireSystemOwner } from "@/lib/auth";
import { adminDb } from "@/lib/db";
import { open } from "@/lib/cryptoBox";
import { revokeToken } from "@/lib/integrations/google";

// POST /api/system/google/disconnect — revoke and delete the System Owner's Drive connection.
export async function POST() {
  try {
    const actor = await requireSystemOwner();

    const conn = await adminDb.googleDriveConnection.findUnique({
      where: { userId: actor.id },
      select: { id: true, refreshToken: true },
    });
    if (!conn) return NextResponse.json({ ok: true });

    const refresh = open(conn.refreshToken);
    if (refresh) await revokeToken(refresh).catch(() => {});

    await adminDb.googleDriveConnection.delete({ where: { userId: actor.id } });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED" || e?.message === "FORBIDDEN")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[system.google.disconnect]", e);
    return NextResponse.json({ error: "Disconnect failed" }, { status: 500 });
  }
}
