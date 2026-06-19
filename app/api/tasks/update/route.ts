import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { notifyMany } from "@/lib/notifications";
import { isManagerTier } from "@/lib/permissions";
import { formatMinutes } from "@/lib/utils";
import { z } from "zod";
import { TASK_PRIORITIES } from "@/lib/constants";

// Edit a card's title, description, priority and/or logged time. At least one
// field must be supplied. An empty description clears it (stored as null).
//
// Time tracking ("time lock") has two modes:
//   • addMinutes        — add to the card's time pool. Any editor may log time.
//   • timeSpentMinutes  — set the pool to an absolute value (manager-only reset).
const schema = z
  .object({
    taskId: z.string().min(1),
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(2000).optional(),
    priority: z.enum(TASK_PRIORITIES).optional(),
    // Minutes to add to the logged total. Capped at one week per entry.
    addMinutes: z.number().int().positive().max(10080).optional(),
    // Absolute logged total (manager override / reset). 0 clears it.
    timeSpentMinutes: z.number().int().min(0).max(525600).optional(),
    // Why the logged total exceeds the estimate (required by the UI when the
    // card has an estimate and the new total goes over it).
    reason: z.string().trim().max(500).optional(),
  })
  .refine(
    (v) =>
      v.title !== undefined ||
      v.description !== undefined ||
      v.priority !== undefined ||
      v.addMinutes !== undefined ||
      v.timeSpentMinutes !== undefined,
    { message: "Nothing to update" },
  );

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const {
      taskId,
      title,
      description,
      priority,
      addMinutes,
      timeSpentMinutes,
      reason,
    } = schema.parse(await req.json());

    const task = await db.task.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        title: true,
        creatorId: true,
        timeSpentMinutes: true,
        estimateMinutes: true,
        assignees: { select: { userId: true } },
      },
    });
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const isManager = isManagerTier(user.role);
    const isCreator = task.creatorId === user.id;
    const isAssignee = task.assignees.some((a) => a.userId === user.id);

    // Whether this request only logs time (no content edits). Logging time is
    // open to anyone working the card — its assignees, creator, or a manager —
    // whereas editing title/description/priority stays creator-or-manager.
    const onlyLogsTime =
      addMinutes !== undefined &&
      title === undefined &&
      description === undefined &&
      priority === undefined &&
      timeSpentMinutes === undefined;

    if (onlyLogsTime) {
      if (!isCreator && !isManager && !isAssignee) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    } else if (!isCreator && !isManager) {
      // Content edits (and any absolute-time reset below) — creator or manager.
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Setting an absolute time total (override/reset) is manager-only; logging
    // additional time onto the pool is handled by the check above.
    if (timeSpentMinutes !== undefined && !isManager) {
      return NextResponse.json(
        { error: "Only managers can reset logged time" },
        { status: 403 },
      );
    }

    // Resolve the new time pool: an absolute set wins; otherwise add to it.
    const nextTime =
      timeSpentMinutes !== undefined
        ? timeSpentMinutes
        : addMinutes !== undefined
          ? task.timeSpentMinutes + addMinutes
          : undefined;

    const updated = await db.task.update({
      where: { id: taskId },
      data: {
        ...(title !== undefined ? { title } : {}),
        ...(description !== undefined
          ? { description: description || null }
          : {}),
        ...(priority !== undefined ? { priority } : {}),
        ...(nextTime !== undefined ? { timeSpentMinutes: nextTime } : {}),
      },
      select: {
        id: true,
        title: true,
        description: true,
        priority: true,
        timeSpentMinutes: true,
      },
    });

    // When a user logs time (addMinutes), drop a "[time]" system comment on the
    // card so the thread records who tracked time and how much. If the new total
    // went over the card's estimate, fold in the over-estimate note + reason.
    let timeComment:
      | {
          id: string;
          body: string;
          createdAt: string;
          author: { id: string; name: string; avatarUrl: string | null };
        }
      | undefined;
    if (addMinutes !== undefined && nextTime !== undefined) {
      const overEstimate =
        task.estimateMinutes != null && nextTime > task.estimateMinutes;
      let body = `[time] logged ${formatMinutes(addMinutes)} (total ${formatMinutes(nextTime)})`;
      if (overEstimate) {
        body += ` — over the ${formatMinutes(task.estimateMinutes!)} estimate`;
        if (reason) body += `. Reason: ${reason}`;
      }

      const comment = await db.taskComment.create({
        data: { taskId, authorId: user.id, body },
        include: {
          author: { select: { id: true, name: true, avatarUrl: true } },
        },
      });
      timeComment = {
        id: comment.id,
        body: comment.body,
        createdAt: comment.createdAt.toISOString(),
        author: {
          id: comment.author.id,
          name: comment.author.name,
          avatarUrl: comment.author.avatarUrl,
        },
      };

      // Notify watchers (creator + assignees) other than the logger, mirroring
      // the comment route so over-estimate logs surface to the people involved.
      const watchers = [
        task.creatorId,
        ...task.assignees.map((a) => a.userId),
      ].filter((id) => id !== user.id);
      await notifyMany(watchers, {
        type: "task.comment",
        message: overEstimate
          ? `logged time over estimate on “${updated.title}”`
          : `logged time on “${updated.title}”`,
        link: "/tasks",
        actor: user,
      });
    }

    await audit({
      actor: user,
      action: "task.update",
      entity: "Task",
      entityId: task.id,
      summary: `${user.name} edited task “${updated.title}”`,
      detail: {
        title,
        priority,
        previousTitle: task.title,
        ...(addMinutes !== undefined ? { addMinutes } : {}),
        ...(timeSpentMinutes !== undefined ? { timeSpentMinutes } : {}),
        ...(reason ? { reason } : {}),
      },
    });

    return NextResponse.json({ ok: true, task: updated, comment: timeComment });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
