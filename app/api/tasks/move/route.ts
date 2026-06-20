import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { statusForList } from "@/lib/issues";
import { z } from "zod";

// The client sends the destination list and the ids of the cards that should
// sit immediately before / after the dropped card (either may be null when the
// card lands at the top or bottom). We compute a fractional position between
// them so siblings never need rewriting.
const schema = z.object({
  taskId: z.string().min(1),
  listId: z.string().min(1),
  beforeId: z.string().nullable().optional(),
  afterId: z.string().nullable().optional(),
});

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const { taskId, listId, beforeId, afterId } = schema.parse(
      await req.json(),
    );

    const [task, list] = await Promise.all([
      db.task.findUnique({ where: { id: taskId } }),
      db.boardList.findUnique({ where: { id: listId } }),
    ]);
    if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });
    if (!list) return NextResponse.json({ error: "List not found" }, { status: 404 });

    // Resolve neighbor positions within the destination list.
    const [before, after] = await Promise.all([
      beforeId
        ? db.task.findFirst({ where: { id: beforeId, listId }, select: { position: true } })
        : Promise.resolve(null),
      afterId
        ? db.task.findFirst({ where: { id: afterId, listId }, select: { position: true } })
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
      // Empty list (or no neighbors supplied) — anchor at the start.
      position = 1000;
    }

    // Moving a card between columns also advances its JIRA workflow status:
    // the column name is the source of truth (statusForList), keeping the board
    // and the status field — read by filters/reports — in lock-step.
    const status = statusForList(list.name);

    await db.task.update({
      where: { id: taskId },
      data: { listId, position, status },
    });

    await audit({
      actor: user,
      action: "task.move",
      entity: "Task",
      entityId: task.id,
      summary: `${user.name} moved “${task.title}” to ${list.name}`,
      detail: { fromListId: task.listId, toListId: listId, position, status },
    });

    return NextResponse.json({ ok: true, position, status });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
