import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { can } from "@/lib/permissions";
import { expenseInputSchema, toCents, formatMoney } from "@/lib/finance";

// PATCH /api/expenses/[id] — edit a still-PENDING expense. Admin tier. Once an
// expense is APPROVED or REJECTED it is locked (the decision is a record).
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireUser();
    if (!can.manageFinance(actor.role)) {
      return NextResponse.json({ error: "Admins only" }, { status: 403 });
    }

    const { id } = await params;
    const existing = await db.expense.findUnique({
      where: { id },
      select: { id: true, status: true, title: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Expense not found" }, { status: 404 });
    }
    if (existing.status !== "PENDING") {
      return NextResponse.json(
        { error: "Only pending expenses can be edited." },
        { status: 409 },
      );
    }

    const input = expenseInputSchema.parse(await req.json());

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

    await db.expense.update({
      where: { id },
      data: {
        title: input.title,
        category: input.category,
        amountCents,
        currency: input.currency,
        notes: input.notes || null,
        spentOn: input.spentOn ? new Date(input.spentOn) : undefined,
        projectId: input.projectId || null,
        // A slip of `null` clears it; `undefined` (omitted) leaves it untouched.
        slipUrl: input.slip === undefined ? undefined : input.slip?.url ?? null,
        slipName: input.slip === undefined ? undefined : input.slip?.name ?? null,
        slipSizeKb:
          input.slip === undefined ? undefined : input.slip?.sizeKb ?? null,
      },
    });

    await audit({
      actor,
      action: "expense.update",
      entity: "Expense",
      entityId: id,
      summary: `${actor.name} edited expense "${input.title}" (${formatMoney(
        amountCents,
        input.currency,
      )})`,
      detail: { title: input.title, amountCents, currency: input.currency },
    });

    return NextResponse.json({ ok: true, id });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (e?.name === "ZodError")
      return NextResponse.json(
        { error: e.issues?.[0]?.message || "Invalid expense." },
        { status: 400 },
      );
    console.error("[expenses.patch]", e);
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}

// DELETE /api/expenses/[id] — remove an expense. Admin tier.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireUser();
    if (!can.manageFinance(actor.role)) {
      return NextResponse.json({ error: "Admins only" }, { status: 403 });
    }

    const { id } = await params;
    const expense = await db.expense.findUnique({
      where: { id },
      select: { id: true, title: true },
    });
    if (!expense) {
      return NextResponse.json({ error: "Expense not found" }, { status: 404 });
    }

    await db.expense.delete({ where: { id } });

    await audit({
      actor,
      action: "expense.delete",
      entity: "Expense",
      entityId: id,
      summary: `${actor.name} deleted expense "${expense.title}"`,
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[expenses.delete]", e);
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
