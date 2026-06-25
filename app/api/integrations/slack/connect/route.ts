import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { requireTenantUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import {
  isIntegrationEnabled,
  getSlackOAuthCreds,
} from "@/lib/integrationsServer";
import { buildAuthUrl, originFromRequest } from "@/lib/integrations/slack";

// Kicks off the "Add to Slack" OAuth flow. Admin-tier only (can.manageIntegrations)
// — one Slack connection per workspace. Requires the tile be enabled + the
// tenant's Slack app configured. Sets a short-lived CSRF state cookie the callback
// verifies, then redirects to Slack's consent screen.

const STATE_COOKIE = "slack_oauth_state";
const originFrom = originFromRequest;

export async function GET(req: Request) {
  try {
    // Slack (like Google) rejects `.localhost` redirect URIs, and the CSRF cookie
    // wouldn't survive a localhost→lvh.me host switch. Bounce the user to the
    // dashboard with a clear notice to reopen on the lvh.me host (RAW host so the
    // notice lands on the page they're viewing).
    const rawHost = (req.headers.get("host") ?? "").split(":")[0];
    if (rawHost === "localhost" || rawHost.endsWith(".localhost")) {
      const url = new URL(req.url);
      const proto =
        req.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
      const rawOrigin = `${proto}://${req.headers.get("host")}`;
      return NextResponse.redirect(
        new URL("/tools/slack?error=use_lvh_host", rawOrigin),
      );
    }

    const user = await requireTenantUser();

    if (!can.manageIntegrations(user.role)) {
      return NextResponse.redirect(
        new URL("/tools/slack?error=admin_only", originFrom(req)),
      );
    }

    if (!(await isIntegrationEnabled("slack"))) {
      return NextResponse.redirect(
        new URL("/tools/slack?error=disabled", originFrom(req)),
      );
    }
    const creds = await getSlackOAuthCreds();
    if (!creds) {
      return NextResponse.redirect(
        new URL("/tools/slack?error=not_configured", originFrom(req)),
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
    console.error("[slack.connect]", e);
    return NextResponse.redirect(
      new URL("/tools/slack?error=connect_failed", originFrom(req)),
    );
  }
}
