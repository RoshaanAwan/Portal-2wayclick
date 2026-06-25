import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { dayKey, sweepOpenBreaks } from "@/lib/attendance";
import { runUnscoped } from "@/lib/tenantContext";

// ── End-of-day break sweep ─────────────────────────────────────────────────────
// A break is only "complete" once a break_out (or a same-day check-out) closes
// it. If neither arrives — the user forgot, or the bot dropped the event — the
// break would dangle open forever and read as an infinite span. This route
// closes any break still open for a PAST day, stamping it at that day's end.
//
// Intended to be hit once daily by a scheduler (Vercel Cron, or any cron that
// can send the secret). Cross-tenant: it sweeps every tenant in one pass, so it
// runs unscoped (no subdomain/session context).
//
//   Authorization: Bearer <CRON_SECRET>
//
// Idempotent: a second run the same day finds nothing left open and closes 0.

/** Constant-time bearer check against CRON_SECRET. */
function secretOk(provided: string | null): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

async function handle(req: Request) {
  const auth = req.headers.get("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : auth;
  if (!secretOk(token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Close anything still open for any day strictly before today, so a break that
  // started yesterday and never closed gets stamped at yesterday's end.
  const today = dayKey(new Date());
  const closed = await runUnscoped(() => sweepOpenBreaks(today));

  return NextResponse.json({ ok: true, closed });
}

// Vercel Cron issues GET; allow POST too for manual / generic schedulers.
export const GET = handle;
export const POST = handle;
