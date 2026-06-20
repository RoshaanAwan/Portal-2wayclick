import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "./db";

// ── Rate limiting ─────────────────────────────────────────────────────────────
// A fixed-window limiter backed by Postgres (the RateLimit model). It works
// across serverless instances — an in-process counter would not, since each
// Vercel instance has its own memory — using infra we already run (Neon), so no
// Redis/Upstash dependency.
//
// Each call computes the current window (floor(now / windowMs)), then performs an
// ATOMIC `INSERT … ON CONFLICT DO UPDATE SET count = count + 1 RETURNING count`,
// so concurrent requests in the same window can never under-count. If the
// returned count exceeds `limit`, the request is over the cap.
//
// Best-effort: a limiter that errors (e.g. DB blip) must never take down the
// endpoint it protects, so failures FAIL OPEN (allow) and are logged.

export interface RateLimitResult {
  /** True if the request is within the limit and may proceed. */
  ok: boolean;
  /** Requests remaining in the current window (0 when blocked). */
  remaining: number;
  /** Seconds until the current window resets. */
  retryAfter: number;
}

/**
 * Consume one unit against `bucket`. Returns whether the caller is within
 * `limit` requests per `windowMs`.
 *
 * @param bucket     identifies the limited subject, e.g. `login:ip:1.2.3.4`
 * @param limit      max requests allowed per window
 * @param windowMs   window length in milliseconds
 */
export async function rateLimit(
  bucket: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  // Caller passes the clock in via Date — kept here (not a module constant) so
  // each call sees the real current time.
  const now = Date.now();
  const windowStartMs = Math.floor(now / windowMs) * windowMs;
  const windowStart = new Date(windowStartMs);
  const expiresAt = new Date(windowStartMs + windowMs);

  try {
    // Atomic upsert-and-increment. The unique (bucket, windowStart) makes the
    // ON CONFLICT target the current window's row; the PK id is DB-generated
    // (gen_random_uuid) so we don't supply it.
    const rows = await db.$queryRaw<{ count: number }[]>(Prisma.sql`
      INSERT INTO "RateLimit" ("bucket", "windowStart", "count", "expiresAt")
      VALUES (${bucket}, ${windowStart}, 1, ${expiresAt})
      ON CONFLICT ("bucket", "windowStart")
      DO UPDATE SET "count" = "RateLimit"."count" + 1
      RETURNING "count"
    `);
    const count = rows[0]?.count ?? 1;
    const remaining = Math.max(0, limit - count);
    const retryAfter = Math.ceil((expiresAt.getTime() - now) / 1000);
    return { ok: count <= limit, remaining, retryAfter };
  } catch (err) {
    // Fail open — never block a real user because the limiter itself failed.
    console.error("[rateLimit] failed (failing open)", bucket, err);
    return { ok: true, remaining: limit, retryAfter: 0 };
  }
}

/** Best-effort: extract the client IP from a request's forwarding headers. */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return (
    req.headers.get("x-real-ip") ??
    req.headers.get("cf-connecting-ip") ??
    "unknown"
  );
}

// Common limit presets, so call sites read declaratively.
export const LIMITS = {
  /** Login: 10 attempts / 5 min per IP and per email. */
  login: { limit: 10, windowMs: 5 * 60_000 },
  /** Unauthenticated QR ticket creation: 20 / 5 min per IP. */
  qrCreate: { limit: 20, windowMs: 5 * 60_000 },
  /** QR poll/claim/signin: 60 / min per IP (polling is legitimate-frequent). */
  qrPoll: { limit: 60, windowMs: 60_000 },
  /** Public share mutations (comment/move/request): 30 / 5 min per token+IP. */
  share: { limit: 30, windowMs: 5 * 60_000 },
  /** Slack webhook secret attempts: 30 / min per IP. */
  webhook: { limit: 30, windowMs: 60_000 },
} as const;
