import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notifications";
import { recordActivity } from "@/lib/activityFeed";
import { can } from "@/lib/permissions";
import { decisionSchema, formatMoney } from "@/lib/finance";

// POST /api/canteen/decide — approve or reject a pending canteen expense. Admin
// tier. The approver must not be the submitter.
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    if (!can.manageFinance(user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id, decision } = decisionSchema.parse(await req.json());

    const canteen = await db.canteenExpense.findUnique({ where: { id } });
    if (!canteen || canteen.status !== "PENDING") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (canteen.submitterId && canteen.submitterId === user.id) {
      return NextResponse.json(
        { error: "You can't decide on your own canteen expense." },
        { status: 403 },
      );
    }

    await db.canteenExpense.update({
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
      target: `${canteen.submitterName}'s canteen expense from ${canteen.vendor}`,
      meta: { canteenExpenseId: canteen.id },
    });

    await audit({
      actor: user,
      action: "canteen.decide",
      entity: "CanteenExpense",
      entityId: canteen.id,
      targetUserId: canteen.submitterId,
      summary: `${user.name} ${verb} ${canteen.submitterName}'s canteen expense from ${canteen.vendor} (${formatMoney(
        canteen.amountCents,
        canteen.currency,
      )})`,
      detail: { decision, amountCents: canteen.amountCents, currency: canteen.currency },
    });

    if (canteen.submitterId) {
      await notify({
        userId: canteen.submitterId,
        type: "canteen.decided",
        message: `${verb} your canteen expense from ${canteen.vendor}`,
        link: "/canteen",
        actor: user,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (e?.name === "ZodError")
      return NextResponse.json({ error: "Invalid decision." }, { status: 400 });
    console.error("[canteen.decide]", e);
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
