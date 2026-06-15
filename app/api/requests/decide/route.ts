import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { can } from "@/lib/permissions";

const schema = z.object({
  id: z.string().min(1),
  decision: z.enum(["APPROVED", "DENIED"]),
});

export async function POST(req: Request) {
  try {
    const user = await requireUser();

    // Gate: only elevated staff (admin tier, HR, leads, PMs) may decide.
    if (!can.decideLeave(user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id, decision } = schema.parse(await req.json());

    const request = await db.leaveRequest.findUnique({
      where: { id },
      include: { owner: { select: { name: true } } },
    });

    if (!request || request.status !== "PENDING") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Owners can't decide on their own requests.
    if (request.ownerId === user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await db.leaveRequest.update({
      where: { id },
      data: {
        status: decision,
        decidedAt: new Date(),
        reviewerId: user.id,
      },
    });

    await db.activity.create({
      data: {
        userId: user.id,
        verb: decision === "APPROVED" ? "approved" : "denied",
        target: `${request.owner.name}'s ${request.type} request`,
        meta: JSON.stringify({ requestId: request.id }),
      },
    });

    await audit({
      actor: user,
      action: "leave.decide",
      entity: "LeaveRequest",
      entityId: request.id,
      targetUserId: request.ownerId,
      summary: `${user.name} ${decision === "APPROVED" ? "approved" : "denied"} ${request.owner.name}'s ${request.type} request`,
      detail: { decision, type: request.type },
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
