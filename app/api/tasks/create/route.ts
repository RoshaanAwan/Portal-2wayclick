import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notifications";
import { sendSlackDM } from "@/lib/slack";
import { z } from "zod";
import { ISSUE_TYPES, TASK_PRIORITIES } from "@/lib/constants";
import { nextIssueNumber, statusForList } from "@/lib/issues";
import { assertListAccess } from "@/lib/taskAccess";

const schema = z.object({
  listId: z.string().min(1),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  priority: z.enum(TASK_PRIORITIES).optional().default("MEDIUM"),
  // JIRA issue type (defaults to TASK).
  issueType: z.enum(ISSUE_TYPES).optional().default("TASK"),
  // Agile estimate in story points (Fibonacci scale; any int is accepted).
  storyPoints: z.number().int().min(0).max(999).optional(),
  // Free-text labels.
  labels: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  // Reporter (accountable owner). Defaults to the creator when omitted.
  reporterId: z.string().optional(),
  // Sprint to plan this issue into (null/omitted = backlog).
  sprintId: z.string().optional(),
  // Optional first assignee (Trello: assign yourself / a member on create).
  assigneeId: z.string().optional(),
  // Optional planned-effort estimate in minutes (capped at one year).
  estimateMinutes: z.number().int().positive().max(525600).optional(),
});

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const {
      listId,
      title,
      description,
      priority,
      issueType,
      storyPoints,
      labels,
      reporterId,
      sprintId,
      assigneeId,
      estimateMinutes,
    } = schema.parse(await req.json());

    const list = await db.boardList.findUnique({
      where: { id: listId },
      // Pull the board id (to mint the issue key + verify the sprint) and the
      // list/project name (status + the create-with-assignee Slack DM).
      select: {
        id: true,
        name: true,
        boardId: true,
        board: { select: { keyPrefix: true, project: { select: { name: true } } } },
      },
    });
    if (!list) {
      return NextResponse.json({ error: "List not found" }, { status: 404 });
    }

    // Authorize against the destination list's project: project boards are
    // members-only (admin tier bypasses); the global /tasks board is open.
    const access = await assertListAccess(listId, user);
    if (!access.ok) {
      return NextResponse.json(
        { error: access.status === 404 ? "List not found" : "Forbidden" },
        { status: access.status },
      );
    }

    // A sprint, if given, must belong to this list's board.
    if (sprintId) {
      const sprint = await db.sprint.findUnique({
        where: { id: sprintId },
        select: { boardId: true },
      });
      if (!sprint || sprint.boardId !== list.boardId) {
        return NextResponse.json({ error: "Invalid sprint" }, { status: 400 });
      }
    }

    // New cards go to the bottom of the list.
    const last = await db.task.findFirst({
      where: { listId },
      orderBy: { position: "desc" },
      select: { position: true },
    });
    const position = (last?.position ?? 0) + 1000;

    // Mint the issue number and insert the card together so the per-board
    // counter and the card commit atomically (no gaps, no collisions).
    const task = await db.$transaction(async (tx) => {
      const issueNumber = await nextIssueNumber(list.boardId, tx);
      return tx.task.create({
        data: {
          title,
          description: description || null,
          priority,
          position,
          listId,
          creatorId: user.id,
          issueNumber,
          issueType,
          status: statusForList(list.name),
          storyPoints: storyPoints ?? null,
          labels: labels ?? [],
          reporterId: reporterId || user.id,
          sprintId: sprintId || null,
          estimateMinutes: estimateMinutes ?? null,
          assignees: assigneeId
            ? { create: { userId: assigneeId } }
            : undefined,
        },
      });
    });
    const issueLabel = `${list.board.keyPrefix}-${task.issueNumber}`;

    await audit({
      actor: user,
      action: "task.create",
      entity: "Task",
      entityId: task.id,
      summary: `${user.name} created ${issueLabel} “${title}”`,
      detail: { listId, priority, issueType, storyPoints, estimateMinutes },
    });

    // If the card was created already assigned to someone other than the creator,
    // tell that assignee — in-app bell + Web Push (notify) and a Slack DM. Mirrors
    // the assign endpoint (app/api/tasks/assign/route.ts).
    if (assigneeId && assigneeId !== user.id) {
      const assignee = await db.user.findUnique({
        where: { id: assigneeId },
        select: { id: true, slackUserId: true },
      });
      if (assignee) {
        await notify({
          userId: assignee.id,
          type: "task.assigned",
          message: `assigned you to ${issueLabel} “${title}”`,
          link: "/tasks",
          actor: user,
        });

        const projectName = list.board?.project?.name;
        await sendSlackDM(
          assignee.slackUserId,
          `📋 *${user.name}* assigned you to *${issueLabel} ${title}*` +
            (projectName ? ` in project *${projectName}*` : ""),
        );
      }
    }

    return NextResponse.json({
      ok: true,
      id: task.id,
      issueNumber: task.issueNumber,
      issueKey: issueLabel,
    });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
