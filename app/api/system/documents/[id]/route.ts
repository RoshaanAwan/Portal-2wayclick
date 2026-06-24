import { NextResponse } from "next/server";
import { requireSystemOwner } from "@/lib/auth";
import { adminDb } from "@/lib/db";
import { DOC_CATEGORIES } from "@/lib/constants";

async function getDoc(id: string, tenantId: string) {
  const doc = await adminDb.document.findUnique({
    where: { id },
    select: { tenantId: true },
  });
  if (!doc || doc.tenantId !== tenantId) return null;
  return doc;
}

// PATCH /api/system/documents/[id] — edit metadata.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireSystemOwner();
    const { id } = await params;

    if (!await getDoc(id, actor.tenantId))
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await req.json();
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const description = typeof body.description === "string" ? body.description.trim() : "";
    const category = (DOC_CATEGORIES as readonly string[]).includes(body.category)
      ? body.category as (typeof DOC_CATEGORIES)[number]
      : "General";

    if (!title) return NextResponse.json({ error: "Title is required." }, { status: 400 });

    const updated = await adminDb.document.update({
      where: { id },
      data: { title, description: description || null, category },
    });
    return NextResponse.json({ ok: true, document: updated });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED" || e?.message === "FORBIDDEN")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[system.documents.patch]", e);
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}

// DELETE /api/system/documents/[id]
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireSystemOwner();
    const { id } = await params;

    if (!await getDoc(id, actor.tenantId))
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    await adminDb.document.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED" || e?.message === "FORBIDDEN")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[system.documents.delete]", e);
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
