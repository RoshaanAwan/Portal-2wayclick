import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { can } from "@/lib/permissions";

// DELETE /api/salaries/[id]/payments/[paymentId] — remove a logged payment.
// Admin tier. Paid / remaining recompute on the next read.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; paymentId: string }> },
) {
  try {
    const actor = await requireUser();
    if (!can.manageFinance(actor.role)) {
      return NextResponse.json({ error: "Admins only" }, { status: 403 });
    }

    const { id, paymentId } = await params;
    const payment = await db.salaryPayment.findUnique({
      where: { id: paymentId },
      select: { id: true, salaryId: true, amountCents: true },
    });
    // Guard the payment belongs to the salary in the path.
    if (!payment || payment.salaryId !== id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await db.salaryPayment.delete({ where: { id: paymentId } });

    await audit({
      actor,
      action: "salary.payment_delete",
      entity: "ProjectSalary",
      entityId: id,
      summary: `${actor.name} removed a salary payment`,
      detail: { paymentId, amountCents: payment.amountCents },
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[salaries.payment.delete]", e);
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
