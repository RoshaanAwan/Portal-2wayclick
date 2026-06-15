import { NextResponse } from "next/server";
import { getCurrentUser, destroySession } from "@/lib/auth";
import { audit } from "@/lib/audit";

export async function POST() {
  // Capture who is logging out before we tear the session down.
  const user = await getCurrentUser();
  await destroySession();

  if (user) {
    await audit({
      actor: { id: user.id, name: user.name, role: user.role },
      action: "auth.logout",
      entity: "Session",
      targetUserId: user.id,
      summary: `${user.name} signed out`,
    });
  }

  return NextResponse.json({ ok: true });
}
