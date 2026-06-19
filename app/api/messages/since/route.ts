import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

// Polling delivery for chat (serverless-safe; replaces the in-process SSE bus
// which can't cross Vercel instances). Returns every message in any of the
// caller's conversations created after `cursor`, plus the new cursor. The client
// (MessagingProvider) feeds these through the same dedupe/ingest path the SSE
// stream used, so open threads append and the list/unread badge update — exactly
// as before, just pulled on an interval instead of pushed.
//
// `cursor` is an ISO timestamp (the createdAt of the newest message seen). On the
// first poll the client passes its initial-load high-water mark, so we never
// replay history. We also cap the batch to stay cheap.
export const dynamic = "force-dynamic";

const MAX = 200;

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const cursorParam = new URL(req.url).searchParams.get("cursor");
    // No cursor → nothing to catch up on yet; the client seeds from its own
    // initial load. Default to "now" so the first poll returns only future msgs.
    const cursor = cursorParam ? new Date(cursorParam) : new Date();

    const rows = await db.message.findMany({
      where: {
        createdAt: { gt: cursor },
        conversation: { members: { some: { userId: user.id } } },
      },
      orderBy: { createdAt: "asc" },
      take: MAX,
      select: {
        id: true,
        conversationId: true,
        senderId: true,
        senderName: true,
        senderAvatar: true,
        body: true,
        createdAt: true,
      },
    });

    // Advance the cursor to the newest row we returned (or keep the old one if
    // nothing new). Always a string the client echoes back next poll.
    const nextCursor =
      rows.length > 0
        ? rows[rows.length - 1].createdAt.toISOString()
        : cursor.toISOString();

    return NextResponse.json({
      messages: rows.map((m) => ({
        id: m.id,
        conversationId: m.conversationId,
        senderId: m.senderId,
        senderName: m.senderName,
        senderAvatar: m.senderAvatar,
        body: m.body,
        createdAt: m.createdAt.toISOString(),
        clientId: null,
      })),
      cursor: nextCursor,
    });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
