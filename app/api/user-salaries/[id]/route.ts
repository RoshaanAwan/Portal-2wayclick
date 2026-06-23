import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { can } from "@/lib/permissions";

// PATCH /api/user-salaries/[id] — toggle a user salary's active flag. Admin tier.
const patchSchema = z.object({ active: z.boolean() });

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireTenantUser();
    if (!can.manageFinance(actor.role)) {
      return NextResponse.json({ error: "Admins only" }, { status: 403 });
    }

    const { id } = await params;
    const { active } = patchSchema.parse(await req.json());

    const existing = await db.userSalary.findUnique({
      where: { id },
      select: { id: true, userId: true, user: { select: { name: true } } },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await db.userSalary.update({ where: { id }, data: { active } });

    await audit({
      actor,
      action: "salary.deactivate",
      entity: "UserSalary",
      entityId: id,
      targetUserId: existing.userId,
      summary: `${actor.name} ${active ? "re-activated" : "deactivated"} ${existing.user.name}'s monthly salary`,
      detail: { active },
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (e?.name === "ZodError")
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    console.error("[user-salaries.patch]", e);
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}

// DELETE /api/user-salaries/[id] — remove a user salary entirely. Admin tier.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireTenantUser();
    if (!can.manageFinance(actor.role)) {
      return NextResponse.json({ error: "Admins only" }, { status: 403 });
    }

    const { id } = await params;
    const existing = await db.userSalary.findUnique({
      where: { id },
      select: { id: true, userId: true, user: { select: { name: true } } },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await db.userSalary.delete({ where: { id } });

    await audit({
      actor,
      action: "salary.delete",
      entity: "UserSalary",
      entityId: id,
      targetUserId: existing.userId,
      summary: `${actor.name} removed ${existing.user.name}'s monthly salary`,
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[user-salaries.delete]", e);
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
