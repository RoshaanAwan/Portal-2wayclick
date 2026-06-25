import { NextResponse } from "next/server";
import { z } from "zod";
import { timingSafeEqual } from "crypto";
import { adminDb } from "@/lib/db";
import {
  recordCheckIn,
  recordCheckOut,
  recordBreakIn,
  recordBreakOut,
  type AttendanceStatus,
  type AttendanceActor,
  type BreakResult,
} from "@/lib/attendance";
import { rateLimit, clientIp, LIMITS } from "@/lib/rateLimit";
import { runWithTenant } from "@/lib/tenantContext";

// ── Slack attendance webhook ───────────────────────────────────────────────────
// The local Slack bot forwards check-in / check-out events here. It is NOT a
// browser-authenticated route — there is no portal session — so it is gated by a
// shared secret (SLACK_BOT_SECRET) the bot sends in the Authorization header:
//
//   Authorization: Bearer <SLACK_BOT_SECRET>
//   Content-Type: application/json
//   {
//     "action":    "check_in" | "check_out" | "break_in" | "break_out",
//     "slackUserId": "U012ABCDEF",   // optional but preferred
//     "email":      "raza@onestop.software", // optional fallback
//     "handle":     "raza",          // optional, display only
//     "timestamp":  "2026-06-15T10:12:00Z"  // optional; defaults to now
//   }
//
// User resolution order: slackUserId → email. The first event also links the
// Slack identity onto the User row so later events resolve instantly.
//
// Idempotency: the bot may retry a delivery. We dedupe on the natural key
// (slackUserId, action, timestamp) via the SlackWebhookEvent table so a
// redelivery is a no-op (no duplicate break, no double-counted event).

const schema = z.object({
  action: z.enum(["check_in", "check_out", "break_in", "break_out"]),
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

type Action = z.infer<typeof schema>["action"];
// All four recorders return either an attendance result (carries `status`) or a
// BreakResult (carries `ok`). Naming the union keeps runWithTenant's generic from
// collapsing to just the first branch's type, so the narrowing below type-checks.
type RecordResult =
  | { day: Date; status: AttendanceStatus; id?: string }
  | BreakResult;

function dispatch(
  action: Action,
  actor: AttendanceActor,
  at: Date,
): Promise<RecordResult> {
  switch (action) {
    case "check_in":
      return recordCheckIn(actor, at);
    case "check_out":
      return recordCheckOut(actor, at);
    case "break_in":
      return recordBreakIn(actor, at);
    case "break_out":
      return recordBreakOut(actor, at);
  }
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
    // adminDb: the bot has no subdomain/tenant context, so we match across all
    // tenants. The matched user's tenantId then scopes everything that follows.
    const user = await adminDb.user.findFirst({
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
        tenantId: true,
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
      await adminDb.user
        .update({
          where: { id: user.id },
          data: {
            slackUserId: body.slackUserId ?? user.slackUserId,
            slackHandle: body.handle ?? user.slackHandle,
          },
        })
        .catch(() => {
          // A slackUserId already linked per-tenant hits the @@unique constraint
          // — ignore; the attendance record itself still lands.
        });
    }

    // 5) Dedupe redeliveries on the natural key (slackUserId, action, timestamp).
    // The bot may retry; a row for this exact event means we've already applied
    // it, so we ack without re-processing (no duplicate break / double count).
    // Keyed on slackUserId — the bot always sends it for these events. (Without
    // one we skip dedupe; only the rare legacy email-only path is affected.)
    const dedupeKey = body.slackUserId;
    if (dedupeKey && body.timestamp) {
      const seen = await adminDb.slackWebhookEvent.findUnique({
        where: {
          slackUserId_action_ts: {
            slackUserId: dedupeKey,
            action: body.action,
            ts: body.timestamp,
          },
        },
        select: { id: true },
      });
      if (seen) {
        return NextResponse.json(
          { ok: true, userId: user.id, duplicate: true },
          { status: 200 },
        );
      }
    }

    // 6) Record it — inside the matched user's tenant context so the Attendance
    // row (and the activity it logs) is scoped correctly.
    const at = parseTimestamp(body.timestamp);
    const result = await runWithTenant(user.tenantId, () =>
      dispatch(body.action, user, at),
    );

    // 7) Mark this delivery processed so a later redelivery is a no-op. Done
    // AFTER the record succeeds (so a failed attempt can still be retried) and
    // best-effort: a concurrent duplicate that races us hits the unique
    // constraint — swallow that, the record already landed exactly once.
    if (dedupeKey && body.timestamp) {
      await adminDb.slackWebhookEvent
        .create({
          data: { slackUserId: dedupeKey, action: body.action, ts: body.timestamp },
        })
        .catch((e: any) => {
          if (e?.code !== "P2002") throw e;
        });
    }

    // Break events return a BreakResult; an ignored break (no open attendance,
    // already-open break, no open break to close) is a benign no-op, not an
    // error — ack it so the bot doesn't retry.
    if ("ok" in result && result.ok === false) {
      return NextResponse.json(
        {
          ok: false,
          userId: user.id,
          reason: result.reason,
          day: result.day.toISOString(),
        },
        { status: 200 },
      );
    }

    return NextResponse.json({
      ok: true,
      userId: user.id,
      action: body.action,
      ...("status" in result ? { status: result.status } : {}),
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
