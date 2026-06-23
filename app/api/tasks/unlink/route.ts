import { NextResponse } from "next/server";
import { requireTenantUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { isManagerTier } from "@/lib/permissions";
import { z } from "zod";

// Remove an issue link. Allowed for a manager or the creator of either end.
const schema = z.object({ linkId: z.string().min(1) });

export async function POST(req: Request) {
  try {
    const user = await requireTenantUser();
    const { linkId } = schema.parse(await req.json());

    const link = await db.issueLink.findUnique({
      where: { id: linkId },
      select: {
        id: true,
        source: { select: { creatorId: true } },
        target: { select: { creatorId: true } },
      },
    });
    if (!link) {
      return NextResponse.json({ error: "Link not found" }, { status: 404 });
    }

    const allowed =
      isManagerTier(user.role) ||
      link.source.creatorId === user.id ||
      link.target.creatorId === user.id;
    if (!allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await db.issueLink.delete({ where: { id: linkId } });

    await audit({
      actor: user,
      action: "task.unlink",
      entity: "IssueLink",
      entityId: linkId,
      summary: `${user.name} removed an issue link`,
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
