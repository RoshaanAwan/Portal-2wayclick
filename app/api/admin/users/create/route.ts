import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantUser, hashPassword } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { recordActivity } from "@/lib/activityFeed";
import {
  ROLES,
  ROLE_LABELS,
  canCreateUsers,
  canCreateUserWithRole,
} from "@/lib/permissions";
import { DEPARTMENTS } from "@/lib/constants";

const schema = z.object({
  name: z.string().trim().min(2, "Name is required").max(120),
  email: z.string().trim().toLowerCase().email("Valid email required"),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
  role: z.enum(ROLES),
  // Job title is optional in the form. The client sends "" for a blank field,
  // so normalize empty/whitespace to undefined before validating the length —
  // otherwise "" trips .min(1) ("String must contain at least 1 character(s)").
  title: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((v) => (v ? v : undefined)),
  department: z.enum(DEPARTMENTS).optional(),
});

export async function POST(req: Request) {
  try {
    const actor = await requireTenantUser();

    // 1. Can this actor create users at all?
    if (!canCreateUsers(actor.role)) {
      return NextResponse.json(
        { error: "You do not have permission to create users." },
        { status: 403 },
      );
    }

    const data = schema.parse(await req.json());

    // 2. Is the actor allowed to assign THIS specific role?
    //    (SUPER_ADMIN → any non-super role; ADMIN → HR/LEAD/PM/EMPLOYEE.)
    if (!canCreateUserWithRole(actor.role, data.role)) {
      return NextResponse.json(
        { error: `You cannot create a user with the ${ROLE_LABELS[data.role]} role.` },
        { status: 403 },
      );
    }

    // 3. Email must be unique *within the tenant* (email is now per-tenant
    //    unique: @@unique([tenantId, email])). findFirst is auto-scoped to the
    //    actor's tenant, so this checks for a clash inside this tenant only.
    const existing = await db.user.findFirst({ where: { email: data.email } });
    if (existing) {
      return NextResponse.json(
        { error: "A user with that email already exists." },
        { status: 409 },
      );
    }

    const passwordHash = await hashPassword(data.password);

    const created = await db.user.create({
      data: {
        // New user joins the SAME tenant as the admin creating them.
        tenantId: actor.tenantId,
        name: data.name,
        email: data.email,
        passwordHash,
        role: data.role,
        title: data.title?.trim() || ROLE_LABELS[data.role],
        department: data.department ?? "Executive",
      },
      select: { id: true, name: true, email: true, role: true, title: true },
    });

    // 4. Audit trail (the "track everything" requirement) — never log the
    //    password, only that one was set.
    await audit({
      actor,
      action: "user.create",
      entity: "User",
      entityId: created.id,
      targetUserId: created.id,
      summary: `${actor.name} created ${created.name} (${ROLE_LABELS[created.role as keyof typeof ROLE_LABELS]})`,
      detail: {
        email: created.email,
        role: created.role,
        title: data.title ?? null,
        department: data.department ?? null,
      },
    });

    // 5. Social feed entry (the dashboard "joined" activity). The actor IS the
    //    new hire — they have no avatar yet, so the wall shows their initials.
    await recordActivity({
      actor: { id: created.id, name: created.name, title: created.title, avatarUrl: null },
      verb: "joined",
      target: "the workspace",
    });

    return NextResponse.json({ ok: true, id: created.id });
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
