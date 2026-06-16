import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { can } from "@/lib/permissions";

// ── Edit / delete a project ─────────────────────────────────────────────────
// Admins-only, like the rest of project management (can.manageProjects).
//   • PATCH  → rename / re-describe the project (board name kept in sync).
//   • DELETE → remove the project. The board (and its lists/tasks) cascades via
//     the schema's onDelete: Cascade on Project → Board.

const updateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).optional().or(z.literal("")),
});

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
    const { name, description } = updateSchema.parse(await req.json());

    const project = await db.project.findUnique({
      where: { id },
      select: { id: true, boardId: true },
    });
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Rename the project and keep its board's name aligned.
    await db.$transaction([
      db.project.update({
        where: { id },
        data: { name, description: description ? description : null },
      }),
      db.board.update({ where: { id: project.boardId }, data: { name } }),
    ]);

    await audit({
      actor,
      action: "project.update",
      entity: "Project",
      entityId: id,
      summary: `${actor.name} updated project “${name}”`,
      detail: { name },
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireUser();
    if (!can.manageProjects(actor.role)) {
      return NextResponse.json({ error: "Admins only" }, { status: 403 });
    }

    const { id } = await params;

    const project = await db.project.findUnique({
      where: { id },
      select: { id: true, name: true, boardId: true },
    });
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Deleting the project cascades its members, client submissions, and share
    // link. The board is a separate row referenced by the project, so remove it
    // explicitly afterward — its lists and tasks cascade from there.
    await db.project.delete({ where: { id } });
    await db.board.delete({ where: { id: project.boardId } });

    await audit({
      actor,
      action: "project.delete",
      entity: "Project",
      entityId: id,
      summary: `${actor.name} deleted project “${project.name}”`,
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
