import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { recordActivity } from "@/lib/activityFeed";
import { can, isSuperAdmin } from "@/lib/permissions";
import { expenseInputSchema, toCents, formatMoney } from "@/lib/finance";

// POST /api/expenses/create — raise a general expense claim (Admin tier only).
// The claim normally starts PENDING; a *different* Admin-tier user approves or
// rejects it. A Super Admin sits at the top of the approval chain, so their own
// claims are auto-approved on submit (recorded as both submitter and reviewer)
// rather than waiting on a review they'd just rubber-stamp themselves.
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

    // Super Admins approve their own claims on submit; everyone else starts PENDING.
    const autoApprove = isSuperAdmin(actor.role);

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
        ...(autoApprove
          ? {
              status: "APPROVED",
              reviewerId: actor.id,
              reviewerName: actor.name,
              decidedAt: new Date(),
            }
          : {}),
      },
    });

    await recordActivity({
      actor,
      verb: autoApprove ? "approved" : "requested",
      target: `an expense — ${input.title}`,
    });

    await audit({
      actor,
      action: "expense.create",
      entity: "Expense",
      entityId: expense.id,
      summary: `${actor.name} ${
        autoApprove ? "submitted and auto-approved" : "submitted"
      } expense "${input.title}" (${formatMoney(amountCents, input.currency)})`,
      detail: {
        title: input.title,
        category: input.category,
        amountCents,
        currency: input.currency,
        projectId: input.projectId || null,
        status: autoApprove ? "APPROVED" : "PENDING",
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
