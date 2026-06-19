import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { can } from "@/lib/permissions";
import { recomputeProjectRevenue } from "@/lib/financeQueries";
import { incomeLineInputSchema, toCents, formatMoney } from "@/lib/finance";

// POST /api/projects/[id]/income — add a named income line to a project. The
// project's total revenue (Project.revenueCents) is recomputed from its lines.
// Setting the currency on the line (re)sets the project's currency. Admin tier.
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
    const input = incomeLineInputSchema.parse({
      ...(await req.json()),
      projectId: id,
    });

    const project = await db.project.findUnique({
      where: { id },
      select: { id: true, name: true },
    });
    if (!project) {
      return NextResponse.json({ error: "Unknown project." }, { status: 400 });
    }

    const amountCents = toCents(input.amount);

    // Append after the last existing line and (re)set the project currency.
    const count = await db.projectIncomeLine.count({ where: { projectId: id } });
    const [line] = await Promise.all([
      db.projectIncomeLine.create({
        data: {
          projectId: id,
          label: input.label,
          amountCents,
          position: count,
        },
      }),
      db.project.update({
        where: { id },
        data: { revenueCurrency: input.currency },
      }),
    ]);

    // Cached total now includes the new line.
    const revenueCents = await recomputeProjectRevenue(id);

    await audit({
      actor,
      action: "project.income_add",
      entity: "Project",
      entityId: id,
      summary: `${actor.name} added income "${input.label}" (${formatMoney(
        amountCents,
        input.currency,
      )}) to ${project.name}`,
      detail: { lineId: line.id, label: input.label, amountCents, revenueCents },
    });

    return NextResponse.json({ ok: true, id: line.id, revenueCents });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (e?.name === "ZodError")
      return NextResponse.json(
        { error: e.issues?.[0]?.message || "Invalid income line." },
        { status: 400 },
      );
    console.error("[projects.income.create]", e);
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
