import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { requireTenantUser, hashPassword } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { canManageUser } from "@/lib/permissions";

/** Readable-but-strong temporary password (no ambiguous chars). */
function genTempPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(14);
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += chars[bytes[i] % chars.length];
  return out + "!7";
}

// Reset another user's password to a fresh temporary one. The plaintext is
// returned ONCE for the admin to hand over; it is never stored or logged. Also
// revokes the user's sessions so the old password can't keep a session alive.
// Admin tier only, gated by canManageUser.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireTenantUser();
    const { id } = await params;

    const target = await db.user.findUnique({
      where: { id },
      select: { id: true, name: true, role: true },
    });
    if (!target) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    if (!canManageUser(actor, target)) {
      return NextResponse.json(
        { error: "You do not have permission to manage this user." },
        { status: 403 },
      );
    }

    const tempPassword = genTempPassword();
    const passwordHash = await hashPassword(tempPassword);

    await db.$transaction([
      db.user.update({ where: { id }, data: { passwordHash } }),
      // Invalidate existing sessions — the old credentials are gone.
      db.session.deleteMany({ where: { userId: id } }),
    ]);

    await audit({
      actor,
      action: "user.password_reset",
      entity: "User",
      entityId: target.id,
      targetUserId: target.id,
      // Never log the password itself — only that one was reset.
      summary: `${actor.name} reset ${target.name}'s password`,
    });

    return NextResponse.json({ ok: true, password: tempPassword });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
