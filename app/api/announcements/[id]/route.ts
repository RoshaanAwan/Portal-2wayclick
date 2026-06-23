import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { can } from "@/lib/permissions";
import { ANNOUNCEMENT_CATEGORIES } from "@/lib/constants";

// ── Edit / delete an announcement ──────────────────────────────────────────
// Admin tier only (Super Admin + Admin) — see can.manageAnnouncements. Posting
// is open to the whole manager tier, but rewriting or removing a company-wide
// post is a privileged action, so it's locked to admins regardless of author.

const COVER_BY_CATEGORY: Record<string, string> = {
  General: "pink",
  Product: "accent",
  People: "emerald",
  Policy: "cyan",
  Event: "cyan",
};

const updateSchema = z.object({
  title: z.string().trim().min(3).max(160),
  body: z.string().trim().min(1).max(4000),
  category: z.enum(ANNOUNCEMENT_CATEGORIES),
  pinned: z.boolean().optional().default(false),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireTenantUser();
    if (!can.manageAnnouncements(user.role)) {
      return NextResponse.json({ error: "Admins only" }, { status: 403 });
    }

    const { id } = await params;
    const { title, body, category, pinned } = updateSchema.parse(
      await req.json(),
    );

    const existing = await db.announcement.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await db.announcement.update({
      where: { id },
      data: {
        title,
        body,
        category,
        pinned,
        coverColor: COVER_BY_CATEGORY[category] ?? "accent",
      },
    });

    await audit({
      actor: user,
      action: "announcement.update",
      entity: "Announcement",
      entityId: id,
      summary: `${user.name} edited “${title}”`,
      detail: { category, pinned },
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireTenantUser();
    if (!can.manageAnnouncements(user.role)) {
      return NextResponse.json({ error: "Admins only" }, { status: 403 });
    }

    const { id } = await params;

    const existing = await db.announcement.findUnique({
      where: { id },
      select: { id: true, title: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Comments, reactions, and read receipts cascade on delete (schema).
    await db.announcement.delete({ where: { id } });

    await audit({
      actor: user,
      action: "announcement.delete",
      entity: "Announcement",
      entityId: id,
      summary: `${user.name} deleted “${existing.title}”`,
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
