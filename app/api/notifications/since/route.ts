import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

// Polling delivery for the bell (serverless-safe replacement for the SSE bus).
// Returns the caller's notifications created after `cursor`, plus the current
// unread count so the badge stays authoritative even when read-state changed
// elsewhere. The client (useNotifications) ingests new rows through its existing
// `seen`/ingest path. Same cursor contract as /api/messages/since.
export const dynamic = "force-dynamic";

const MAX = 50;

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const cursorParam = new URL(req.url).searchParams.get("cursor");
    const cursor = cursorParam ? new Date(cursorParam) : new Date();

    const [rows, unread] = await Promise.all([
      db.notification.findMany({
        where: { userId: user.id, createdAt: { gt: cursor } },
        orderBy: { createdAt: "asc" },
        take: MAX,
      }),
      db.notification.count({ where: { userId: user.id, readAt: null } }),
    ]);

    const nextCursor =
      rows.length > 0
        ? rows[rows.length - 1].createdAt.toISOString()
        : cursor.toISOString();

    return NextResponse.json({
      notifications: rows.map((n) => ({
        id: n.id,
        type: n.type,
        message: n.message,
        link: n.link,
        actorName: n.actorName,
        actorAvatar: n.actorAvatar,
        createdAt: n.createdAt.toISOString(),
        readAt: n.readAt ? n.readAt.toISOString() : null,
      })),
      unread,
      cursor: nextCursor,
    });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
