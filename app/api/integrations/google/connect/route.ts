import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { requireTenantUser } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/permissions";
import {
  isIntegrationEnabled,
  getGoogleOAuthCreds,
} from "@/lib/integrationsServer";
import { buildAuthUrl, originFromRequest } from "@/lib/integrations/google";

// Kicks off the Google OAuth consent flow. ONLY the Company Owner (SUPER_ADMIN)
// connects — their Drive becomes the tenant's storage, so every member's uploads
// land there. Requires the tile be enabled + the tenant's Google app configured.
// Sets a short-lived CSRF state cookie the callback verifies, then redirects.

const STATE_COOKIE = "gdrive_oauth_state";
const originFrom = originFromRequest;

export async function GET(req: Request) {
  try {
    // Google rejects `.localhost` redirect URIs, and the CSRF cookie wouldn't
    // survive a localhost→lvh.me host switch. So if the browser is on a
    // `.localhost` host, send the user to the dashboard with a clear notice to
    // reopen the app on the lvh.me host (where the whole flow works). We use the
    // RAW (un-normalized) host so the notice lands on the page they're viewing.
    const rawHost = (req.headers.get("host") ?? "").split(":")[0];
    if (rawHost === "localhost" || rawHost.endsWith(".localhost")) {
      const url = new URL(req.url);
      const proto =
        req.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
      const rawOrigin = `${proto}://${req.headers.get("host")}`;
      return NextResponse.redirect(
        new URL("/tools/google-drive?error=use_lvh_host", rawOrigin),
      );
    }

    const user = await requireTenantUser();

    // Only the Company Owner connects the tenant's Drive.
    if (!isSuperAdmin(user.role)) {
      return NextResponse.redirect(
        new URL("/tools/google-drive?error=owner_only", originFrom(req)),
      );
    }

    if (!(await isIntegrationEnabled("google-drive"))) {
      return NextResponse.redirect(
        new URL("/tools/google-drive?error=disabled", originFrom(req)),
      );
    }
    const creds = await getGoogleOAuthCreds();
    if (!creds) {
      return NextResponse.redirect(
        new URL("/tools/google-drive?error=not_configured", originFrom(req)),
      );
    }

    const origin = originFrom(req);
    // Bind the state to the user so a leaked state can't be replayed by another.
    const state = `${user.id}.${randomBytes(16).toString("hex")}`;
    const authUrl = buildAuthUrl(creds, origin, state);

    const res = NextResponse.redirect(authUrl);
    res.cookies.set(STATE_COOKIE, state, {
      httpOnly: true,
      secure:
        process.env.COOKIE_INSECURE === "true"
          ? false
          : process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600, // 10 minutes
      path: "/",
    });
    return res;
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED") {
      return NextResponse.redirect(new URL("/login", originFrom(req)));
    }
    console.error("[google.connect]", e);
    return NextResponse.redirect(
      new URL("/tools/google-drive?error=connect_failed", originFrom(req)),
    );
  }
}
