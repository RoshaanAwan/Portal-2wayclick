import { NextResponse } from "next/server";
import { requireSystemOwner } from "@/lib/auth";
import { adminDb } from "@/lib/db";
import { seal } from "@/lib/cryptoBox";
import { emailFromIdToken, originFromRequest } from "@/lib/integrations/google";

export const dynamic = "force-dynamic";

const STATE_COOKIE = "sys_gdrive_state";
const RETURN_COOKIE = "sys_gdrive_return";

function parseCookieValue(cookieHeader: string | null, name: string) {
  return cookieHeader
    ?.split(/;\s*/)
    .find((c) => c.startsWith(`${name}=`))
    ?.split("=")[1];
}

export async function GET(req: Request) {
  const origin = originFromRequest(req);
  const rawReturn = parseCookieValue(req.headers.get("cookie"), RETURN_COOKIE);
  const returnTo = rawReturn ? decodeURIComponent(rawReturn) : "/system/settings";
  const back = (q: string) => NextResponse.redirect(new URL(`${returnTo}?${q}`, origin));

  try {
    const actor = await requireSystemOwner();

    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const oauthError = url.searchParams.get("error");

    if (oauthError) return back(`drive_error=${encodeURIComponent(oauthError)}`);
    if (!code || !state) return back("drive_error=missing_code");

    // CSRF: state must match cookie and be bound to this user.
    const cookieState = parseCookieValue(req.headers.get("cookie"), STATE_COOKIE);
    if (!cookieState || cookieState !== state || !state.startsWith(`${actor.id}.`)) {
      return back("drive_error=bad_state");
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) return back("drive_error=not_configured");

    // Call the token endpoint directly with the system callback URI — avoids the
    // shared redirectUri() helper which hardcodes /api/integrations/google/callback.
    const redirectUri = `${origin}/api/system/google/callback`;
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code" }),
    });
    if (!tokenRes.ok) {
      const detail = await tokenRes.text().catch(() => "");
      console.error("[system.google.callback] token exchange failed", detail);
      return back("drive_error=token_exchange_failed");
    }
    const tokens = (await tokenRes.json()) as { refresh_token?: string; id_token?: string };
    if (!tokens.refresh_token) return back("drive_error=no_refresh_token");

    const googleEmail = emailFromIdToken(tokens.id_token);
    const sealed = seal(tokens.refresh_token);

    await adminDb.googleDriveConnection.upsert({
      where: { userId: actor.id },
      create: {
        tenantId: actor.tenantId,
        userId: actor.id,
        refreshToken: sealed,
        googleEmail,
      },
      update: { refreshToken: sealed, googleEmail },
    });

    const res = back("drive_connected=1");
    res.cookies.set(STATE_COOKIE, "", { maxAge: 0, path: "/" });
    res.cookies.set(RETURN_COOKIE, "", { maxAge: 0, path: "/" });
    return res;
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED" || e?.message === "FORBIDDEN")
      return NextResponse.redirect(new URL("/login", originFromRequest(req)));
    console.error("[system.google.callback]", e);
    return back("drive_error=connect_failed");
  }
}
