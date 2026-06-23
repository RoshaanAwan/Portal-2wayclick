import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import {
  ROLES,
  ROLE_LABELS,
  canManageUser,
  canCreateUserWithRole,
} from "@/lib/permissions";
import { DEPARTMENTS } from "@/lib/constants";

const schema = z.object({
  name: z.string().trim().min(2, "Name is required").max(120),
  title: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((v) => (v ? v : undefined)),
  department: z.enum(DEPARTMENTS),
  role: z.enum(ROLES),
});

// Edit a user's profile fields and role. Admin tier only, gated by
// canManageUser (never yourself, never someone at/above your authority), and a
// role can only be assigned if the actor is allowed to grant it.
export async function POST(
  req: Request,
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

    const data = schema.parse(await req.json());

    // Changing the role is only allowed if the actor may assign that role.
    if (data.role !== target.role && !canCreateUserWithRole(actor.role, data.role)) {
      return NextResponse.json(
        { error: `You cannot assign the ${ROLE_LABELS[data.role]} role.` },
        { status: 403 },
      );
    }

    const updated = await db.user.update({
      where: { id },
      data: {
        name: data.name,
        title: data.title?.trim() || ROLE_LABELS[data.role],
        department: data.department,
        role: data.role,
      },
      select: { id: true, name: true, role: true },
    });

    const roleChanged = data.role !== target.role;
    await audit({
      actor,
      action: roleChanged ? "user.role_change" : "user.update",
      entity: "User",
      entityId: updated.id,
      targetUserId: updated.id,
      summary: roleChanged
        ? `${actor.name} changed ${updated.name}'s role to ${ROLE_LABELS[data.role]}`
        : `${actor.name} updated ${updated.name}'s profile`,
      detail: {
        name: data.name,
        title: data.title ?? null,
        department: data.department,
        role: data.role,
        previousRole: target.role,
      },
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
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
