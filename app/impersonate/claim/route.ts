import { NextResponse } from "next/server";
import { adminDb } from "@/lib/db";
import { setSessionCookie } from "@/lib/auth";

// Target-host claim for impersonation. The impersonate API (called on the
// platform host) mints a session row and hands back its token; the client
// navigates HERE on the TARGET tenant's subdomain so the host-scoped session
// cookie is set on the right host. Lives outside the (app) group so the
// System-Owner redirect doesn't fire before the cookie exists.
//
// The token only works if it belongs to a valid, unexpired IMPERSONATION
// session (impersonatedBy set) — a normal session token can't be claimed this
// way. Single-use in effect: it's a fresh random token tied to one session.
export async function GET(req: Request) {
  const url = new URL(req.url);
  // Redirect against the REQUEST HOST (the browser-facing subdomain, e.g.
  // roshaan.localhost:3000), not req.url — behind a proxy/dev server req.url's
  // host is the internal one (bare localhost), which would drop the subdomain
  // and bounce the user to the wrong host. The session cookie is host-scoped, so
  // the post-claim navigation MUST stay on this subdomain.
  const host = req.headers.get("host") ?? url.host;
  const proto =
    req.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  const dest = (path: string) => `${proto}://${host}${path}`;

  const token = url.searchParams.get("token");
  if (!token) {
    return NextResponse.redirect(dest("/login"));
  }

  const session = await adminDb.session.findUnique({
    where: { token },
    select: { impersonatedBy: true, expiresAt: true },
  });

  // Must be an impersonation session that hasn't expired.
  if (!session || !session.impersonatedBy || session.expiresAt < new Date()) {
    return NextResponse.redirect(dest("/login"));
  }

  await setSessionCookie(token, session.expiresAt);
  return NextResponse.redirect(dest("/dashboard"));
}
