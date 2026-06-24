import { NextResponse } from "next/server";
import { requireTenantUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { runWithTenant } from "@/lib/tenantContext";
import { seal } from "@/lib/cryptoBox";
import { getGoogleOAuthCreds } from "@/lib/integrationsServer";
import { isSuperAdmin } from "@/lib/permissions";
import {
  exchangeCode,
  emailFromIdToken,
  originFromRequest,
} from "@/lib/integrations/google";

// Google redirects here after consent. We verify the CSRF state cookie, exchange
// the code for tokens, and store the (encrypted) refresh token for the CURRENT
// user. On any failure we bounce back to the dashboard with an ?error so the UI
// can explain. The refresh token is the durable credential — without
// access_type=offline + prompt=consent Google may omit it, which we treat as an
// error (can't operate without it).

const STATE_COOKIE = "gdrive_oauth_state";
const originFrom = originFromRequest;

export async function GET(req: Request) {
  const origin = originFrom(req);
  const back = (q: string) =>
    NextResponse.redirect(new URL(`/tools/google-drive?${q}`, origin));

  try {
    const user = await requireTenantUser();
    if (!isSuperAdmin(user.role)) return back("error=owner_only");

    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const oauthError = url.searchParams.get("error");

    if (oauthError) return back(`error=${encodeURIComponent(oauthError)}`);
    if (!code || !state) return back("error=missing_code");

    // CSRF: the state must match the cookie AND be bound to this user.
    const cookieState = req.headers
      .get("cookie")
      ?.split(/;\s*/)
      .find((c) => c.startsWith(`${STATE_COOKIE}=`))
      ?.split("=")[1];
    if (!cookieState || cookieState !== state || !state.startsWith(`${user.id}.`)) {
      return back("error=bad_state");
    }

    const creds = await getGoogleOAuthCreds();
    if (!creds) return back("error=not_configured");

    const tokens = await exchangeCode(creds, code, origin);
    if (!tokens.refresh_token) {
      // No refresh token (user previously consented without revoking). Ask them
      // to remove the app's access and reconnect.
      return back("error=no_refresh_token");
    }

    const googleEmail = emailFromIdToken(tokens.id_token);
    const sealed = seal(tokens.refresh_token);

    await db.googleDriveConnection.upsert({
      where: { userId: user.id },
      create: {
        tenantId: user.tenantId,
        userId: user.id,
        refreshToken: sealed,
        googleEmail,
      },
      update: { refreshToken: sealed, googleEmail },
    });

    await runWithTenant(user.tenantId, () =>
      audit({
        actor: user,
        action: "integration.update",
        entity: "GoogleDriveConnection",
        entityId: user.id,
        targetUserId: user.id,
        summary: `${user.name} connected their Google Drive`,
        detail: { googleEmail },
      }),
    );

    // Best-effort: clear the state cookie.
    const res = back("connected=1");
    res.cookies.set(STATE_COOKIE, "", { maxAge: 0, path: "/" });
    return res;
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED") {
      return NextResponse.redirect(new URL("/login", origin));
    }
    console.error("[google.callback]", e);
    return back("error=connect_failed");
  }
}

export const dynamic = "force-dynamic";
