import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { isManagerTier } from "@/lib/permissions";
import { z } from "zod";
import { ISSUE_LINK_TYPES, issueLinkPhrasing } from "@/lib/constants";
import { parseIssueKey } from "@/lib/issues";

// Create a directed issue link from one card to another (JIRA "issue links").
// The target is addressed by its human key (e.g. "PORTAL-42"), resolved against
// the *source card's board* so keys stay unambiguous. Creator-or-manager of the
// source card may link it; the unique constraint collapses duplicate links.
const schema = z.object({
  sourceId: z.string().min(1),
  // The other issue, given as its key ("PREFIX-123").
  targetKey: z.string().trim().min(1).max(40),
  type: z.enum(ISSUE_LINK_TYPES),
});

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const { sourceId, targetKey, type } = schema.parse(await req.json());

    const parsed = parseIssueKey(targetKey);
    if (!parsed) {
      return NextResponse.json({ error: "Invalid issue key" }, { status: 400 });
    }

    const source = await db.task.findUnique({
      where: { id: sourceId },
      select: {
        id: true,
        title: true,
        creatorId: true,
        list: { select: { boardId: true, board: { select: { keyPrefix: true } } } },
      },
    });
    if (!source) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }
    if (!isManagerTier(user.role) && source.creatorId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // The key prefix must match the source card's board, and the number must
    // resolve to a real card on that board.
    if (parsed.prefix !== source.list.board.keyPrefix) {
      return NextResponse.json(
        { error: `No ${parsed.prefix} board here` },
        { status: 404 },
      );
    }
    const target = await db.task.findFirst({
      where: {
        issueNumber: parsed.number,
        list: { boardId: source.list.boardId },
      },
      select: { id: true, title: true },
    });
    if (!target) {
      return NextResponse.json({ error: "Issue not found" }, { status: 404 });
    }
    if (target.id === source.id) {
      return NextResponse.json(
        { error: "Can't link an issue to itself" },
        { status: 400 },
      );
    }

    // Upsert so re-linking the same pair+type is idempotent (no 500 on the
    // unique constraint).
    const link = await db.issueLink.upsert({
      where: {
        sourceId_targetId_type: { sourceId, targetId: target.id, type },
      },
      create: { sourceId, targetId: target.id, type },
      update: {},
      select: { id: true },
    });

    await audit({
      actor: user,
      action: "task.link",
      entity: "Task",
      entityId: source.id,
      summary: `${user.name} linked ${source.list.board.keyPrefix}-${parsed.number}: ${issueLinkPhrasing[type].outward} “${target.title}”`,
      detail: { type, sourceId, targetId: target.id },
    });

    return NextResponse.json({ ok: true, id: link.id, targetId: target.id });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
