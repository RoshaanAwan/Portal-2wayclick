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

const patchSchema = z.object({
  title: z.string().trim().min(3).max(160),
  body: z.string().trim().min(1).max(4000),
  category: z.enum(ANNOUNCEMENT_CATEGORIES),
});

// PATCH /api/system/announcements/[id] — edit a platform announcement
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireSystemOwner();
    const { id } = await params;
    const { title, body, category } = patchSchema.parse(await req.json());

    const existing = await adminDb.announcement.findUnique({
      where: { id },
      select: { tenantId: true },
    });
    if (!existing || existing.tenantId !== null) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await adminDb.announcement.update({
      where: { id },
      data: { title, body, category, coverColor: COVER_BY_CATEGORY[category] ?? "accent" },
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED" || e?.message === "FORBIDDEN")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[system.announcements.patch]", e);
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}

// DELETE /api/system/announcements/[id] — delete a platform announcement
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireSystemOwner();
    const { id } = await params;

    const existing = await adminDb.announcement.findUnique({
      where: { id },
      select: { tenantId: true },
    });
    if (!existing || existing.tenantId !== null) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await adminDb.announcement.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED" || e?.message === "FORBIDDEN")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[system.announcements.delete]", e);
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
