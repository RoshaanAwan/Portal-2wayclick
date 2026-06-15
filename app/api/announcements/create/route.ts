import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { can } from "@/lib/permissions";
import { z } from "zod";
import { ANNOUNCEMENT_CATEGORIES } from "@/lib/constants";

const COVER_BY_CATEGORY: Record<string, string> = {
  General: "pink",
  Product: "accent",
  People: "emerald",
  Policy: "cyan",
  Event: "cyan",
};

const schema = z.object({
  title: z.string().trim().min(3).max(160),
  body: z.string().trim().min(1).max(4000),
  category: z.enum(ANNOUNCEMENT_CATEGORIES),
  pinned: z.boolean().optional().default(false),
});

export async function POST(req: Request) {
  try {
    const user = await requireUser();

    // Only elevated staff may post announcements.
    if (!can.postAnnouncements(user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { title, body, category, pinned } = schema.parse(await req.json());

    const announcement = await db.announcement.create({
      data: {
        title,
        body,
        category,
        pinned,
        coverColor: COVER_BY_CATEGORY[category] ?? "accent",
        authorId: user.id,
      },
    });

    await db.activity.create({
      data: {
        userId: user.id,
        verb: "posted",
        target: title,
      },
    });

    await audit({
      actor: user,
      action: "announcement.create",
      entity: "Announcement",
      entityId: announcement.id,
      summary: `${user.name} posted “${title}”`,
      detail: { category, pinned },
    });

    return NextResponse.json({ ok: true, id: announcement.id });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
