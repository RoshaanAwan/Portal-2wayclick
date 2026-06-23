import { NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { TICKET_STATUS, describeDevice } from "@/lib/qrLogin";

const schema = z.object({ token: z.string().min(1) });

// Authenticated: an already-signed-in user (on their phone) approves a new
// device's pending login ticket. We record who approved so `claim` knows whose
// session to mint — the approving device never hands over its own session.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  // adminDb: the token is global. getCurrentUser already established the tenant
  // context, but we look the ticket up un-scoped so a cross-tenant token surfaces
  // as the explicit 404 below rather than a fail-closed throw.
  const ticket = await adminDb.loginTicket.findUnique({
    where: { token: parsed.data.token },
  });

  // The approver must belong to the ticket's tenant — never let a user from
  // another tenant approve (or even probe) this ticket.
  if (!ticket || ticket.tenantId !== user.tenantId) {
    return NextResponse.json({ error: "Unknown sign-in request" }, { status: 404 });
  }
  if (ticket.status === TICKET_STATUS.CONSUMED) {
    return NextResponse.json({ error: "Already used" }, { status: 409 });
  }
  if (ticket.expiresAt <= new Date()) {
    return NextResponse.json({ error: "This request has expired" }, { status: 410 });
  }

  // Idempotent: re-approving by the same user is fine; approving an already
  // approved-by-someone-else ticket is not (shouldn't happen, but guard it).
  if (
    ticket.status === TICKET_STATUS.APPROVED &&
    ticket.approvedById &&
    ticket.approvedById !== user.id
  ) {
    return NextResponse.json(
      { error: "Already handled on another account" },
      { status: 409 },
    );
  }

  // adminDb: keyed by the global token. The ticket is already confirmed to be in
  // the approver's tenant above.
  await adminDb.loginTicket.update({
    where: { token: ticket.token },
    data: {
      status: TICKET_STATUS.APPROVED,
      approvedById: user.id,
      approvedAt: new Date(),
    },
  });

  await audit({
    actor: { id: user.id, name: user.name, role: user.role },
    action: "auth.qr_approve",
    entity: "LoginTicket",
    entityId: ticket.id,
    targetUserId: user.id,
    summary: `${user.name} approved a QR sign-in for ${describeDevice(ticket.userAgent)}`,
    detail: { device: describeDevice(ticket.userAgent), ip: ticket.ipAddress },
  });

  return NextResponse.json({ ok: true });
}
