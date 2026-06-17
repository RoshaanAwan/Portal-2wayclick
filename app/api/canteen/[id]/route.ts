import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { can } from "@/lib/permissions";
import { canteenInputSchema, toCents, formatMoney } from "@/lib/finance";

// PATCH /api/canteen/[id] — edit a still-PENDING canteen expense. Admin tier.
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
    const existing = await db.canteenExpense.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (existing.status !== "PENDING") {
      return NextResponse.json(
        { error: "Only pending canteen expenses can be edited." },
        { status: 409 },
      );
    }

    const input = canteenInputSchema.parse(await req.json());
    const amountCents = toCents(input.amount);

    await db.canteenExpense.update({
      where: { id },
      data: {
        vendor: input.vendor,
        amountCents,
        currency: input.currency,
        headcount: input.headcount,
        notes: input.notes || null,
        mealDate: input.mealDate ? new Date(input.mealDate) : undefined,
        slipUrl: input.slip.url,
        slipName: input.slip.name,
        slipSizeKb: input.slip.sizeKb,
      },
    });

    await audit({
      actor,
      action: "canteen.update",
      entity: "CanteenExpense",
      entityId: id,
      summary: `${actor.name} edited a canteen expense from ${input.vendor} (${formatMoney(
        amountCents,
        input.currency,
      )})`,
      detail: { vendor: input.vendor, amountCents, currency: input.currency },
    });

    return NextResponse.json({ ok: true, id });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (e?.name === "ZodError")
      return NextResponse.json(
        { error: e.issues?.[0]?.message || "Invalid canteen expense." },
        { status: 400 },
      );
    console.error("[canteen.patch]", e);
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}

// DELETE /api/canteen/[id] — remove a canteen expense. Admin tier.
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
    const canteen = await db.canteenExpense.findUnique({
      where: { id },
      select: { id: true, vendor: true },
    });
    if (!canteen) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await db.canteenExpense.delete({ where: { id } });

    await audit({
      actor,
      action: "canteen.delete",
      entity: "CanteenExpense",
      entityId: id,
      summary: `${actor.name} deleted a canteen expense from ${canteen.vendor}`,
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[canteen.delete]", e);
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
