import { NextResponse } from "next/server";
import { z } from "zod";
import { db, adminDb } from "@/lib/db";
import { runWithTenant } from "@/lib/tenantContext";
import { audit } from "@/lib/audit";
import { notifyMany } from "@/lib/notifications";
import { rateLimit, clientIp, LIMITS } from "@/lib/rateLimit";
import { issueKey, nextIssueNumber, statusForList } from "@/lib/issues";

// Issue types a client may raise from the public board. A subset of the full
// internal set — clients pick Story / Bug / Task, never Epic / Subtask (those
// are team-internal structuring concerns).
const CLIENT_ISSUE_TYPES = ["STORY", "BUG", "TASK"] as const;

// ── Public: client adds a card ──────────────────────────────────────────────
// Reached from /shared/<token> with no portal login. The client may drop the
// card into any list on the board (To Do, Review, …) via an optional listId;
// with none, or one that doesn't belong to this board, it falls back to the
// Backlog list (or the leftmost). The card is proxy-created by the project
// owner, with the client's note as the description and a "(client)" hint in the
// title. Mirrored to a ClientSubmission row and surfaced to project members.

const schema = z.object({
  clientName: z.string().trim().min(1).max(80),
  title: z.string().trim().min(2).max(200),
  body: z.string().trim().max(2000).optional(),
  // Optional target list. Validated against THIS board's lists below; an
  // unknown / other-project id is ignored in favour of the Backlog fallback.
  listId: z.string().min(1).optional(),
  // JIRA-style issue type the client picked; defaults to TASK.
  issueType: z.enum(CLIENT_ISSUE_TYPES).optional().default("TASK"),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;

    // Anonymous (token-only auth): this creates a Task + ClientSubmission and
    // notifies every watcher per call. Throttle per token+IP so a leaked link
    // can't be scripted into unbounded card-creation / a notification flood.
    const rl = await rateLimit(
      `share:request:${token}:${clientIp(req)}`,
      LIMITS.share.limit,
      LIMITS.share.windowMs,
    );
    if (!rl.ok) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
      );
    }

    // PUBLIC route: no portal login, so no tenant context is established yet.
    // Resolve the project by its (globally-unique) share token with the
    // UN-SCOPED adminDb, then read its tenantId — that's the tenant this work
    // belongs to. Everything that touches a tenant-scoped model (the Task
    // create, plus audit()/notifyMany() which call requireTenantId()) is run
    // inside runWithTenant(project.tenantId, …) below.
    const project = await adminDb.project.findUnique({
      where: { shareToken: token },
      select: {
        id: true,
        tenantId: true,
        name: true,
        ownerId: true,
        members: { select: { userId: true } },
        board: {
          select: {
            id: true,
            keyPrefix: true,
            lists: {
              orderBy: { position: "asc" },
              select: { id: true, name: true },
            },
          },
        },
      },
    });
    if (!project) {
      return NextResponse.json({ error: "Invalid link" }, { status: 404 });
    }

    const { clientName, title, body, listId, issueType } = schema.parse(
      await req.json(),
    );

    return await runWithTenant(project.tenantId, async () => {

    // Honour the client's chosen list ONLY if it belongs to this board; never
    // trust a listId that points elsewhere. Otherwise fall back to Backlog,
    // else the leftmost. A project always has lists, but guard anyway.
    const chosen = listId
      ? project.board.lists.find((l) => l.id === listId)
      : undefined;
    const targetList =
      chosen ??
      project.board.lists.find((l) => l.name.toLowerCase() === "backlog") ??
      project.board.lists[0];
    if (!targetList) {
      return NextResponse.json(
        { error: "Project has no lists" },
        { status: 409 },
      );
    }

    // Append to the bottom of the list (same convention as task create).
    const last = await db.task.findFirst({
      where: { listId: targetList.id },
      orderBy: { position: "desc" },
      select: { position: true },
    });
    const position = (last?.position ?? 0) + 1000;

    const description = body
      ? `${body}\n\n— Added by ${clientName} via the client link`
      : `Added by ${clientName} via the client link`;

    // Mint the issue number and insert the card together so the per-board
    // counter and the card commit atomically (mirrors the internal create) —
    // this is what gives the client's card a real JIRA key like TASK-7.
    const task = await db.$transaction(async (tx) => {
      const issueNumber = await nextIssueNumber(project.board.id, tx);
      return tx.task.create({
        data: {
          tenantId: project.tenantId,
          title: `${title} (client)`,
          description,
          priority: "MEDIUM",
          position,
          listId: targetList.id,
          creatorId: project.ownerId,
          issueNumber,
          issueType,
          status: statusForList(targetList.name),
        },
      });
    });
    const issueLabel = issueKey(project.board.keyPrefix, task.issueNumber);

    await db.clientSubmission.create({
      data: {
        projectId: project.id,
        kind: "REQUEST",
        clientName,
        title,
        body: body ?? "",
        taskId: task.id,
      },
    });

    // Surface the new card to everyone on the project.
    const watchers = [
      project.ownerId,
      ...project.members.map((m) => m.userId),
    ];
    await notifyMany(watchers, {
      type: "task.assigned",
      message: `${clientName} (client) added ${issueLabel} “${title}” to ${targetList.name} on ${project.name}`,
      link: `/projects/${project.id}`,
    });

    await audit({
      actor: { id: null, name: `${clientName} (client)`, role: "CLIENT" },
      action: "project.client_submission",
      entity: "Project",
      entityId: project.id,
      summary: `${clientName} (client) added a card to “${project.name}”`,
      detail: {
        kind: "REQUEST",
        title,
        body,
        taskId: task.id,
        issueKey: issueLabel,
        issueType,
        listId: targetList.id,
        listName: targetList.name,
      },
    });

    // Return the created card + where it landed so the board can insert it live.
    return NextResponse.json({
      ok: true,
      listId: targetList.id,
      card: {
        id: task.id,
        title: task.title,
        description: task.description,
        priority: task.priority,
        issueKey: issueLabel,
        issueType: task.issueType,
        comments: [],
      },
    });
    });
  } catch (e: any) {
    if (e?.name === "ZodError") {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
