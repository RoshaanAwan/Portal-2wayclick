import { NextResponse } from "next/server";
import { requireTenantUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { recordActivity } from "@/lib/activityFeed";
import { notifyMany } from "@/lib/notifications";
import { isManagerTier } from "@/lib/permissions";
import { assertTaskAccess } from "@/lib/taskAccess";
import { formatMinutes } from "@/lib/utils";
import { statusForList } from "@/lib/issues";
import { z } from "zod";
import { ISSUE_TYPES, TASK_PRIORITIES, WORKFLOW_STATUSES } from "@/lib/constants";

// Edit a card's title, description, priority, JIRA fields and/or logged time. At
// least one field must be supplied. An empty description clears it (null).
//
// Time tracking ("time lock") has two modes:
//   • addMinutes        — add to the card's time pool. Any editor may log time.
//   • timeSpentMinutes  — set the pool to an absolute value (manager-only reset).
//
// Setting `status` from the modal also relocates the card to the matching board
// column (and vice-versa via /api/tasks/move), keeping board and status in sync.
const schema = z
  .object({
    taskId: z.string().min(1),
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(2000).optional(),
    priority: z.enum(TASK_PRIORITIES).optional(),
    // JIRA fields.
    issueType: z.enum(ISSUE_TYPES).optional(),
    status: z.enum(WORKFLOW_STATUSES).optional(),
    // storyPoints: null clears the estimate.
    storyPoints: z.number().int().min(0).max(999).nullable().optional(),
    // dueDate: a YYYY-MM-DD calendar day (anchored to UTC midnight below, like
    // the announcement eventDate). null clears it. Drives the dashboard calendar.
    dueDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date")
      .nullable()
      .optional(),
    labels: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
    reporterId: z.string().nullable().optional(),
    // sprintId: null moves the card to the backlog.
    sprintId: z.string().nullable().optional(),
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
      v.issueType !== undefined ||
      v.status !== undefined ||
      v.storyPoints !== undefined ||
      v.dueDate !== undefined ||
      v.labels !== undefined ||
      v.reporterId !== undefined ||
      v.sprintId !== undefined ||
      v.addMinutes !== undefined ||
      v.timeSpentMinutes !== undefined,
    { message: "Nothing to update" },
  );

export async function POST(req: Request) {
  try {
    const user = await requireTenantUser();
    const {
      taskId,
      title,
      description,
      priority,
      issueType,
      status,
      storyPoints,
      dueDate,
      labels,
      reporterId,
      sprintId,
      addMinutes,
      timeSpentMinutes,
      reason,
    } = schema.parse(await req.json());

    const task = await db.task.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        title: true,
        status: true,
        creatorId: true,
        timeSpentMinutes: true,
        estimateMinutes: true,
        listId: true,
        assignees: { select: { userId: true } },
        list: { select: { boardId: true, board: { select: { keyPrefix: true } } } },
      },
    });
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    // First gate on project membership (project boards are members-only; admin
    // tier bypasses; global board open). The creator/assignee/manager checks
    // below then apply the finer-grained per-field rules WITHIN that project.
    const access = await assertTaskAccess(taskId, user);
    if (!access.ok) {
      return NextResponse.json(
        { error: access.status === 404 ? "Task not found" : "Forbidden" },
        { status: access.status },
      );
    }

    const isManager = isManagerTier(user.role);
    const isCreator = task.creatorId === user.id;
    const isAssignee = task.assignees.some((a) => a.userId === user.id);

    // Whether this request only logs time (no content edits). Logging time is
    // open to anyone working the card — its assignees, creator, or a manager —
    // whereas editing content/JIRA fields stays creator-or-manager. A status
    // change is the one JIRA edit assignees may also make (they work the issue).
    const onlyLogsTime =
      addMinutes !== undefined &&
      title === undefined &&
      description === undefined &&
      priority === undefined &&
      issueType === undefined &&
      status === undefined &&
      storyPoints === undefined &&
      dueDate === undefined &&
      labels === undefined &&
      reporterId === undefined &&
      sprintId === undefined &&
      timeSpentMinutes === undefined;

    // A status-only transition (drag-equivalent from the modal) is allowed for
    // assignees too, mirroring who can move the card on the board.
    const onlyStatus =
      status !== undefined &&
      title === undefined &&
      description === undefined &&
      priority === undefined &&
      issueType === undefined &&
      storyPoints === undefined &&
      dueDate === undefined &&
      labels === undefined &&
      reporterId === undefined &&
      sprintId === undefined &&
      addMinutes === undefined &&
      timeSpentMinutes === undefined;

    if (onlyLogsTime || onlyStatus) {
      // Logging time / advancing status — anyone working the card.
      if (!isCreator && !isManager && !isAssignee) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    } else if (!isCreator && !isManager) {
      // Content / JIRA-field edits (and any absolute-time reset) — creator or
      // manager.
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

    // A sprint, if given, must belong to this card's board.
    if (sprintId) {
      const sprint = await db.sprint.findUnique({
        where: { id: sprintId },
        select: { boardId: true },
      });
      if (!sprint || sprint.boardId !== task.list.boardId) {
        return NextResponse.json({ error: "Invalid sprint" }, { status: 400 });
      }
    }

    // A status change from the modal also relocates the card to the board column
    // whose name maps to that status, so the board reflects the new state. If no
    // column matches (custom board), the status still updates in place.
    let relocateListId: string | undefined;
    if (status !== undefined) {
      const lists = await db.boardList.findMany({
        where: { boardId: task.list.boardId },
        select: { id: true, name: true, position: true },
        orderBy: { position: "asc" },
      });
      const target = lists.find(
        (l) => statusForList(l.name) === status && l.id !== task.listId,
      );
      if (target) {
        relocateListId = target.id;
      }
    }

    // Resolve the new time pool: an absolute set wins; otherwise add to it.
    const nextTime =
      timeSpentMinutes !== undefined
        ? timeSpentMinutes
        : addMinutes !== undefined
          ? task.timeSpentMinutes + addMinutes
          : undefined;

    // When relocating for a status change, drop the card at the bottom of the
    // destination column.
    let relocatePosition: number | undefined;
    if (relocateListId) {
      const last = await db.task.findFirst({
        where: { listId: relocateListId },
        orderBy: { position: "desc" },
        select: { position: true },
      });
      relocatePosition = (last?.position ?? 0) + 1000;
    }

    // Stamp/clear the completion time when status crosses the DONE boundary
    // (mirrors the move route), so on-time + delivered math stays accurate
    // whether the card is closed from the board or the modal.
    const completedAt =
      status !== undefined && status !== task.status
        ? status === "DONE"
          ? new Date()
          : task.status === "DONE"
            ? null
            : undefined
        : undefined;

    const updated = await db.task.update({
      where: { id: taskId },
      data: {
        ...(title !== undefined ? { title } : {}),
        ...(description !== undefined
          ? { description: description || null }
          : {}),
        ...(priority !== undefined ? { priority } : {}),
        ...(issueType !== undefined ? { issueType } : {}),
        ...(status !== undefined ? { status } : {}),
        ...(completedAt !== undefined ? { completedAt } : {}),
        ...(relocateListId
          ? { listId: relocateListId, position: relocatePosition }
          : {}),
        ...(storyPoints !== undefined ? { storyPoints } : {}),
        ...(dueDate !== undefined
          ? { dueDate: dueDate ? new Date(`${dueDate}T00:00:00.000Z`) : null }
          : {}),
        ...(labels !== undefined ? { labels } : {}),
        ...(reporterId !== undefined ? { reporterId } : {}),
        ...(sprintId !== undefined ? { sprintId } : {}),
        ...(nextTime !== undefined ? { timeSpentMinutes: nextTime } : {}),
      },
      select: {
        id: true,
        title: true,
        description: true,
        priority: true,
        issueType: true,
        status: true,
        storyPoints: true,
        dueDate: true,
        labels: true,
        reporterId: true,
        sprintId: true,
        listId: true,
        position: true,
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
        ...(issueType !== undefined ? { issueType } : {}),
        ...(status !== undefined ? { status } : {}),
        ...(storyPoints !== undefined ? { storyPoints } : {}),
        ...(dueDate !== undefined ? { dueDate } : {}),
        ...(labels !== undefined ? { labels } : {}),
        ...(reporterId !== undefined ? { reporterId } : {}),
        ...(sprintId !== undefined ? { sprintId } : {}),
        ...(addMinutes !== undefined ? { addMinutes } : {}),
        ...(timeSpentMinutes !== undefined ? { timeSpentMinutes } : {}),
        ...(reason ? { reason } : {}),
      },
    });

    // Feed + performance signal: a real content/status edit is activity. Pure
    // time-logging (onlyLogsTime) already drops a "[time]" comment that counts,
    // so don't double-count it here.
    if (!onlyLogsTime) {
      await recordActivity({
        actor: user,
        verb: "updated",
        target: `card “${updated.title}”`,
      });
    }

    return NextResponse.json({ ok: true, task: updated, comment: timeComment });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
