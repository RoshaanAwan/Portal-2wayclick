import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { can } from "@/lib/permissions";
import { toCents, formatMoney } from "@/lib/invoices";
import {
  userSalaryInputSchema,
  percentToBpsClamped,
} from "@/lib/userSalary";

// POST /api/user-salaries/create — set a user's monthly salary (total + the way
// it's allocated across projects). Admin tier. One salary per user: if one
// exists it is fully replaced (total, currency, and the allocation set). The
// allocations need not sum to the total — the UI surfaces any remainder.
export async function POST(req: Request) {
  try {
    const actor = await requireUser();
    if (!can.manageFinance(actor.role)) {
      return NextResponse.json({ error: "Admins only" }, { status: 403 });
    }

    const input = userSalaryInputSchema.parse(await req.json());

    const user = await db.user.findUnique({
      where: { id: input.userId },
      select: { id: true, name: true },
    });
    if (!user) {
      return NextResponse.json({ error: "Unknown user." }, { status: 400 });
    }

    // Validate the allocation projects exist and de-dupe by project (one line per
    // project). Resolve each line into a stored row (percentBps XOR amountCents).
    const projectIds = [...new Set(input.allocations.map((a) => a.projectId))];
    if (projectIds.length > 0) {
      const found = await db.project.findMany({
        where: { id: { in: projectIds } },
        select: { id: true },
      });
      if (found.length !== projectIds.length) {
        return NextResponse.json(
          { error: "One or more allocation projects are unknown." },
          { status: 400 },
        );
      }
    }

    const seen = new Set<string>();
    const allocations = input.allocations
      .filter((a) => {
        if (seen.has(a.projectId)) return false;
        seen.add(a.projectId);
        return true;
      })
      .map((a, position) => ({
        projectId: a.projectId,
        percentBps: a.kind === "PERCENT" ? percentToBpsClamped(a.value) : null,
        amountCents: a.kind === "FIXED" ? toCents(a.value) : null,
        position,
      }));

    const totalCents = toCents(input.total);
    const effectiveFrom = input.effectiveFrom
      ? new Date(input.effectiveFrom)
      : new Date();

    // Upsert on the unique userId. Replacing fully (delete-all + recreate the
    // allocations) keeps the stored set exactly what was submitted.
    const salary = await db.userSalary.upsert({
      where: { userId: input.userId },
      create: {
        tenantId: actor.tenantId,
        userId: input.userId,
        totalCents,
        currency: input.currency,
        effectiveFrom,
        active: true,
        allocations: { create: allocations },
      },
      update: {
        totalCents,
        currency: input.currency,
        effectiveFrom,
        active: true,
        allocations: { deleteMany: {}, create: allocations },
      },
    });

    await audit({
      actor,
      action: "salary.create",
      entity: "UserSalary",
      entityId: salary.id,
      targetUserId: input.userId,
      summary: `${actor.name} set ${user.name}'s monthly salary to ${formatMoney(
        totalCents,
        input.currency,
      )}`,
      detail: {
        userId: input.userId,
        totalCents,
        currency: input.currency,
        allocations,
      },
    });

    return NextResponse.json({ ok: true, id: salary.id });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (e?.name === "ZodError")
      return NextResponse.json(
        { error: e.issues?.[0]?.message || "Invalid salary." },
        { status: 400 },
      );
    console.error("[user-salaries.create]", e);
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
