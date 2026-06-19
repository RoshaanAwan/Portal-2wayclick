import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { can } from "@/lib/permissions";
import {
  shareLineInputSchema,
  percentToBps,
  toCents,
  formatPercentBps,
  formatMoney,
} from "@/lib/finance";

// POST /api/projects/[id]/shares — add a named share line carved out of revenue
// before payroll. Either a PERCENT of revenue or a FIXED amount. Admin tier.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireUser();
    if (!can.manageFinance(actor.role)) {
      return NextResponse.json({ error: "Admins only" }, { status: 403 });
    }

    const { id } = await params;
    const input = shareLineInputSchema.parse({
      ...(await req.json()),
      projectId: id,
    });

    const project = await db.project.findUnique({
      where: { id },
      select: { id: true, name: true, revenueCurrency: true },
    });
    if (!project) {
      return NextResponse.json({ error: "Unknown project." }, { status: 400 });
    }

    // Exactly one column is set per the line's kind.
    const percentBps = input.kind === "PERCENT" ? percentToBps(input.value) : null;
    const amountCents = input.kind === "FIXED" ? toCents(input.value) : null;

    // Append after the last existing line.
    const count = await db.projectShareLine.count({ where: { projectId: id } });
    const line = await db.projectShareLine.create({
      data: {
        projectId: id,
        label: input.label,
        percentBps,
        amountCents,
        position: count,
      },
    });

    const valueLabel =
      percentBps != null
        ? formatPercentBps(percentBps)
        : formatMoney(amountCents ?? 0, project.revenueCurrency);

    await audit({
      actor,
      action: "project.share_add",
      entity: "Project",
      entityId: id,
      summary: `${actor.name} added share "${input.label}" (${valueLabel}) on ${project.name}`,
      detail: { lineId: line.id, label: input.label, percentBps, amountCents },
    });

    return NextResponse.json({ ok: true, id: line.id });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (e?.name === "ZodError")
      return NextResponse.json(
        { error: e.issues?.[0]?.message || "Invalid share line." },
        { status: 400 },
      );
    console.error("[projects.shares.create]", e);
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
