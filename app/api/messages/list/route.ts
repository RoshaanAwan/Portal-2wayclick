import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { membershipOf } from "@/lib/messaging";

// Paginated message history for a conversation, newest-last. Keyset pagination
// by createdAt (cuids aren't time-sortable): pass ?before=<ISO> to fetch the
// page older than that timestamp. We over-fetch DESC then reverse in JS so the
// client renders oldest→newest. Membership is required.
const PAGE = 30;

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const url = new URL(req.url);
    const conversationId = url.searchParams.get("c");
    const before = url.searchParams.get("before");
    if (!conversationId)
      return NextResponse.json({ error: "Missing conversation" }, { status: 400 });

    const member = await membershipOf(conversationId, user.id);
    if (!member)
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const rows = await db.message.findMany({
      where: {
        conversationId,
        ...(before ? { createdAt: { lt: new Date(before) } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: PAGE + 1, // one extra to detect hasMore
      select: {
        id: true,
        senderId: true,
        senderName: true,
        senderAvatar: true,
        body: true,
        createdAt: true,
      },
    });

    const hasMore = rows.length > PAGE;
    const page = hasMore ? rows.slice(0, PAGE) : rows;
    // Reverse to oldest-last for rendering; nextBefore is the oldest we have.
    const ordered = page.slice().reverse();
    const nextBefore = ordered.length > 0 ? ordered[0].createdAt.toISOString() : null;

    return NextResponse.json({
      messages: ordered.map((m) => ({
        id: m.id,
        senderId: m.senderId,
        senderName: m.senderName,
        senderAvatar: m.senderAvatar,
        body: m.body,
        createdAt: m.createdAt.toISOString(),
      })),
      hasMore,
      nextBefore,
    });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
