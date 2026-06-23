import { NextResponse } from "next/server";
import { z } from "zod";
import { db, adminDb } from "@/lib/db";
import { audit } from "@/lib/audit";
import { notifyMany } from "@/lib/notifications";
import { rateLimit, clientIp, LIMITS } from "@/lib/rateLimit";
import { statusForList } from "@/lib/issues";
import { runWithTenant } from "@/lib/tenantContext";

// ── Public: client moves a card ─────────────────────────────────────────────
// Reached from /shared/<token> with no portal login — the token is the auth.
// Mirrors /api/tasks/move's fractional-position scheme (beforeId/afterId give
// the neighbours in the destination list), but every id is verified to belong
// to THIS project's board before anything is written: a tampered taskId or
// listId pointing at another project is rejected, not honoured.

const schema = z.object({
  clientName: z.string().trim().min(1).max(80),
  taskId: z.string().min(1),
  listId: z.string().min(1),
  beforeId: z.string().nullable().optional(),
  afterId: z.string().nullable().optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;

    // Anonymous (token-only auth) + notifies every watcher per call — throttle
    // per token+IP so a leaked link can't be scripted into a flood.
    const rl = await rateLimit(
      `share:move:${token}:${clientIp(req)}`,
      LIMITS.share.limit,
      LIMITS.share.windowMs,
    );
    if (!rl.ok) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
      );
    }

    // The token wins: resolve project + owning tenant via adminDb (no ambient
    // context), then run all scoped work inside that tenant.
    const project = await adminDb.project.findUnique({
      where: { shareToken: token },
      select: {
        id: true,
        name: true,
        ownerId: true,
        boardId: true,
        tenantId: true,
        members: { select: { userId: true } },
      },
    });
    if (!project) {
      return NextResponse.json({ error: "Invalid link" }, { status: 404 });
    }

    const { clientName, taskId, listId, beforeId, afterId } = schema.parse(
      await req.json(),
    );

    return await runWithTenant(project.tenantId, async () => {
    // Both the card and the destination list must live on THIS project's board.
    const [task, list] = await Promise.all([
      db.task.findFirst({
        where: { id: taskId, list: { boardId: project.boardId } },
        select: { id: true, title: true, listId: true },
      }),
      db.boardList.findFirst({
        where: { id: listId, boardId: project.boardId },
        select: { id: true, name: true },
      }),
    ]);
    if (!task) {
      return NextResponse.json({ error: "Card not found" }, { status: 404 });
    }
    if (!list) {
      return NextResponse.json({ error: "List not found" }, { status: 404 });
    }

    // Resolve neighbour positions within the destination list (same math as the
    // internal move route, so the two boards agree on ordering).
    const [before, after] = await Promise.all([
      beforeId
        ? db.task.findFirst({
            where: { id: beforeId, listId },
            select: { position: true },
          })
        : Promise.resolve(null),
      afterId
        ? db.task.findFirst({
            where: { id: afterId, listId },
            select: { position: true },
          })
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
      position = 1000;
    }

    // Keep the JIRA workflow status in lock-step with the column, exactly like
    // the internal board — so a card the client drags to "Done" actually reads
    // as DONE in the team's filters/reports, not just visually in the column.
    const changedList = task.listId !== listId;
    await db.task.update({
      where: { id: taskId },
      data: {
        listId,
        position,
        ...(changedList ? { status: statusForList(list.name) } : {}),
      },
    });

    // Only make noise when the card actually changed columns.
    if (changedList) {
      const watchers = [
        project.ownerId,
        ...project.members.map((m) => m.userId),
      ];
      await notifyMany(watchers, {
        type: "task.assigned",
        message: `${clientName} (client) moved “${task.title}” to ${list.name} on ${project.name}`,
        link: `/projects/${project.id}`,
      });
    }

    await audit({
      actor: { id: null, name: `${clientName} (client)`, role: "CLIENT" },
      action: "project.client_submission",
      entity: "Task",
      entityId: task.id,
      summary: `${clientName} (client) moved “${task.title}” to ${list.name}`,
      detail: {
        kind: "MOVE",
        projectId: project.id,
        fromListId: task.listId,
        toListId: listId,
        position,
      },
    });

    return NextResponse.json({ ok: true, position });
    });
  } catch (e: any) {
    if (e?.name === "ZodError") {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
