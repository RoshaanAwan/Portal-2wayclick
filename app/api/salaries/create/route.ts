import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { can } from "@/lib/permissions";
import { salaryInputSchema, toCents, formatMoney } from "@/lib/finance";
import { getProjectFinance } from "@/lib/financeQueries";
import { recalcGrid, type GridCell } from "@/lib/formula";

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

    const project = await db.project.findUnique({
      where: { id: input.projectId },
      select: { id: true, name: true },
    });
    if (!project) {
      return NextResponse.json({ error: "Unknown project." }, { status: 400 });
    }

    // A salary is for EITHER a real employee (userId, dedupe on project+userId)
    // or a free-text name (no userId, dedupe on project+userName). Resolve the
    // stored name and the userId once, here, so the rest of the route is uniform.
    let userId: string | null = null;
    let userName: string;
    if (input.userId) {
      const employee = await db.user.findUnique({
        where: { id: input.userId },
        select: { id: true, name: true },
      });
      if (!employee) {
        return NextResponse.json(
          { error: "Unknown employee." },
          { status: 400 },
        );
      }
      userId = employee.id;
      userName = employee.name;
    } else {
      // Free-text path: the typed name IS the identity. Guaranteed non-empty by
      // the schema refine, but trim again defensively.
      userName = (input.userName ?? "").trim();
      if (!userName) {
        return NextResponse.json(
          { error: "Employee name required." },
          { status: 400 },
        );
      }
    }

    // ── Whole-block (2D) formula evaluation ──
    // Salary formulas may reference OTHER employees' cells in the same project, so
    // amountCents must be computed against the full project grid (rows = the
    // project's salaries, cols = the union of component labels). This keeps every
    // cached amount authoritative and unspoofable. Load the project's existing
    // salaries (excluding the row we're about to upsert, matched by identity).
    const existing = await db.projectSalary.findMany({
      where: { projectId: input.projectId },
      select: {
        id: true,
        userId: true,
        userName: true,
        components: {
          orderBy: { position: "asc" },
          select: { label: true, amountCents: true, formula: true },
        },
      },
    });
    // The submitted row replaces any existing one with the same identity.
    const isSameRow = (s: { userId: string | null; userName: string }) =>
      userId ? s.userId === userId : s.userName === userName;
    const others = existing.filter((s) => !isSameRow(s));

    // Rows: the submitted salary first, then the others (stable order). Row labels
    // are employee names (the grid ref key); de-dupe defensively.
    const submittedRow = {
      userName,
      components: input.components.map((c) => ({
        label: c.label,
        formula: c.formula ?? null,
        cents: toCents(c.amount),
      })),
    };
    const otherRows = others.map((s) => ({
      userName: s.userName,
      components: s.components.map((c) => ({
        label: c.label,
        formula: c.formula,
        cents: c.amountCents,
      })),
    }));
    const allRows = [submittedRow, ...otherRows];
    const rowLabels = allRows.map((r) => r.userName);

    // Columns = union of all component labels across the block, submitted-first.
    const colLabels: string[] = [];
    const seenCol = new Set<string>();
    for (const r of allRows) {
      for (const c of r.components) {
        if (!seenCol.has(c.label)) {
          seenCol.add(c.label);
          colLabels.push(c.label);
        }
      }
    }

    // Build the 2D cell grid aligned to (rowLabels × colLabels).
    const grid: GridCell[][] = allRows.map((r) =>
      colLabels.map((label) => {
        const c = r.components.find((x) => x.label === label);
        return { formula: c?.formula ?? null, cents: c?.cents ?? 0 };
      }),
    );
    // Project-level named values (POOL/INCOME/SHARED) so =POOL*0.4 etc. resolve
    // authoritatively on the server too.
    const finance = await getProjectFinance(input.projectId);
    const named = finance
      ? {
          POOL: finance.poolCents,
          INCOME: finance.revenueCents,
          SHARED: finance.sharedCents,
        }
      : undefined;
    const resolvedGrid = recalcGrid(rowLabels, colLabels, grid, named);

    // Reject the write if ANY cell errors (a cycle/#REF! spans cells, and we won't
    // persist a block we can't fully resolve). Point at the offending cell.
    for (let r = 0; r < resolvedGrid.length; r++) {
      for (let c = 0; c < resolvedGrid[r].length; c++) {
        const res = resolvedGrid[r][c];
        if (!res.ok) {
          return NextResponse.json(
            {
              error: `Formula error at ${rowLabels[r]} · ${colLabels[c]}: ${res.error}`,
            },
            { status: 400 },
          );
        }
      }
    }

    // The submitted salary is row 0. Its components keep their original order and
    // formula, with server-evaluated cents from the grid.
    const submittedResults = resolvedGrid[0];
    const components = input.components.map((c, position) => {
      const colIdx = colLabels.indexOf(c.label);
      const res = colIdx >= 0 ? submittedResults[colIdx] : null;
      return {
        label: c.label,
        amountCents: res && res.ok ? res.cents : toCents(c.amount),
        formula: c.formula ?? null,
        position,
      };
    });
    const totalCents = components.reduce((sum, c) => sum + c.amountCents, 0);
    const effectiveFrom = input.effectiveFrom
      ? new Date(input.effectiveFrom)
      : new Date();

    // Other salaries whose cached cents changed (they referenced the submitted
    // row): rewrite just their components' amountCents in the same transaction so
    // the stored values stay consistent with the block.
    const otherUpdates: { id: string; label: string; amountCents: number }[] = [];
    others.forEach((s, i) => {
      const rowRes = resolvedGrid[i + 1]; // +1: submitted row is index 0
      s.components.forEach((c) => {
        const colIdx = colLabels.indexOf(c.label);
        const res = colIdx >= 0 ? rowRes[colIdx] : null;
        if (res && res.ok && res.cents !== c.amountCents) {
          otherUpdates.push({ id: s.id, label: c.label, amountCents: res.cents });
        }
      });
    });

    // Upsert on the unique pair that identifies this row: (project, userId) for a
    // real employee, (project, userName) for a free-text name. Editing pay
    // updates the row and fully replaces its components (delete-all then
    // recreate). Cascade any dependent recomputed amounts in the same txn.
    const where = userId
      ? { projectId_userId: { projectId: input.projectId, userId } }
      : { projectId_userName: { projectId: input.projectId, userName } };
    const [salary] = await db.$transaction([
      db.projectSalary.upsert({
        where,
        create: {
          projectId: input.projectId,
          userId,
          userName,
          currency: input.currency,
          effectiveFrom,
          active: true,
          components: { create: components },
        },
        update: {
          userName,
          currency: input.currency,
          effectiveFrom,
          active: true,
          components: { deleteMany: {}, create: components },
        },
      }),
      // Update dependent cells in other salaries (matched by salaryId + label).
      ...otherUpdates.map((u) =>
        db.salaryComponent.updateMany({
          where: { salaryId: u.id, label: u.label },
          data: { amountCents: u.amountCents },
        }),
      ),
    ]);

    await audit({
      actor,
      action: "salary.create",
      entity: "ProjectSalary",
      entityId: salary.id,
      targetUserId: userId ?? undefined,
      summary: `${actor.name} set ${userName}'s salary on ${project.name} to ${formatMoney(
        totalCents,
        input.currency,
      )}/mo`,
      detail: {
        projectId: input.projectId,
        userId,
        userName,
        components,
        totalCents,
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
    // Unique violation on (project, userName): a salary with this name already
    // exists on the project (e.g. a free-text name that clashes with a user's).
    if (e?.code === "P2002") {
      return NextResponse.json(
        { error: "A salary with that employee name already exists on this project." },
        { status: 409 },
      );
    }
    console.error("[salaries.create]", e);
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
