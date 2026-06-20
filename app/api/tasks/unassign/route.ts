import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { assertTaskAccess } from "@/lib/taskAccess";
import { z } from "zod";

const schema = z.object({
  taskId: z.string().min(1),
  userId: z.string().min(1),
});

export async function POST(req: Request) {
  try {
    const actor = await requireUser();
    const { taskId, userId } = schema.parse(await req.json());

    // Authorize against the task's project BEFORE mutating (members-only for
    // project boards; admin tier bypasses; global board open). Previously the
    // delete ran unconditionally on any client-supplied taskId.
    const access = await assertTaskAccess(taskId, actor);
    if (!access.ok) {
      return NextResponse.json(
        { error: access.status === 404 ? "Task not found" : "Forbidden" },
        { status: access.status },
      );
    }

    // deleteMany is idempotent — removing a non-existent assignment is fine.
    await db.taskAssignee.deleteMany({ where: { taskId, userId } });

    const [task, member] = await Promise.all([
      db.task.findUnique({ where: { id: taskId }, select: { title: true } }),
      db.user.findUnique({ where: { id: userId }, select: { name: true } }),
    ]);

    await audit({
      actor,
      action: "task.unassign",
      entity: "Task",
      entityId: taskId,
      targetUserId: userId,
      summary: `${actor.name} unassigned ${member?.name ?? "a member"} from “${task?.title ?? "a task"}”`,
      detail: { removedUserId: userId, taskId },
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
