import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";

// PATCH /api/projects/reorder — persist the CURRENT USER's personal drag-and-drop
// ordering for the projects list. Per-user: every authenticated user can arrange
// their own list; their order never affects anyone else (rows live in
// ProjectOrder keyed by userId). The client sends the projects of the current
// page in their new visual order; we upsert just those projects' sortOrder for
// this user, anchored to the smallest sortOrder the user already has among them
// so the page's block keeps its place relative to the user's other pages.
const patchSchema = z.object({
  // The page's project ids, in their new top-to-bottom (or left-to-right) order.
  ids: z.array(z.string().min(1)).min(1).max(100),
});

export async function PATCH(req: Request) {
  try {
    const actor = await requireTenantUser();

    const { ids } = patchSchema.parse(await req.json());

    // Reject duplicate ids — an ambiguous order request.
    if (new Set(ids).size !== ids.length) {
      return NextResponse.json({ error: "Duplicate ids" }, { status: 400 });
    }

    // Only accept ids the user can actually see. Admins see every project;
    // everyone else only projects they belong to (mirrors the list page). The
    // scoped `db` client also confines this to the user's tenant.
    const baseWhere = can.manageProjects(actor.role)
      ? {}
      : { members: { some: { userId: actor.id } } };

    const visible = await db.project.findMany({
      where: { ...baseWhere, id: { in: ids } },
      select: {
        id: true,
        orders: { where: { userId: actor.id }, select: { sortOrder: true } },
      },
    });
    if (visible.length !== ids.length) {
      return NextResponse.json(
        { error: "One or more projects not found" },
        { status: 404 },
      );
    }

    // Base = the smallest sortOrder the user already assigned within this set
    // (0 if none are positioned yet), so a single-page reorder stays anchored.
    const existing = visible
      .map((p) => p.orders[0]?.sortOrder)
      .filter((n): n is number => typeof n === "number");
    const base = existing.length ? Math.min(...existing) : 0;

    // One transaction: upsert this user's order row for each id in its new slot.
    await db.$transaction(
      ids.map((projectId, i) =>
        db.projectOrder.upsert({
          where: { userId_projectId: { userId: actor.id, projectId } },
          create: { userId: actor.id, projectId, sortOrder: base + i },
          update: { sortOrder: base + i },
        }),
      ),
    );

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (e?.name === "ZodError")
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    console.error("[projects.reorder]", e);
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
