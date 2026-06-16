import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { notifyMany } from "@/lib/notifications";
import { encodeClientComment } from "@/lib/clientShare";

// ── Public: client comments on an existing card ─────────────────────────────
// Reached from /shared/<token> with no portal login — the token IS the auth, so
// we resolve the project strictly by shareToken and verify the target card
// belongs to that project's board before writing anything. The comment is
// stored as a normal TaskComment (so the team sees it on the internal board),
// proxy-authored by the project owner with a "[client:Name]" attribution
// marker, and mirrored into a ClientSubmission row for the trail.

const schema = z.object({
  taskId: z.string().min(1),
  clientName: z.string().trim().min(1).max(80),
  body: z.string().trim().min(1).max(1000),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;

    const project = await db.project.findUnique({
      where: { shareToken: token },
      select: { id: true, name: true, ownerId: true },
    });
    if (!project) {
      return NextResponse.json({ error: "Invalid link" }, { status: 404 });
    }

    const { taskId, clientName, body } = schema.parse(await req.json());

    // The card must belong to THIS project's board — never trust a taskId that
    // points elsewhere. Walk task → list → board → project.
    const task = await db.task.findFirst({
      where: { id: taskId, list: { board: { project: { id: project.id } } } },
      select: {
        id: true,
        title: true,
        creatorId: true,
        assignees: { select: { userId: true } },
      },
    });
    if (!task) {
      return NextResponse.json({ error: "Card not found" }, { status: 404 });
    }

    const stored = encodeClientComment(clientName, body);

    // Proxy-authored by the project owner (TaskComment.authorId is required and
    // a client has no User row); the marker carries the real attribution.
    const comment = await db.taskComment.create({
      data: { taskId, authorId: project.ownerId, body: stored },
    });

    await db.clientSubmission.create({
      data: {
        projectId: project.id,
        kind: "COMMENT",
        clientName,
        body,
        taskId,
      },
    });

    // Tell the card's watchers (creator + assignees) a client weighed in.
    const watchers = [task.creatorId, ...task.assignees.map((a) => a.userId)];
    await notifyMany(watchers, {
      type: "task.comment",
      message: `${clientName} (client) commented on “${task.title}”`,
      link: "/tasks",
    });

    await audit({
      // No SafeUser here — record the client as the actor by name only.
      actor: { id: null, name: `${clientName} (client)`, role: "CLIENT" },
      action: "project.client_submission",
      entity: "Task",
      entityId: task.id,
      summary: `${clientName} (client) commented on “${task.title}”`,
      detail: { kind: "COMMENT", projectId: project.id, body },
    });

    return NextResponse.json({
      ok: true,
      comment: {
        id: comment.id,
        body,
        authorName: clientName,
        isClient: true,
        createdAt: comment.createdAt.toISOString(),
      },
    });
  } catch (e: any) {
    if (e?.name === "ZodError") {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
