import { NextResponse } from "next/server";
import { requireTenantUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";

// GET /api/projects/[id]/members — returns the full member id list for a project.
// Used by MemberManager to seed the checked state without loading all members
// into the page payload.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireTenantUser();
    if (!can.manageProjectMembers(actor.role)) {
      return NextResponse.json({ error: "Admins only" }, { status: 403 });
    }

    const { id } = await params;

    const members = await db.projectMember.findMany({
      where: { projectId: id },
      select: { userId: true },
    });

    return NextResponse.json(members.map((m) => m.userId));
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
