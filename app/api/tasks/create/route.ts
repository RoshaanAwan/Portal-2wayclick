import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";
import { TASK_PRIORITIES } from "@/lib/constants";

const schema = z.object({
  listId: z.string().min(1),
  title: z.string().trim().min(1).max(200),
  priority: z.enum(TASK_PRIORITIES).optional().default("MEDIUM"),
  // Optional first assignee (Trello: assign yourself / a member on create).
  assigneeId: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const { listId, title, priority, assigneeId } = schema.parse(
      await req.json(),
    );

    const list = await db.boardList.findUnique({ where: { id: listId } });
    if (!list) {
      return NextResponse.json({ error: "List not found" }, { status: 404 });
    }

    // New cards go to the bottom of the list.
    const last = await db.task.findFirst({
      where: { listId },
      orderBy: { position: "desc" },
      select: { position: true },
    });
    const position = (last?.position ?? 0) + 1000;

    const task = await db.task.create({
      data: {
        title,
        priority,
        position,
        listId,
        creatorId: user.id,
        assignees: assigneeId
          ? { create: { userId: assigneeId } }
          : undefined,
      },
    });

    return NextResponse.json({ ok: true, id: task.id });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
