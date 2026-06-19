import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { can } from "@/lib/permissions";
import { toCents, formatMoney } from "@/lib/finance";

// POST /api/salaries/[id]/payments — log a payment against a salary. Admin tier.
// Paid = sum of payments; remaining = salary total − paid (computed on read).
const bodySchema = z.object({
  amount: z.number().min(0.01).max(10_000_000), // major units
  paidOn: z.string().trim().optional().or(z.literal("")),
  note: z.string().trim().max(200).optional().or(z.literal("")),
});

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
    const input = bodySchema.parse(await req.json());

    const salary = await db.projectSalary.findUnique({
      where: { id },
      select: {
        id: true,
        userName: true,
        currency: true,
        project: { select: { name: true } },
      },
    });
    if (!salary) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const amountCents = toCents(input.amount);
    const payment = await db.salaryPayment.create({
      data: {
        salaryId: id,
        amountCents,
        paidOn: input.paidOn ? new Date(input.paidOn) : new Date(),
        note: input.note || null,
      },
    });

    await audit({
      actor,
      action: "salary.payment_add",
      entity: "ProjectSalary",
      entityId: id,
      summary: `${actor.name} logged a ${formatMoney(
        amountCents,
        salary.currency,
      )} payment to ${salary.userName} on ${salary.project.name}`,
      detail: { paymentId: payment.id, amountCents },
    });

    return NextResponse.json({ ok: true, id: payment.id });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (e?.name === "ZodError")
      return NextResponse.json(
        { error: e.issues?.[0]?.message || "Invalid payment." },
        { status: 400 },
      );
    console.error("[salaries.payment.add]", e);
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
