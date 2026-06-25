import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { recordActivity } from "@/lib/activityFeed";

// Withdraw (delete) a time-off request. Owner-only, allowed in ANY status — a
// requester can cancel a pending request OR withdraw an already-approved future
// leave. Deleting an APPROVED request frees that time on Team Pulse / the org
// chart (both read "who is on APPROVED leave covering today"), so we log an
// activity for that case to keep the team feed honest.

const schema = z.object({ id: z.string().min(1) });

export async function POST(req: Request) {
  try {
    const user = await requireTenantUser();
    const { id } = schema.parse(await req.json());

    const request = await db.leaveRequest.findUnique({
      where: { id },
      select: { id: true, ownerId: true, status: true, type: true },
    });
    if (!request) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    // Only the owner may withdraw their own request.
    if (request.ownerId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await db.leaveRequest.delete({ where: { id } });

    // An approved leave being withdrawn changes who's available — surface it on
    // the activity wall. A pending/denied one was never on the calendar, so it
    // doesn't need a feed entry (the audit log still records every deletion).
    if (request.status === "APPROVED") {
      await recordActivity({
        actor: user,
        verb: "deleted",
        target: `their approved ${request.type} time off`,
      });
    }

    await audit({
      actor: user,
      action: "leave.delete",
      entity: "LeaveRequest",
      entityId: id,
      summary: `${user.name} withdrew their ${request.type} time-off request`,
      detail: { type: request.type, status: request.status },
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
