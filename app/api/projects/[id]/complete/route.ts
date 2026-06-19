import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { can } from "@/lib/permissions";

// PATCH /api/projects/[id]/complete — mark a project completed or reopen it.
// Admin tier (can.manageProjects), same gate as the rest of project management.
// `completed: true` sets completedAt to now; `false` clears it (reopen).
// Independent of the `active` flag — completing doesn't hide or lock anything.
const patchSchema = z.object({ completed: z.boolean() });

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireUser();
    if (!can.manageProjects(actor.role)) {
      return NextResponse.json({ error: "Admins only" }, { status: 403 });
    }

    const { id } = await params;
    const { completed } = patchSchema.parse(await req.json());

    const project = await db.project.findUnique({
      where: { id },
      select: { id: true, name: true, completedAt: true },
    });
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    await db.project.update({
      where: { id },
      data: { completedAt: completed ? new Date() : null },
    });

    await audit({
      actor,
      action: completed ? "project.complete" : "project.reopen",
      entity: "Project",
      entityId: id,
      summary: `${actor.name} ${completed ? "marked" : "reopened"} project “${project.name}”${completed ? " as completed" : ""}`,
      detail: { completed },
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (e?.name === "ZodError")
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    console.error("[projects.complete]", e);
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
