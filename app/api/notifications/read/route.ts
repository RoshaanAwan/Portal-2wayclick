import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

// Persist read state. With an `id` it marks one notification read; without, it
// marks all of the user's unread notifications read ("Mark all read"). The
// `userId` filter scopes every write to the caller so one user can't touch
// another's inbox.
const schema = z.object({ id: z.string().min(1).optional() });

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const { id } = schema.parse(await req.json().catch(() => ({})));

    const result = await db.notification.updateMany({
      where: { userId: user.id, readAt: null, ...(id ? { id } : {}) },
      data: { readAt: new Date() },
    });

    return NextResponse.json({ ok: true, updated: result.count });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
