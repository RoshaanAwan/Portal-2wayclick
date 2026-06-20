import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { TICKET_STATUS } from "@/lib/qrLogin";
import { rateLimit, clientIp, LIMITS } from "@/lib/rateLimit";

const schema = z.object({ token: z.string().min(1) });

// Public: the waiting device claims an APPROVED ticket and gets a real session
// cookie for the user who approved it. The consume step is a conditional update
// (status APPROVED → CONSUMED) so a ticket can be redeemed exactly once, even if
// two requests race — only the one that flips the row proceeds to mint a session.
export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  // Throttle per IP so the claim endpoint can't be hammered with token guesses.
  const limit = await rateLimit(
    `qr:claim:ip:${clientIp(req)}`,
    LIMITS.qrPoll.limit,
    LIMITS.qrPoll.windowMs,
  );
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  const ticket = await db.loginTicket.findUnique({
    where: { token: parsed.data.token },
  });

  if (!ticket || !ticket.approvedById) {
    return NextResponse.json({ error: "Not approved yet" }, { status: 409 });
  }
  if (ticket.status !== TICKET_STATUS.APPROVED) {
    return NextResponse.json({ error: "Not approved yet" }, { status: 409 });
  }
  if (ticket.expiresAt <= new Date()) {
    return NextResponse.json({ error: "This request has expired" }, { status: 410 });
  }

  // Atomic single-use guard: only succeeds if the row is still APPROVED.
  const consumed = await db.loginTicket.updateMany({
    where: { token: ticket.token, status: TICKET_STATUS.APPROVED },
    data: { status: TICKET_STATUS.CONSUMED },
  });
  if (consumed.count !== 1) {
    return NextResponse.json({ error: "Already used" }, { status: 409 });
  }

  const approver = await db.user.findUnique({
    where: { id: ticket.approvedById },
  });
  if (!approver) {
    return NextResponse.json({ error: "Account no longer exists" }, { status: 410 });
  }
  // An account disabled between approval and claim must not get a session.
  if (approver.disabledAt) {
    return NextResponse.json(
      { error: "This account has been disabled." },
      { status: 403 },
    );
  }

  // Mint a normal session — sets the httpOnly cookie on this (the new) device.
  await createSession(approver.id);

  await audit({
    actor: { id: approver.id, name: approver.name, role: approver.role },
    action: "auth.qr_login",
    entity: "Session",
    targetUserId: approver.id,
    summary: `${approver.name} signed in via QR on a new device`,
  });

  return NextResponse.json({ ok: true });
}
