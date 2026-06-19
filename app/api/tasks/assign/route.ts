import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notifications";
import { sendSlackDM } from "@/lib/slack";
import { recordActivity } from "@/lib/activityFeed";
import { z } from "zod";

const schema = z.object({
  taskId: z.string().min(1),
  userId: z.string().min(1),
});

export async function POST(req: Request) {
  try {
    const actor = await requireUser();
    const { taskId, userId } = schema.parse(await req.json());

    const [task, member] = await Promise.all([
      db.task.findUnique({
        where: { id: taskId },
        select: {
          id: true,
          title: true,
          // Task → list → board → project, so the Slack DM can name the project.
          list: { select: { board: { select: { project: { select: { name: true } } } } } },
        },
      }),
      db.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, slackUserId: true },
      }),
    ]);
    if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });
    if (!member) return NextResponse.json({ error: "User not found" }, { status: 404 });

    // Idempotent: re-assigning an existing member is a no-op (unique constraint).
    const assignment = await db.taskAssignee.upsert({
      where: { taskId_userId: { taskId, userId } },
      create: { taskId, userId },
      update: {},
    });

    // Surface assignment in the activity feed (skip self-assignment noise).
    if (actor.id !== userId) {
      await recordActivity({
        actor,
        verb: "assigned",
        target: `${member.name} to “${task.title}”`,
      });

      // Tell the assignee they're now on this card.
      await notify({
        userId,
        type: "task.assigned",
        message: `assigned you to “${task.title}”`,
        link: "/tasks",
        actor,
      });

      // Also DM the assignee on Slack (best-effort; no-ops if Slack isn't
      // configured or the user has no linked slackUserId). lib/slack.ts.
      const projectName = task.list?.board?.project?.name;
      await sendSlackDM(
        member.slackUserId,
        `📋 *${actor.name}* assigned you to *${task.title}*` +
          (projectName ? ` in project *${projectName}*` : ""),
      );

      await audit({
        actor,
        action: "task.assign",
        entity: "Task",
        entityId: task.id,
        targetUserId: userId,
        summary: `${actor.name} assigned ${member.name} to “${task.title}”`,
        detail: { assigneeId: userId, taskId: task.id },
      });
    }

    return NextResponse.json({ ok: true, id: assignment.id });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
