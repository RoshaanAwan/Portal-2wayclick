import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSystemOwner } from "@/lib/auth";
import { adminDb } from "@/lib/db";
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
});

// POST /api/system/announcements/create
// System Owner only — creates a platform-wide announcement (tenantId=null,
// authorId=null) that appears pinned in every tenant's feed.
export async function POST(req: Request) {
  try {
    const actor = await requireSystemOwner();
    const { title, body, category } = schema.parse(await req.json());

    await adminDb.announcement.create({
      data: {
        tenantId: null,
        authorId: null,
        authorName: actor.name,
        title,
        body,
        category,
        pinned: true,
        coverColor: COVER_BY_CATEGORY[category] ?? "accent",
      },
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED" || e?.message === "FORBIDDEN")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[system.announcements.create]", e);
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
