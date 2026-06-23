import { NextResponse } from "next/server";
import { requireTenantUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { can } from "@/lib/permissions";
import { recomputeProjectRevenue } from "@/lib/financeQueries";

// DELETE /api/projects/[id]/income/[lineId] — remove an income line. The
// project's cached revenue total is recomputed afterwards. Admin tier.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; lineId: string }> },
) {
  try {
    const actor = await requireTenantUser();
    if (!can.manageFinance(actor.role)) {
      return NextResponse.json({ error: "Admins only" }, { status: 403 });
    }

    const { id, lineId } = await params;
    const line = await db.projectIncomeLine.findUnique({
      where: { id: lineId },
      select: { id: true, projectId: true, label: true },
    });
    // Guard the line belongs to the project in the path.
    if (!line || line.projectId !== id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await db.projectIncomeLine.delete({ where: { id: lineId } });
    const revenueCents = await recomputeProjectRevenue(id);

    await audit({
      actor,
      action: "project.income_delete",
      entity: "Project",
      entityId: id,
      summary: `${actor.name} removed income "${line.label}"`,
      detail: { lineId, revenueCents },
    });

    return NextResponse.json({ ok: true, revenueCents });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[projects.income.delete]", e);
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
