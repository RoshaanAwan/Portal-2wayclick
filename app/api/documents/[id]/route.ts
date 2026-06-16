import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { DOC_CATEGORIES } from "@/lib/constants";

// ── Edit / delete a document ────────────────────────────────────────────────
// The document library is a shared company resource: any authenticated user may
// edit or delete any document. Every change is still written to the audit log so
// there's a trail of who touched what. Only the metadata is editable here;
// replacing the file itself goes back through the upload flow.

const updateSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(120),
  description: z.string().trim().max(280).optional().or(z.literal("")),
  category: z.enum(DOC_CATEGORIES),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const { id } = await params;

    const existing = await db.document.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { title, description, category } = updateSchema.parse(
      await req.json(),
    );

    await db.document.update({
      where: { id },
      data: {
        title,
        description: description ? description : null,
        category,
      },
    });

    await audit({
      actor: user,
      action: "document.update",
      entity: "Document",
      entityId: id,
      summary: `${user.name} edited document “${title}”`,
      detail: { category },
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
    const user = await requireUser();
    const { id } = await params;

    const existing = await db.document.findUnique({
      where: { id },
      select: { id: true, title: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await db.document.delete({ where: { id } });

    await audit({
      actor: user,
      action: "document.delete",
      entity: "Document",
      entityId: id,
      summary: `${user.name} deleted document “${existing.title}”`,
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
