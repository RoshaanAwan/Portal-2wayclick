import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { can } from "@/lib/permissions";
import { salaryInputSchema, toCents, formatMoney } from "@/lib/finance";

// POST /api/salaries/create — set an employee's monthly salary on a project.
// Admin tier. One row per (project, employee): if a salary already exists for
// the pair it is updated (and re-activated), so this doubles as "set / change".
export async function POST(req: Request) {
  try {
    const actor = await requireUser();
    if (!can.manageFinance(actor.role)) {
      return NextResponse.json({ error: "Admins only" }, { status: 403 });
    }

    const input = salaryInputSchema.parse(await req.json());

    const [project, employee] = await Promise.all([
      db.project.findUnique({
        where: { id: input.projectId },
        select: { id: true, name: true },
      }),
      db.user.findUnique({
        where: { id: input.userId },
        select: { id: true, name: true },
      }),
    ]);
    if (!project) {
      return NextResponse.json({ error: "Unknown project." }, { status: 400 });
    }
    if (!employee) {
      return NextResponse.json({ error: "Unknown employee." }, { status: 400 });
    }

    const amountCents = toCents(input.amount);
    const effectiveFrom = input.effectiveFrom
      ? new Date(input.effectiveFrom)
      : new Date();

    // Upsert on the (project, employee) unique pair. Editing pay updates the row.
    const salary = await db.projectSalary.upsert({
      where: {
        projectId_userId: { projectId: input.projectId, userId: input.userId },
      },
      create: {
        projectId: input.projectId,
        userId: input.userId,
        userName: employee.name,
        amountCents,
        currency: input.currency,
        effectiveFrom,
        active: true,
      },
      update: {
        userName: employee.name,
        amountCents,
        currency: input.currency,
        effectiveFrom,
        active: true,
      },
    });

    await audit({
      actor,
      action: "salary.create",
      entity: "ProjectSalary",
      entityId: salary.id,
      targetUserId: input.userId,
      summary: `${actor.name} set ${employee.name}'s salary on ${project.name} to ${formatMoney(
        amountCents,
        input.currency,
      )}/mo`,
      detail: {
        projectId: input.projectId,
        userId: input.userId,
        amountCents,
        currency: input.currency,
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
    console.error("[salaries.create]", e);
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
