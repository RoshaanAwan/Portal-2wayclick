import { NextResponse } from "next/server";
import { requireTenantUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { runWithTenant } from "@/lib/tenantContext";
import { seal } from "@/lib/cryptoBox";
import { getSlackOAuthCreds } from "@/lib/integrationsServer";
import { exchangeCode, originFromRequest, SlackError } from "@/lib/integrations/slack";

// Slack redirects here after consent. We verify the CSRF state cookie, exchange
// the code for the workspace BOT token, and store it (encrypted) on the tenant's
// single SlackConnection row. On any failure we bounce back to the dashboard with
// an ?error so the UI can explain. Admin-tier only.

const STATE_COOKIE = "slack_oauth_state";
const originFrom = originFromRequest;

export async function GET(req: Request) {
  const origin = originFrom(req);
  const back = (q: string) =>
    NextResponse.redirect(new URL(`/tools/slack?${q}`, origin));

  try {
    const user = await requireTenantUser();
    if (!can.manageIntegrations(user.role)) return back("error=admin_only");

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

    const creds = await getSlackOAuthCreds();
    if (!creds) return back("error=not_configured");

    const result = await exchangeCode(creds, code, origin);
    const sealed = seal(result.botToken);

    await db.slackConnection.upsert({
      where: { tenantId: user.tenantId },
      create: {
        tenantId: user.tenantId,
        teamId: result.teamId,
        teamName: result.teamName,
        botToken: sealed,
        connectedById: user.id,
      },
      // Reconnecting refreshes the token + team but keeps the chosen notify
      // channel (admins shouldn't have to re-pick it after a re-auth).
      update: {
        teamId: result.teamId,
        teamName: result.teamName,
        botToken: sealed,
        connectedById: user.id,
      },
    });

    await runWithTenant(user.tenantId, () =>
      audit({
        actor: user,
        action: "integration.update",
        entity: "SlackConnection",
        entityId: user.tenantId,
        summary: `${user.name} connected Slack (${result.teamName ?? result.teamId})`,
        detail: { teamId: result.teamId, teamName: result.teamName },
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
    console.error("[slack.callback]", e);
    // Surface Slack's actual error code (bad_redirect_uri, invalid_code, …) so
    // the dashboard explains the real reason instead of a generic failure.
    if (e instanceof SlackError && e.code) {
      return back(`error=${encodeURIComponent(e.code)}`);
    }
    return back("error=connect_failed");
  }
}

export const dynamic = "force-dynamic";
