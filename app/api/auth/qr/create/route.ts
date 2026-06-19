import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { newTicketToken, TICKET_TTL_MS } from "@/lib/qrLogin";

// Public: a device that wants to be signed in creates a pending login ticket.
// Returns the token the page will render as a QR code, plus when it expires.
// Captures coarse device hints so the approving phone can see what it's OK'ing.
export async function POST() {
  try {
    const h = await headers();
    const userAgent = h.get("user-agent");
    const ipAddress =
      h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      h.get("x-real-ip") ||
      null;

    const token = newTicketToken();
    const expiresAt = new Date(Date.now() + TICKET_TTL_MS);

    await db.loginTicket.create({
      data: { token, expiresAt, userAgent, ipAddress },
    });

    return NextResponse.json({ token, expiresAt: expiresAt.toISOString() });
  } catch {
    return NextResponse.json(
      { error: "Could not start QR sign-in" },
      { status: 500 },
    );
  }
}
