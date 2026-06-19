import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { z } from "zod";
import { TASK_PRIORITIES } from "@/lib/constants";

const schema = z.object({
  listId: z.string().min(1),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  priority: z.enum(TASK_PRIORITIES).optional().default("MEDIUM"),
  // Optional first assignee (Trello: assign yourself / a member on create).
  assigneeId: z.string().optional(),
  // Optional planned-effort estimate in minutes (capped at one year).
  estimateMinutes: z.number().int().positive().max(525600).optional(),
});

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const { listId, title, description, priority, assigneeId, estimateMinutes } =
      schema.parse(await req.json());

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
        description: description || null,
        priority,
        position,
        listId,
        creatorId: user.id,
        estimateMinutes: estimateMinutes ?? null,
        assignees: assigneeId
          ? { create: { userId: assigneeId } }
          : undefined,
      },
    });

    await audit({
      actor: user,
      action: "task.create",
      entity: "Task",
      entityId: task.id,
      summary: `${user.name} created task “${title}”`,
      detail: { listId, priority, estimateMinutes },
    });

    return NextResponse.json({ ok: true, id: task.id });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
