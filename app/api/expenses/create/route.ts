import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { recordActivity } from "@/lib/activityFeed";
import { can } from "@/lib/permissions";
import { expenseInputSchema, toCents, formatMoney } from "@/lib/finance";

// POST /api/expenses/create — raise a general expense claim (Admin tier only).
// The claim starts PENDING; a *different* Admin-tier user approves/rejects it.
export async function POST(req: Request) {
  try {
    const actor = await requireUser();
    if (!can.manageFinance(actor.role)) {
      return NextResponse.json({ error: "Admins only" }, { status: 403 });
    }

    const input = expenseInputSchema.parse(await req.json());

    // If a project is named, make sure it exists (avoids a dangling FK error).
    if (input.projectId) {
      const project = await db.project.findUnique({
        where: { id: input.projectId },
        select: { id: true },
      });
      if (!project) {
        return NextResponse.json({ error: "Unknown project." }, { status: 400 });
      }
    }

    const amountCents = toCents(input.amount);

    const expense = await db.expense.create({
      data: {
        title: input.title,
        category: input.category,
        amountCents,
        currency: input.currency,
        notes: input.notes || null,
        spentOn: input.spentOn ? new Date(input.spentOn) : undefined,
        projectId: input.projectId || null,
        slipUrl: input.slip?.url ?? null,
        slipName: input.slip?.name ?? null,
        slipSizeKb: input.slip?.sizeKb ?? null,
        submitterId: actor.id,
        submitterName: actor.name,
      },
    });

    await recordActivity({
      actor,
      verb: "requested",
      target: `an expense — ${input.title}`,
    });

    await audit({
      actor,
      action: "expense.create",
      entity: "Expense",
      entityId: expense.id,
      summary: `${actor.name} submitted expense "${input.title}" (${formatMoney(
        amountCents,
        input.currency,
      )})`,
      detail: {
        title: input.title,
        category: input.category,
        amountCents,
        currency: input.currency,
        projectId: input.projectId || null,
      },
    });

    return NextResponse.json({ ok: true, id: expense.id });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (e?.name === "ZodError")
      return NextResponse.json(
        { error: e.issues?.[0]?.message || "Invalid expense." },
        { status: 400 },
      );
    console.error("[expenses.create]", e);
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
