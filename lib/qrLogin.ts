import "server-only";
import { randomBytes } from "crypto";
import { db } from "./db";

// ── QR "scan to sign in" handshake ───────────────────────────────────────────
// A new device creates a LoginTicket and shows its token as a QR code. An
// already-authenticated phone opens /link/<token>, sees the device details, and
// approves. The new device — which has been polling — then claims the approved
// ticket, at which point a real Session is minted for it. See prisma LoginTicket.

export const TICKET_STATUS = {
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  CONSUMED: "CONSUMED",
} as const;

// Short-lived on purpose: the QR is only useful for the moment it's on screen.
export const TICKET_TTL_MS = 2 * 60 * 1000; // 2 minutes

/** Opaque, unguessable ticket token (also what the QR encodes). */
export function newTicketToken(): string {
  return randomBytes(32).toString("hex");
}

/** A ticket is usable only while PENDING/APPROVED and not past its expiry. */
export function isTicketLive(ticket: {
  status: string;
  expiresAt: Date;
}): boolean {
  return ticket.status !== TICKET_STATUS.CONSUMED && ticket.expiresAt > new Date();
}

/**
 * The poll-facing view of a ticket. Deliberately minimal — it never exposes the
 * approver's identity or any session material to the waiting (unauthenticated)
 * device; it only says whether it may now claim a session.
 */
export type TicketPublicState =
  | { state: "pending" }
  | { state: "approved" }
  | { state: "expired" }
  | { state: "consumed" }
  | { state: "not_found" };

export async function readTicketState(
  token: string,
): Promise<TicketPublicState> {
  const ticket = await db.loginTicket.findUnique({ where: { token } });
  if (!ticket) return { state: "not_found" };
  if (ticket.status === TICKET_STATUS.CONSUMED) return { state: "consumed" };
  if (ticket.expiresAt <= new Date()) return { state: "expired" };
  if (ticket.status === TICKET_STATUS.APPROVED) return { state: "approved" };
  return { state: "pending" };
}

/** Best-effort coarse device label from a User-Agent, for the approval screen. */
export function describeDevice(userAgent: string | null | undefined): string {
  const ua = userAgent ?? "";
  if (!ua) return "Unknown device";
  const browser = /Edg/.test(ua)
    ? "Edge"
    : /Chrome/.test(ua)
      ? "Chrome"
      : /Firefox/.test(ua)
        ? "Firefox"
        : /Safari/.test(ua)
          ? "Safari"
          : "Browser";
  const os = /Windows/.test(ua)
    ? "Windows"
    : /Android/.test(ua)
      ? "Android"
      : /iPhone|iPad|iOS/.test(ua)
        ? "iOS"
        : /Mac OS X|Macintosh/.test(ua)
          ? "macOS"
          : /Linux/.test(ua)
            ? "Linux"
            : "device";
  return `${browser} on ${os}`;
}
