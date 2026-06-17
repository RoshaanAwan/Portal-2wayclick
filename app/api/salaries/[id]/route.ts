import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { can } from "@/lib/permissions";

// PATCH /api/salaries/[id] — toggle a salary's active flag (deactivate excludes
// it from the project's payroll cost without losing the record). Admin tier.
const patchSchema = z.object({ active: z.boolean() });

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
    const { active } = patchSchema.parse(await req.json());

    const existing = await db.projectSalary.findUnique({
      where: { id },
      select: { id: true, userName: true, project: { select: { name: true } } },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await db.projectSalary.update({ where: { id }, data: { active } });

    await audit({
      actor,
      action: "salary.deactivate",
      entity: "ProjectSalary",
      entityId: id,
      summary: `${actor.name} ${active ? "re-activated" : "deactivated"} ${existing.userName}'s salary on ${existing.project.name}`,
      detail: { active },
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (e?.name === "ZodError")
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    console.error("[salaries.patch]", e);
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}

// DELETE /api/salaries/[id] — remove a salary record entirely. Admin tier.
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
    const existing = await db.projectSalary.findUnique({
      where: { id },
      select: { id: true, userName: true, project: { select: { name: true } } },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await db.projectSalary.delete({ where: { id } });

    await audit({
      actor,
      action: "salary.delete",
      entity: "ProjectSalary",
      entityId: id,
      summary: `${actor.name} removed ${existing.userName}'s salary on ${existing.project.name}`,
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[salaries.delete]", e);
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
