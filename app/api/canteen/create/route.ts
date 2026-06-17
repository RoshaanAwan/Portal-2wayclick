import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { recordActivity } from "@/lib/activityFeed";
import { can } from "@/lib/permissions";
import { canteenInputSchema, toCents, formatMoney } from "@/lib/finance";

// POST /api/canteen/create — raise a canteen expense (Admin tier only). The slip
// is required (enforced by the schema). Starts PENDING for a second Admin-tier
// user to approve/reject.
export async function POST(req: Request) {
  try {
    const actor = await requireUser();
    if (!can.manageFinance(actor.role)) {
      return NextResponse.json({ error: "Admins only" }, { status: 403 });
    }

    const input = canteenInputSchema.parse(await req.json());
    const amountCents = toCents(input.amount);

    const canteen = await db.canteenExpense.create({
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
        submitterId: actor.id,
        submitterName: actor.name,
      },
    });

    await recordActivity({
      actor,
      verb: "requested",
      target: `a canteen expense from ${input.vendor}`,
    });

    await audit({
      actor,
      action: "canteen.create",
      entity: "CanteenExpense",
      entityId: canteen.id,
      summary: `${actor.name} submitted a canteen expense from ${input.vendor} (${formatMoney(
        amountCents,
        input.currency,
      )})`,
      detail: {
        vendor: input.vendor,
        amountCents,
        currency: input.currency,
        headcount: input.headcount,
      },
    });

    return NextResponse.json({ ok: true, id: canteen.id });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (e?.name === "ZodError")
      return NextResponse.json(
        { error: e.issues?.[0]?.message || "Invalid canteen expense." },
        { status: 400 },
      );
    console.error("[canteen.create]", e);
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
