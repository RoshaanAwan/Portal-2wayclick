import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { LEAVE_TYPES } from "@/lib/constants";

// Edit a time-off request. Owner-only, and only while the request is still
// PENDING — once it's been decided (APPROVED/DENIED) it's a record of a review,
// so changing its dates would silently bypass the approval. Re-validates the
// date window exactly like the create route.

const schema = z
  .object({
    id: z.string().min(1),
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
    const user = await requireTenantUser();
    const { id, type, startDate, endDate, reason } = schema.parse(
      await req.json(),
    );

    const request = await db.leaveRequest.findUnique({
      where: { id },
      select: { id: true, ownerId: true, status: true },
    });
    if (!request) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    // Only the owner may edit their own request.
    if (request.ownerId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    // A decided request is locked — edit is only for PENDING.
    if (request.status !== "PENDING") {
      return NextResponse.json(
        { error: "Only pending requests can be edited." },
        { status: 409 },
      );
    }

    await db.leaveRequest.update({
      where: { id },
      data: {
        type,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        reason: reason && reason.length > 0 ? reason : null,
      },
    });

    await audit({
      actor: user,
      action: "leave.update",
      entity: "LeaveRequest",
      entityId: id,
      summary: `${user.name} edited their ${type} time-off request`,
      detail: { type, startDate, endDate },
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
