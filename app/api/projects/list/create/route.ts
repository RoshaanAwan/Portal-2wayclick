import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";

const schema = z.object({
  boardId: z.string().min(1),
  name: z.string().trim().min(1).max(80),
});

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const { boardId, name } = schema.parse(await req.json());

    // The board must belong to a project the user is a member of (or admin).
    const board = await db.board.findUnique({
      where: { id: boardId },
      select: { id: true, project: { select: { id: true } } },
    });
    if (!board?.project) {
      return NextResponse.json({ error: "Board not found" }, { status: 404 });
    }

    if (user.role !== "ADMIN") {
      const membership = await db.projectMember.findUnique({
        where: {
          projectId_userId: { projectId: board.project.id, userId: user.id },
        },
      });
      if (!membership) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    // New lists go to the right end of the board.
    const last = await db.boardList.findFirst({
      where: { boardId },
      orderBy: { position: "desc" },
      select: { position: true },
    });
    const position = (last?.position ?? -1000) + 1000;

    const list = await db.boardList.create({
      data: { name, position, boardId },
    });

    return NextResponse.json({ ok: true, id: list.id });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
