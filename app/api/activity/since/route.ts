import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

// Polling delivery for the company-wide Live Activity Wall (serverless-safe
// replacement for the SSE bus). Returns activity created after `cursor`, in the
// FeedItem shape the dashboard renders. Auth-gated like the stream, but the feed
// is shared — every signed-in user polls the same company pulse.
export const dynamic = "force-dynamic";

const MAX = 30;

export async function GET(req: Request) {
  try {
    await requireUser();
    const cursorParam = new URL(req.url).searchParams.get("cursor");
    const cursor = cursorParam ? new Date(cursorParam) : new Date();

    const rows = await db.activity.findMany({
      where: { createdAt: { gt: cursor } },
      orderBy: { createdAt: "asc" },
      take: MAX,
      include: {
        user: { select: { name: true, avatarUrl: true, title: true } },
      },
    });

    const nextCursor =
      rows.length > 0
        ? rows[rows.length - 1].createdAt.toISOString()
        : cursor.toISOString();

    return NextResponse.json({
      activities: rows.map((a) => ({
        id: a.id,
        verb: a.verb,
        target: a.target,
        createdAt: a.createdAt.toISOString(),
        user: {
          name: a.user.name,
          avatarUrl: a.user.avatarUrl,
          title: a.user.title,
        },
      })),
      cursor: nextCursor,
    });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
