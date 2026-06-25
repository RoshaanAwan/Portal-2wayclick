import { NextResponse } from "next/server";
import { requireTenantUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { assertTaskAccess } from "@/lib/taskAccess";
import { issueKey } from "@/lib/issues";

// ── Lazy-loaded card detail ──────────────────────────────────────────────────
// The board query (projects/[id] and /tasks) only hydrates each card's summary
// counts + cover — NOT the full comment thread, every attachment, or issue
// links — so a busy board doesn't transfer thousands of related rows up front.
// When a card's modal opens, the client fetches THIS endpoint to fill in those
// arrays for the one card being viewed. Tenant-scoped via the `db` client and
// authorized with the same assertTaskAccess gate the write routes use, so a user
// can't read a card on a board they aren't a member of.

const MAX_COMMENTS = 50;
const MAX_ATTACHMENTS = 50;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireTenantUser();
    const { id } = await params;

    // Project-membership / admin-tier gate (404 if the task doesn't exist or
    // isn't visible to this tenant; 403 if not a member of the owning project).
    const access = await assertTaskAccess(id, user);
    if (!access.ok) {
      return NextResponse.json(
        { error: access.status === 404 ? "Task not found" : "Forbidden" },
        { status: access.status },
      );
    }

    const task = await db.task.findUnique({
      where: { id },
      select: {
        // keyPrefix lives on the board; needed to render linked-issue keys.
        list: { select: { board: { select: { keyPrefix: true } } } },
        comments: {
          // Newest-first so `take` keeps the most recent; reversed below for the
          // oldest-first thread order the modal renders.
          orderBy: { createdAt: "desc" },
          take: MAX_COMMENTS,
          include: {
            author: { select: { id: true, name: true, avatarUrl: true } },
          },
        },
        attachments: {
          orderBy: { createdAt: "desc" },
          take: MAX_ATTACHMENTS,
          include: {
            uploader: { select: { id: true, name: true, avatarUrl: true } },
          },
        },
        outgoingLinks: {
          include: {
            target: {
              select: { id: true, title: true, status: true, issueType: true, issueNumber: true },
            },
          },
        },
        incomingLinks: {
          include: {
            source: {
              select: { id: true, title: true, status: true, issueType: true, issueNumber: true },
            },
          },
        },
      },
    });

    // assertTaskAccess already proved existence+access; a null here would be a
    // race (deleted between the two reads) — treat as not found.
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const keyPrefix = task.list?.board?.keyPrefix ?? "TASK";

    const links = [
      ...task.outgoingLinks.map((l) => ({
        id: l.id,
        type: l.type,
        direction: "outward" as const,
        issueKey: issueKey(keyPrefix, l.target.issueNumber),
        taskId: l.target.id,
        title: l.target.title,
        status: l.target.status,
        issueType: l.target.issueType,
      })),
      ...task.incomingLinks.map((l) => ({
        id: l.id,
        type: l.type,
        direction: "inward" as const,
        issueKey: issueKey(keyPrefix, l.source.issueNumber),
        taskId: l.source.id,
        title: l.source.title,
        status: l.source.status,
        issueType: l.source.issueType,
      })),
    ];

    return NextResponse.json({
      // Oldest-first to match the modal's thread order.
      comments: task.comments
        .slice()
        .reverse()
        .map((c) => ({
          id: c.id,
          body: c.body,
          createdAt: c.createdAt.toISOString(),
          author: {
            id: c.author.id,
            name: c.author.name,
            avatarUrl: c.author.avatarUrl,
          },
        })),
      // Newest-first, served through the proxy (Drive files are private).
      attachments: task.attachments.map((a) => ({
        id: a.id,
        name: a.name,
        mimeType: a.mimeType,
        url: `/api/tasks/attachment/proxy?id=${a.id}`,
        createdAt: a.createdAt.toISOString(),
        uploader: {
          id: a.uploader.id,
          name: a.uploader.name,
          avatarUrl: a.uploader.avatarUrl,
        },
      })),
      links,
    });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
