import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { recordActivity } from "@/lib/activityFeed";
import { LEAVE_TYPES } from "@/lib/constants";
import { isSuperAdmin } from "@/lib/permissions";

const schema = z
  .object({
    type: z.enum(LEAVE_TYPES),
    startDate: z.string().min(1),
    endDate: z.string().min(1),
    reason: z.string().trim().max(500).optional(),
  })
  .refine(
    (d) => {
      const start = new Date(d.startDate);
      const end = new Date(d.endDate);
      return (
        !Number.isNaN(start.getTime()) &&
        !Number.isNaN(end.getTime()) &&
        end.getTime() >= start.getTime()
      );
    },
    { message: "End date must be on or after the start date" },
  );

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const { type, startDate, endDate, reason } = schema.parse(await req.json());

    // Reviewer defaults to the requester's manager, if they have one.
    const me = await db.user.findUnique({
      where: { id: user.id },
      select: { managerId: true },
    });

    // A Super Admin sits at the top of the approval chain, so their own time-off
    // is auto-approved on submit (recorded as both owner and reviewer) instead of
    // waiting on a review they'd just rubber-stamp themselves.
    const autoApprove = isSuperAdmin(user.role);

    const request = await db.leaveRequest.create({
      data: {
        type,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        reason: reason && reason.length > 0 ? reason : null,
        status: autoApprove ? "APPROVED" : "PENDING",
        ownerId: user.id,
        reviewerId: autoApprove ? user.id : me?.managerId ?? null,
        decidedAt: autoApprove ? new Date() : null,
      },
    });

    await recordActivity({
      actor: user,
      verb: autoApprove ? "approved" : "requested",
      target: `${type} time off`,
      meta: { requestId: request.id },
    });

    await audit({
      actor: user,
      action: "leave.create",
      entity: "LeaveRequest",
      entityId: request.id,
      summary: `${user.name} ${
        autoApprove ? "took" : "requested"
      } ${type} time off`,
      detail: { type, startDate, endDate, status: autoApprove ? "APPROVED" : "PENDING" },
    });

    return NextResponse.json({ ok: true, id: request.id });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
