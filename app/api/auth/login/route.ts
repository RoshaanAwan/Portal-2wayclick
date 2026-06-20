import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { verifyPassword, createSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { rateLimit, clientIp, LIMITS } from "@/lib/rateLimit";

// A precomputed bcrypt hash (of a random throwaway string) compared against on
// the unknown-email path so that path spends ~the same time as a real password
// check. Without this, an unknown email returns measurably faster (it skips
// bcrypt), leaking account existence via response timing even though the body is
// identical. cost 10 matches hashPassword() in lib/auth.ts.
const DUMMY_HASH = bcrypt.hashSync("timing-equalizer-not-a-real-password", 10);

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// NOTE: unknown email, wrong password, AND disabled account all return the SAME
// generic 401 below, so an unauthenticated caller cannot use the response to
// learn whether an email is registered or disabled (no enumeration oracle).

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const { email, password } = parsed.data;
    const normEmail = email.toLowerCase();

    // Throttle online password guessing: cap attempts per IP AND per email so a
    // single source can't brute-force, and a single account can't be targeted
    // from many IPs. Failing open is handled inside rateLimit().
    const ip = clientIp(req);
    const [ipLimit, emailLimit] = await Promise.all([
      rateLimit(`login:ip:${ip}`, LIMITS.login.limit, LIMITS.login.windowMs),
      rateLimit(`login:email:${normEmail}`, LIMITS.login.limit, LIMITS.login.windowMs),
    ]);
    if (!ipLimit.ok || !emailLimit.ok) {
      const retryAfter = Math.max(ipLimit.retryAfter, emailLimit.retryAfter);
      return NextResponse.json(
        { error: "Too many attempts. Please try again later." },
        { status: 429, headers: { "Retry-After": String(retryAfter) } },
      );
    }

    const user = await db.user.findUnique({ where: { email: normEmail } });
    // Always run a bcrypt compare — against the real hash if the user exists, or
    // a dummy hash otherwise — so the unknown-email and wrong-password paths take
    // the same time (no timing-based account enumeration). The result for an
    // unknown email is discarded; the outcome is the same generic 401 either way.
    let passwordOk = false;
    if (user) {
      passwordOk = await verifyPassword(password, user.passwordHash);
    } else {
      // No such user — still spend the bcrypt time, then fail.
      await bcrypt.compare(password, DUMMY_HASH);
    }
    if (!user || !passwordOk) {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 },
      );
    }

    // Disabled accounts cannot sign in. Return the SAME generic 401 as a wrong
    // password (not a distinct 403) so the response doesn't reveal that the email
    // belongs to a real, currently-disabled account.
    if (user.disabledAt) {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 },
      );
    }

    await createSession(user.id);

    await audit({
      actor: { id: user.id, name: user.name, role: user.role },
      action: "auth.login",
      entity: "Session",
      targetUserId: user.id,
      summary: `${user.name} signed in`,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    // Log the real cause — a 500 on login most often means missing tables after
    // a deploy; swallowing it silently makes the most common prod login outage
    // invisible. Matches the logging convention of the other routes.
    console.error("login failed", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
