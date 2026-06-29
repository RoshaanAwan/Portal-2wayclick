import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { can } from "@/lib/permissions";
import { z } from "zod";

const schema = z.object({
  listId: z.string().min(1),
  name: z.string().trim().min(1).max(80),
});

// Rename a board column (BoardList). Mirrors list/create's auth: the list's board
// must belong to a project the user is a member of (or a projects-managing admin).
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const { listId, name } = schema.parse(await req.json());

    // Resolve the list → board → project for the membership check.
    const list = await db.boardList.findUnique({
      where: { id: listId },
      select: {
        id: true,
        name: true,
        board: { select: { project: { select: { id: true } } } },
      },
    });
    if (!list?.board?.project) {
      return NextResponse.json({ error: "List not found" }, { status: 404 });
    }
    const projectId = list.board.project.id;

    if (!can.manageProjects(user.role)) {
      const membership = await db.projectMember.findUnique({
        where: { projectId_userId: { projectId, userId: user.id } },
      });
      if (!membership) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    // No-op rename (same name) → succeed without an audit row.
    if (list.name === name) return NextResponse.json({ ok: true });

    await db.boardList.update({ where: { id: listId }, data: { name } });

    await audit({
      actor: user,
      action: "project.list_rename",
      entity: "BoardList",
      entityId: listId,
      summary: `${user.name} renamed list “${list.name}” → “${name}” in project ${projectId}`,
      detail: { from: list.name, to: name, projectId },
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
