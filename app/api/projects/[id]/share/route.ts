import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { can } from "@/lib/permissions";
import { newShareToken, shareUrl } from "@/lib/share";
import { z } from "zod";

// ── Manage a project's client share link ───────────────────────────────────
// Admins-only, like the rest of project management. Two actions:
//   • regenerate → issue a fresh token (also used to "create" a link on a
//     project that somehow has none). Any previously shared URL stops working.
//   • revoke     → drop the token entirely; the public board returns 404.
// The link itself is read at /shared/<token>; this route only mints/kills it.

const schema = z.object({
  action: z.enum(["regenerate", "revoke"]),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireUser();
    if (!can.manageProjects(actor.role)) {
      return NextResponse.json({ error: "Admins only" }, { status: 403 });
    }

    const { id } = await params;
    const { action } = schema.parse(await req.json());

    const project = await db.project.findUnique({
      where: { id },
      select: { id: true, name: true },
    });
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (action === "revoke") {
      await db.project.update({
        where: { id },
        data: { shareToken: null },
      });
      await audit({
        actor,
        action: "project.share_revoke",
        entity: "Project",
        entityId: project.id,
        summary: `${actor.name} revoked the client share link for “${project.name}”`,
      });
      return NextResponse.json({ ok: true, shareUrl: null });
    }

    // regenerate (also covers first-time creation if the link was missing)
    const shareToken = newShareToken();
    await db.project.update({
      where: { id },
      data: { shareToken },
    });
    await audit({
      actor,
      action: "project.share_regenerate",
      entity: "Project",
      entityId: project.id,
      summary: `${actor.name} regenerated the client share link for “${project.name}”`,
    });
    return NextResponse.json({ ok: true, shareUrl: shareUrl(shareToken) });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
