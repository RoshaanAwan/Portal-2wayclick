import { NextResponse } from "next/server";
import { requireTenantUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { canManageUser } from "@/lib/permissions";

// Permanently delete a user. Admin tier only, gated by canManageUser (you may
// only delete someone strictly below your own authority, and never yourself).
// Most owned rows (sessions, attendance, breaks, notifications, push subs,
// announcement reads/reactions) cascade via their FK onDelete: Cascade; we
// capture the name for the audit summary before the row is gone.
//
// Authored content that should outlive the person (announcements they posted,
// audit log they generated, tasks/comments) is intentionally NOT cascaded in
// the schema — Postgres will reject the delete if such references remain, which
// is the safe failure (we surface it rather than orphaning history). Disable is
// the soft alternative the UI keeps for those cases.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireTenantUser();
    const { id } = await params;

    const target = await db.user.findUnique({
      where: { id },
      select: { id: true, name: true, role: true },
    });
    if (!target) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    if (!canManageUser(actor, target)) {
      return NextResponse.json(
        { error: "You do not have permission to delete this user." },
        { status: 403 },
      );
    }

    // Audit BEFORE the delete so the actor + target name are still resolvable.
    await audit({
      actor,
      action: "user.delete",
      entity: "User",
      entityId: target.id,
      targetUserId: target.id,
      summary: `${actor.name} deleted ${target.name}`,
    });

    try {
      await db.user.delete({ where: { id } });
    } catch {
      // A foreign-key restriction (authored content that can't cascade) lands
      // here. Steer the admin to Disable instead of leaving them stuck.
      return NextResponse.json(
        {
          error:
            "This user has content that can't be removed (e.g. posts or tasks). Disable them instead.",
        },
        { status: 409 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
