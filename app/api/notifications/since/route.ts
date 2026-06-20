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
    const params = new URL(req.url).searchParams;
    const cursorParam = params.get("cursor");
    const cursor = cursorParam ? new Date(cursorParam) : new Date();

    const rows = await db.notification.findMany({
      where: { userId: user.id, createdAt: { gt: cursor } },
      orderBy: { createdAt: "asc" },
      take: MAX,
    });

    // The unread count was previously recomputed on EVERY 2.5s poll for every
    // user, even when nothing changed — a constant baseline of full per-user
    // COUNTs. Now we only recompute it when there's a reason to: new rows arrived,
    // OR the client explicitly asked for a periodic reconcile (`?reconcile=1`,
    // sent ~every 30s) to catch read-state changes made in another tab/device.
    // When we don't recompute, `unread` is omitted; the client keeps its current
    // value (it already guards on `typeof data.unread === "number"`). This is a
    // pure load optimization with no change to what the badge eventually shows.
    const wantsReconcile = params.get("reconcile") === "1";
    const unread =
      rows.length > 0 || wantsReconcile
        ? await db.notification.count({
            where: { userId: user.id, readAt: null },
          })
        : undefined;

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
      // Omitted when unchanged — see above. Client keeps its prior count.
      ...(unread !== undefined ? { unread } : {}),
      cursor: nextCursor,
    });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
