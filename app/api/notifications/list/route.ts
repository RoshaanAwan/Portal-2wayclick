import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

// Initial load for the topbar bell: the user's most recent notifications plus an
// exact unread count (which may exceed the page size).
export async function GET() {
  try {
    const user = await requireUser();

    const [rows, unread] = await Promise.all([
      db.notification.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      db.notification.count({ where: { userId: user.id, readAt: null } }),
    ]);

    return NextResponse.json({
      unread,
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
    });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
