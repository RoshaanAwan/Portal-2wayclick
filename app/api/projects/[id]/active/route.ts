import { NextResponse } from "next/server";
import { z } from "zod";
import { revalidateTag } from "next/cache";
import { requireTenantUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { can } from "@/lib/permissions";

// PATCH /api/projects/[id]/active — toggle a project's `active` flag. Admin tier
// (can.manageProjects), same gate as the rest of project management. Super
// admins are inherently part of that tier, so their toggle takes effect
// immediately with no extra approval step. Deactivating only marks the project
// inactive (an "Inactive" badge); nothing is hidden or locked.
const patchSchema = z.object({ active: z.boolean() });

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireTenantUser();
    if (!can.manageProjects(actor.role)) {
      return NextResponse.json({ error: "Admins only" }, { status: 403 });
    }

    const { id } = await params;
    const { active } = patchSchema.parse(await req.json());

    const project = await db.project.findUnique({
      where: { id },
      select: { id: true, name: true, active: true },
    });
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    await db.project.update({ where: { id }, data: { active } });

    await audit({
      actor,
      action: active ? "project.activate" : "project.deactivate",
      entity: "Project",
      entityId: id,
      summary: `${actor.name} ${active ? "activated" : "deactivated"} project “${project.name}”`,
      detail: { active },
    });

    revalidateTag(`projects:${actor.tenantId}`, "default");
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (e?.name === "ZodError")
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    console.error("[projects.active]", e);
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
