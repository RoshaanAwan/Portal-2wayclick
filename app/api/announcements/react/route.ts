import { NextResponse } from "next/server";
import { requireTenantUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { z } from "zod";

const REACTION_EMOJIS = ["🎉", "🔥", "❤️", "👏", "🚀"] as const;

const schema = z.object({
  announcementId: z.string().min(1),
  emoji: z.enum(REACTION_EMOJIS),
});

export async function POST(req: Request) {
  try {
    const user = await requireTenantUser();
    const { announcementId, emoji } = schema.parse(await req.json());

    // Ensure the announcement exists before mutating.
    const announcement = await db.announcement.findUnique({
      where: { id: announcementId },
      select: { id: true, title: true },
    });
    if (!announcement) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const existing = await db.reaction.findUnique({
      where: {
        announcementId_userId_emoji: {
          announcementId,
          userId: user.id,
          emoji,
        },
      },
    });

    if (existing) {
      await db.reaction.delete({ where: { id: existing.id } });
      return NextResponse.json({ ok: true, reacted: false });
    }

    await db.reaction.create({
      data: { announcementId, userId: user.id, emoji },
    });

    await audit({
      actor: user,
      action: "announcement.react",
      entity: "Announcement",
      entityId: announcement.id,
      summary: `${user.name} reacted to “${announcement.title}”`,
      detail: { emoji },
    });

    return NextResponse.json({ ok: true, reacted: true });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
