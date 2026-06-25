import { NextResponse } from "next/server";
import { requireTenantUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { recordActivity } from "@/lib/activityFeed";
import { isManagerTier } from "@/lib/permissions";
import { assertTaskAccess } from "@/lib/taskAccess";
import { z } from "zod";

const schema = z.object({
  taskId: z.string().min(1),
});

export async function POST(req: Request) {
  try {
    const user = await requireTenantUser();
    const { taskId } = schema.parse(await req.json());

    const task = await db.task.findUnique({
      where: { id: taskId },
      select: { id: true, title: true, listId: true, creatorId: true },
    });
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    // Gate on project membership first (project boards are members-only; admin
    // tier bypasses; global board open), THEN the creator/manager rule below.
    const access = await assertTaskAccess(taskId, user);
    if (!access.ok) {
      return NextResponse.json(
        { error: access.status === 404 ? "Task not found" : "Forbidden" },
        { status: access.status },
      );
    }

    // Only the card's creator or a manager-tier user may delete it.
    if (task.creatorId !== user.id && !isManagerTier(user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Relations (assignees, comments) cascade on the Task delete via the schema.
    await db.task.delete({ where: { id: taskId } });

    await audit({
      actor: user,
      action: "task.delete",
      entity: "Task",
      entityId: task.id,
      summary: `${user.name} deleted task “${task.title}”`,
      detail: { listId: task.listId },
    });

    // Feed + performance signal: deleting a card counts as activity.
    await recordActivity({ actor: user, verb: "deleted", target: `card “${task.title}”` });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
