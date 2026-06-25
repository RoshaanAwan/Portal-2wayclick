import { NextResponse } from "next/server";
import { requireTenantUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { notifyMany } from "@/lib/notifications";
import { recordActivity } from "@/lib/activityFeed";
import { assertTaskAccess } from "@/lib/taskAccess";
import { z } from "zod";

const schema = z.object({
  taskId: z.string().min(1),
  body: z.string().trim().min(1).max(1000),
});

// @mentions are encoded inline as `@[Name](userId)` (the modal's composer writes
// this when you pick someone from the @ autocomplete). Pull out the mentioned
// user ids so we can notify them — capped so a crafted body can't fan out a flood.
const MENTION_RE = /@\[[^\]]+\]\(([a-zA-Z0-9_-]+)\)/g;
function parseMentionedIds(body: string): string[] {
  const ids = new Set<string>();
  for (const m of body.matchAll(MENTION_RE)) {
    ids.add(m[1]);
    if (ids.size >= 20) break;
  }
  return [...ids];
}

export async function POST(req: Request) {
  try {
    const user = await requireTenantUser();
    const { taskId, body } = schema.parse(await req.json());

    const task = await db.task.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        title: true,
        creatorId: true,
        assignees: { select: { userId: true } },
      },
    });
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    // Authorize against the task's project (members-only for project boards;
    // admin tier bypasses; global board open). Closes the cross-project IDOR.
    const access = await assertTaskAccess(taskId, user);
    if (!access.ok) {
      return NextResponse.json(
        { error: access.status === 404 ? "Task not found" : "Forbidden" },
        { status: access.status },
      );
    }

    const comment = await db.taskComment.create({
      data: { taskId, authorId: user.id, body },
      include: {
        author: { select: { id: true, name: true, avatarUrl: true } },
      },
    });

    await recordActivity({ actor: user, verb: "commented", target: `on “${task.title}”` });

    // Everyone watching the card — its creator and assignees.
    const watchers = new Set([
      task.creatorId,
      ...task.assignees.map((a) => a.userId),
    ]);

    // @mentions: only people on the card (assignee or creator) can be mentioned,
    // so intersect the parsed ids with the watcher set. Mentioned users get a
    // distinct "mentioned you" notification; the rest get the generic "commented".
    const mentioned = parseMentionedIds(body).filter(
      (id) => watchers.has(id) && id !== user.id,
    );
    const mentionedSet = new Set(mentioned);

    // Notify the mentioned users first (more specific message), then everyone
    // else watching — except the commenter (notify drops self; notifyMany dedupes).
    if (mentioned.length > 0) {
      await notifyMany(mentioned, {
        type: "task.comment",
        message: `mentioned you on “${task.title}”`,
        link: "/tasks",
        actor: user,
      });
    }
    const others = [...watchers].filter(
      (id) => id !== user.id && !mentionedSet.has(id),
    );
    await notifyMany(others, {
      type: "task.comment",
      message: `commented on “${task.title}”`,
      link: "/tasks",
      actor: user,
    });

    await audit({
      actor: user,
      action: "task.comment",
      entity: "Task",
      entityId: task.id,
      summary: `${user.name} commented on “${task.title}”`,
      detail: { body },
    });

    // Return the created comment so the client can render it immediately.
    return NextResponse.json({
      ok: true,
      comment: {
        id: comment.id,
        body: comment.body,
        createdAt: comment.createdAt.toISOString(),
        author: {
          id: comment.author.id,
          name: comment.author.name,
          avatarUrl: comment.author.avatarUrl,
        },
      },
    });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
