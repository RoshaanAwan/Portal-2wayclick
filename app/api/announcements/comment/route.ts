import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { recordActivity } from "@/lib/activityFeed";
import { z } from "zod";

const schema = z.object({
  announcementId: z.string().min(1),
  body: z.string().trim().min(1).max(1000),
});

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const { announcementId, body } = schema.parse(await req.json());

    const announcement = await db.announcement.findUnique({
      where: { id: announcementId },
      select: { id: true, title: true },
    });
    if (!announcement) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await db.comment.create({
      data: { announcementId, authorId: user.id, body },
    });

    await recordActivity({ actor: user, verb: "commented", target: announcement.title });

    await audit({
      actor: user,
      action: "announcement.comment",
      entity: "Announcement",
      entityId: announcement.id,
      summary: `${user.name} commented on “${announcement.title}”`,
      detail: { body },
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
