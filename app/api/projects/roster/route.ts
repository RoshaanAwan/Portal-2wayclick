import { NextResponse } from "next/server";
import { requireTenantUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";

// GET /api/projects/roster — returns the tenant's user list for the project
// composer and member manager. Fetched lazily (only when the modal opens) so
// it doesn't block the projects page load.
export async function GET() {
  try {
    const actor = await requireTenantUser();
    if (!can.manageProjects(actor.role)) {
      return NextResponse.json({ error: "Admins only" }, { status: 403 });
    }

    const users = await db.user.findMany({
      take: 200,
      orderBy: { name: "asc" },
      select: { id: true, name: true, avatarUrl: true, title: true },
    });

    return NextResponse.json(users);
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
