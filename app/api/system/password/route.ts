import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { requireSystemOwner, hashPassword, verifyPassword } from "@/lib/auth";
import { adminDb } from "@/lib/db";

const SESSION_COOKIE = "twayclick_session";

const schema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password"),
    newPassword: z.string().min(8, "New password must be at least 8 characters").max(200),
    confirmPassword: z.string().min(1),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "New passwords don't match",
    path: ["confirmPassword"],
  })
  .refine((d) => d.currentPassword !== d.newPassword, {
    message: "New password must be different from the current one",
    path: ["newPassword"],
  });

// POST /api/system/password — System Owner changes their own password.
export async function POST(req: Request) {
  try {
    const actor = await requireSystemOwner();
    const { currentPassword, newPassword } = schema.parse(await req.json());

    const record = await adminDb.user.findUnique({
      where: { id: actor.id },
      select: { passwordHash: true },
    });
    if (!record) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const ok = await verifyPassword(currentPassword, record.passwordHash);
    if (!ok)
      return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });

    const passwordHash = await hashPassword(newPassword);
    await adminDb.user.update({ where: { id: actor.id }, data: { passwordHash } });

    // Revoke all other sessions, keep this one.
    const cookieStore = await cookies();
    const currentToken = cookieStore.get(SESSION_COOKIE)?.value;
    await adminDb.session.deleteMany({
      where: {
        userId: actor.id,
        ...(currentToken ? { token: { not: currentToken } } : {}),
      },
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED" || e?.message === "FORBIDDEN")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (e?.name === "ZodError")
      return NextResponse.json({ error: e.errors?.[0]?.message ?? "Invalid input" }, { status: 400 });
    console.error("[system.password]", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
