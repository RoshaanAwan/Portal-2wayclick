import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { isManagerTier } from "@/lib/permissions";
import { z } from "zod";
import { TASK_PRIORITIES } from "@/lib/constants";

// Edit a card's title and/or priority. At least one field must be supplied.
const schema = z
  .object({
    taskId: z.string().min(1),
    title: z.string().trim().min(1).max(200).optional(),
    priority: z.enum(TASK_PRIORITIES).optional(),
  })
  .refine((v) => v.title !== undefined || v.priority !== undefined, {
    message: "Nothing to update",
  });

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const { taskId, title, priority } = schema.parse(await req.json());

    const task = await db.task.findUnique({
      where: { id: taskId },
      select: { id: true, title: true, creatorId: true },
    });
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    // Only the card's creator or a manager-tier user may edit it.
    if (task.creatorId !== user.id && !isManagerTier(user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const updated = await db.task.update({
      where: { id: taskId },
      data: {
        ...(title !== undefined ? { title } : {}),
        ...(priority !== undefined ? { priority } : {}),
      },
      select: { id: true, title: true, priority: true },
    });

    await audit({
      actor: user,
      action: "task.update",
      entity: "Task",
      entityId: task.id,
      summary: `${user.name} edited task “${updated.title}”`,
      detail: { title, priority, previousTitle: task.title },
    });

    return NextResponse.json({ ok: true, task: updated });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
