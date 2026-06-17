import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notifications";
import { recordActivity } from "@/lib/activityFeed";
import { can } from "@/lib/permissions";
import { decisionSchema, formatMoney } from "@/lib/finance";

// POST /api/expenses/decide — approve or reject a pending expense. Admin tier.
// The approver must NOT be the submitter, so the workflow keeps two parties.
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    if (!can.manageFinance(user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id, decision } = decisionSchema.parse(await req.json());

    const expense = await db.expense.findUnique({ where: { id } });
    if (!expense || expense.status !== "PENDING") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Submitters can't decide on their own claims.
    if (expense.submitterId && expense.submitterId === user.id) {
      return NextResponse.json(
        { error: "You can't decide on your own expense." },
        { status: 403 },
      );
    }

    await db.expense.update({
      where: { id },
      data: {
        status: decision,
        decidedAt: new Date(),
        reviewerId: user.id,
        reviewerName: user.name,
      },
    });

    const verb = decision === "APPROVED" ? "approved" : "denied";

    await recordActivity({
      actor: user,
      verb,
      target: `${expense.submitterName}'s expense "${expense.title}"`,
      meta: { expenseId: expense.id },
    });

    await audit({
      actor: user,
      action: "expense.decide",
      entity: "Expense",
      entityId: expense.id,
      targetUserId: expense.submitterId,
      summary: `${user.name} ${verb} ${expense.submitterName}'s expense "${expense.title}" (${formatMoney(
        expense.amountCents,
        expense.currency,
      )})`,
      detail: { decision, amountCents: expense.amountCents, currency: expense.currency },
    });

    // Tell the submitter their claim was decided.
    if (expense.submitterId) {
      await notify({
        userId: expense.submitterId,
        type: "expense.decided",
        message: `${verb} your expense "${expense.title}"`,
        link: "/expenses",
        actor: user,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (e?.name === "ZodError")
      return NextResponse.json({ error: "Invalid decision." }, { status: 400 });
    console.error("[expenses.decide]", e);
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
