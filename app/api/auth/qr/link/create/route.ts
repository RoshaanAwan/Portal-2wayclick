import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { newTicketToken, TICKET_TTL_MS, TICKET_KIND, TICKET_STATUS } from "@/lib/qrLogin";

// Authenticated: the dashboard (already signed in) creates a DIRECT_LINK ticket
// bound to the current user. A NOT-signed-in phone that scans the resulting QR
// signs ITSELF in as this user — the authorization already happened here, so
// there's no separate approval step. Short-lived + single-use to limit the
// window in which a visible QR could be misused.
export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

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
      data: {
        token,
        // getCurrentUser established the tenant context; bind the ticket to the
        // creating user's tenant explicitly (the create type requires it).
        tenantId: user.tenantId,
        kind: TICKET_KIND.DIRECT_LINK,
        // Pre-authorized by its creator: bind the user and mark APPROVED so the
        // phone can sign in directly when it opens the link.
        status: TICKET_STATUS.APPROVED,
        approvedById: user.id,
        approvedAt: new Date(),
        expiresAt,
        userAgent,
        ipAddress,
      },
    });

    return NextResponse.json({ token, expiresAt: expiresAt.toISOString() });
  } catch {
    return NextResponse.json(
      { error: "Could not create a link code" },
      { status: 500 },
    );
  }
}
