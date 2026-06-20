import { NextResponse } from "next/server";
import { readTicketState } from "@/lib/qrLogin";
import { rateLimit, clientIp, LIMITS } from "@/lib/rateLimit";

// Public: the waiting device polls this to learn when its ticket is approved.
// Returns only a coarse state — never the approver's identity or any session
// material — so polling reveals nothing useful to a third party.
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  // Throttle per IP — legit polling is frequent, so this cap is generous; it
  // exists to stop a client scripting unbounded ticket-state probes.
  const limit = await rateLimit(
    `qr:status:ip:${clientIp(req)}`,
    LIMITS.qrPoll.limit,
    LIMITS.qrPoll.windowMs,
  );
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  const result = await readTicketState(token);

  // Don't let intermediaries cache poll responses.
  return NextResponse.json(result, {
    headers: { "Cache-Control": "no-store" },
  });
}
