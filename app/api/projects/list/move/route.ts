import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { can } from "@/lib/permissions";
import { z } from "zod";

// Reorder a list (column) within its board. The client sends the ids of the
// lists that should sit immediately before / after the dropped list (either may
// be null at an edge); we compute a fractional position between them so the
// other columns never need rewriting — same scheme as card moves.
const schema = z.object({
  listId: z.string().min(1),
  beforeId: z.string().nullable().optional(),
  afterId: z.string().nullable().optional(),
});

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const { listId, beforeId, afterId } = schema.parse(await req.json());

    const list = await db.boardList.findUnique({
      where: { id: listId },
      select: {
        id: true,
        name: true,
        boardId: true,
        board: { select: { project: { select: { id: true } } } },
      },
    });
    if (!list) {
      return NextResponse.json({ error: "List not found" }, { status: 404 });
    }

    // Project boards require manage-projects or membership; the global board
    // (no project) is open to any authenticated user, matching card moves.
    const projectId = list.board.project?.id ?? null;
    if (projectId && !can.manageProjects(user.role)) {
      const membership = await db.projectMember.findUnique({
        where: { projectId_userId: { projectId, userId: user.id } },
      });
      if (!membership) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    // Resolve neighbor positions within the same board. Scoping the lookup to
    // listId + boardId guards against a stale/foreign neighbor id.
    const [before, after] = await Promise.all([
      beforeId
        ? db.boardList.findFirst({
            where: { id: beforeId, boardId: list.boardId },
            select: { position: true },
          })
        : Promise.resolve(null),
      afterId
        ? db.boardList.findFirst({
            where: { id: afterId, boardId: list.boardId },
            select: { position: true },
          })
        : Promise.resolve(null),
    ]);

    let position: number;
    if (before && after) {
      position = (before.position + after.position) / 2;
    } else if (before) {
      position = before.position + 1000;
    } else if (after) {
      position = after.position - 1000;
    } else {
      position = 1000;
    }

    await db.boardList.update({ where: { id: listId }, data: { position } });

    await audit({
      actor: user,
      action: "project.list_move",
      entity: "BoardList",
      entityId: list.id,
      summary: `${user.name} reordered list “${list.name}”`,
      detail: { boardId: list.boardId, projectId, position },
    });

    return NextResponse.json({ ok: true, position });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
