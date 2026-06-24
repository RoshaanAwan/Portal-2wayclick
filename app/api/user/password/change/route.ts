import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantUser, hashPassword, verifyPassword } from "@/lib/auth";
import { currentSessionToken } from "@/lib/session";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";

// Self-serve password change: the signed-in user rotates their own password.
// We verify the current password (so a hijacked session can't silently lock the
// real owner out), set the new hash, and revoke every *other* session — the
// current device stays signed in, anyone else gets kicked.

const schema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password"),
    newPassword: z
      .string()
      .min(8, "New password must be at least 8 characters")
      .max(200, "Password is too long"),
    confirmPassword: z.string().min(1, "Confirm your new password"),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "New passwords don't match",
    path: ["confirmPassword"],
  })
  .refine((d) => d.currentPassword !== d.newPassword, {
    message: "New password must be different from the current one",
    path: ["newPassword"],
  });

export async function POST(req: Request) {
  try {
    const actor = await requireTenantUser();
    const { currentPassword, newPassword } = schema.parse(await req.json());

    // requireTenantUser strips passwordHash, so re-read it for verification.
    const record = await db.user.findUnique({
      where: { id: actor.id },
      select: { passwordHash: true },
    });
    if (!record) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ok = await verifyPassword(currentPassword, record.passwordHash);
    if (!ok) {
      return NextResponse.json(
        { error: "Current password is incorrect" },
        { status: 400 },
      );
    }

    const passwordHash = await hashPassword(newPassword);
    await db.user.update({
      where: { id: actor.id },
      data: { passwordHash },
    });

    // Revoke other sessions so a changed password actually logs everyone else
    // out — but keep this device signed in.
    const currentToken = await currentSessionToken();
    await db.session.deleteMany({
      where: {
        userId: actor.id,
        ...(currentToken ? { token: { not: currentToken } } : {}),
      },
    });

    await audit({
      actor,
      action: "user.password_change",
      entity: "User",
      entityId: actor.id,
      targetUserId: actor.id,
      summary: `${actor.name} changed their password`,
      // Never log password material — just that it happened.
      detail: { revokedOtherSessions: true },
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (e?.name === "ZodError") {
      return NextResponse.json(
        { error: e.errors?.[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }
    console.error("[password.change]", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
