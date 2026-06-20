import { NextResponse } from "next/server";
import { z } from "zod";
import { timingSafeEqual } from "crypto";
import { db } from "@/lib/db";
import { recordCheckIn, recordCheckOut } from "@/lib/attendance";
import { rateLimit, clientIp, LIMITS } from "@/lib/rateLimit";

// ── Slack attendance webhook ───────────────────────────────────────────────────
// The local Slack bot forwards check-in / check-out events here. It is NOT a
// browser-authenticated route — there is no portal session — so it is gated by a
// shared secret (SLACK_BOT_SECRET) the bot sends in the Authorization header:
//
//   Authorization: Bearer <SLACK_BOT_SECRET>
//   Content-Type: application/json
//   {
//     "action":    "check_in" | "check_out",
//     "slackUserId": "U012ABCDEF",   // optional but preferred
//     "email":      "raza@onestop.software", // optional fallback
//     "handle":     "raza",          // optional, display only
//     "timestamp":  "2026-06-15T10:12:00Z"  // optional; defaults to now
//   }
//
// User resolution order: slackUserId → email. The first event also links the
// Slack identity onto the User row so later events resolve instantly.

const schema = z.object({
  action: z.enum(["check_in", "check_out"]),
  slackUserId: z.string().min(1).optional(),
  email: z.string().email().optional(),
  handle: z.string().min(1).optional(),
  // Accept ISO 8601 or a Slack epoch-seconds string; coerced below.
  timestamp: z.string().min(1).optional(),
});

/** Constant-time compare so the secret can't be guessed by timing. */
function secretOk(provided: string | null): boolean {
  const expected = process.env.SLACK_BOT_SECRET;
  if (!expected || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Parse the event time: ISO string, or Slack epoch seconds (e.g. "1718445120"). */
function parseTimestamp(ts?: string): Date {
  if (!ts) return new Date();
  // Slack timestamps are seconds (possibly with a ".000123" suffix).
  if (/^\d+(\.\d+)?$/.test(ts)) {
    return new Date(Math.floor(parseFloat(ts) * 1000));
  }
  const d = new Date(ts);
  return isNaN(d.getTime()) ? new Date() : d;
}

export async function POST(req: Request) {
  try {
    // 0) Throttle per IP so the shared secret can't be brute-forced online (the
    // compare is constant-time, but there's no lockout without this).
    const ip = clientIp(req);
    const limit = await rateLimit(
      `webhook:slack:ip:${ip}`,
      LIMITS.webhook.limit,
      LIMITS.webhook.windowMs,
    );
    if (!limit.ok) {
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
      );
    }

    // 1) Authenticate the bot.
    const auth = req.headers.get("authorization");
    const token = auth?.startsWith("Bearer ") ? auth.slice(7) : auth;
    if (!secretOk(token)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2) Validate the payload.
    const body = schema.parse(await req.json());
    if (!body.slackUserId && !body.email) {
      return NextResponse.json(
        { error: "Provide slackUserId or email" },
        { status: 400 },
      );
    }

    // 3) Resolve the Slack user → portal user (slackUserId first, then email).
    const user = await db.user.findFirst({
      where: {
        OR: [
          body.slackUserId ? { slackUserId: body.slackUserId } : undefined,
          body.email ? { email: body.email } : undefined,
        ].filter(Boolean) as object[],
      },
      select: {
        id: true,
        name: true,
        title: true,
        avatarUrl: true,
        slackUserId: true,
        slackHandle: true,
      },
    });

    if (!user) {
      // 202: we accepted the request but have nobody to attribute it to. The bot
      // shouldn't retry forever; the admin needs to link this Slack user.
      return NextResponse.json(
        { ok: false, reason: "no_matching_user" },
        { status: 202 },
      );
    }

    // 4) Best-effort: backfill the Slack identity so future events resolve by ID.
    if (
      (body.slackUserId && user.slackUserId !== body.slackUserId) ||
      (body.handle && user.slackHandle !== body.handle)
    ) {
      await db.user
        .update({
          where: { id: user.id },
          data: {
            slackUserId: body.slackUserId ?? user.slackUserId,
            slackHandle: body.handle ?? user.slackHandle,
          },
        })
        .catch(() => {
          // A slackUserId already linked to someone else hits the @unique
          // constraint — ignore; the attendance record itself still lands.
        });
    }

    // 5) Record it.
    const at = parseTimestamp(body.timestamp);
    const result =
      body.action === "check_in"
        ? await recordCheckIn(user, at)
        : await recordCheckOut(user, at);

    return NextResponse.json({
      ok: true,
      userId: user.id,
      status: result.status,
      day: result.day.toISOString(),
    });
  } catch (e: any) {
    if (e?.name === "ZodError") {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }
    console.error("[attendance/slack] failed", e);
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
