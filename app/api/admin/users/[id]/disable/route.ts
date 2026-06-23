import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { canManageUser } from "@/lib/permissions";

const schema = z.object({ disabled: z.boolean() });

// Toggle a user's access. Disabling sets disabledAt and revokes every active
// session immediately (so they're kicked out, not just blocked at next login).
// Enabling clears disabledAt. Admin tier only, gated by canManageUser.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireTenantUser();
    const { id } = await params;

    const target = await db.user.findUnique({
      where: { id },
      select: { id: true, name: true, role: true, disabledAt: true },
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

    const { disabled } = schema.parse(await req.json());

    if (disabled) {
      // Set the flag and revoke sessions in one transaction so access is cut
      // atomically.
      await db.$transaction([
        db.user.update({
          where: { id },
          data: { disabledAt: new Date() },
        }),
        db.session.deleteMany({ where: { userId: id } }),
      ]);
    } else {
      await db.user.update({
        where: { id },
        data: { disabledAt: null },
      });
    }

    await audit({
      actor,
      action: disabled ? "user.disable" : "user.enable",
      entity: "User",
      entityId: target.id,
      targetUserId: target.id,
      summary: `${actor.name} ${disabled ? "disabled" : "re-enabled"} ${target.name}`,
    });

    return NextResponse.json({ ok: true, disabled });
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
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
