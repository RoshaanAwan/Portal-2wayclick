import { NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { runWithTenant } from "@/lib/tenantContext";
import { TICKET_STATUS, TICKET_KIND } from "@/lib/qrLogin";
import { rateLimit, clientIp, LIMITS } from "@/lib/rateLimit";

const schema = z.object({ token: z.string().min(1) });

// Public: the scanning phone signs ITSELF in as a DIRECT_LINK ticket's bound
// user. The ticket was created by an authenticated dashboard, so opening it is
// the authorization. Single-use via a conditional update (APPROVED → CONSUMED),
// so the QR can sign in exactly one device.
export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  // Throttle per IP so the signin endpoint can't be hammered with token guesses.
  const limit = await rateLimit(
    `qr:linksignin:ip:${clientIp(req)}`,
    LIMITS.qrPoll.limit,
    LIMITS.qrPoll.windowMs,
  );
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  // adminDb: keyed by the global token, before any tenant context. The ticket's
  // own tenantId is the source of truth for the session we mint.
  const ticket = await adminDb.loginTicket.findUnique({
    where: { token: parsed.data.token },
  });

  if (!ticket || ticket.kind !== TICKET_KIND.DIRECT_LINK || !ticket.approvedById) {
    return NextResponse.json({ error: "Invalid link code" }, { status: 404 });
  }
  if (ticket.status !== TICKET_STATUS.APPROVED) {
    return NextResponse.json({ error: "This code has already been used" }, { status: 409 });
  }
  if (ticket.expiresAt <= new Date()) {
    return NextResponse.json({ error: "This code has expired" }, { status: 410 });
  }

  // Atomic single-use guard: only the request that flips the row proceeds.
  // adminDb: keyed by the global token, before any tenant context.
  const consumed = await adminDb.loginTicket.updateMany({
    where: { token: ticket.token, status: TICKET_STATUS.APPROVED },
    data: { status: TICKET_STATUS.CONSUMED },
  });
  if (consumed.count !== 1) {
    return NextResponse.json({ error: "This code has already been used" }, { status: 409 });
  }

  // adminDb: no tenant context yet. The bound user must belong to the ticket's
  // tenant — guard against a stale/forged cross-tenant binding.
  const boundUser = await adminDb.user.findUnique({
    where: { id: ticket.approvedById },
  });
  if (!boundUser || boundUser.tenantId !== ticket.tenantId) {
    return NextResponse.json({ error: "Account no longer exists" }, { status: 410 });
  }
  // An account disabled after the QR was shown must not be able to sign in.
  if (boundUser.disabledAt) {
    return NextResponse.json(
      { error: "This account has been disabled." },
      { status: 403 },
    );
  }

  // Mint a normal session — sets the httpOnly cookie on THIS (the phone's) device.
  // The session belongs to the ticket's tenant.
  await createSession(boundUser.id, ticket.tenantId);

  await runWithTenant(ticket.tenantId, () =>
    audit({
      actor: { id: boundUser.id, name: boundUser.name, role: boundUser.role },
      action: "auth.qr_login",
      entity: "Session",
      targetUserId: boundUser.id,
      summary: `${boundUser.name} signed in by scanning a device-link QR`,
    }),
  );

  return NextResponse.json({ ok: true });
}
