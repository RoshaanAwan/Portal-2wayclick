import { NextResponse } from "next/server";
import { requireTenantUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { runWithTenant } from "@/lib/tenantContext";
import { getSlackConnection } from "@/lib/integrationsServer";
import { listChannels } from "@/lib/integrations/slack";

// Sets (or clears) the channel that portal notifications route to. Admin-tier
// only. A null/empty channelId turns off Slack routing. We validate the channel
// id against the live channel list so a stale/typo id can't be persisted.

export async function POST(req: Request) {
  try {
    const user = await requireTenantUser();
    if (!can.manageIntegrations(user.role)) {
      return NextResponse.json(
        { error: "Only an admin can set the Slack notification channel." },
        { status: 403 },
      );
    }

    const conn = await getSlackConnection();
    if (!conn) {
      return NextResponse.json(
        { error: "Connect Slack first." },
        { status: 400 },
      );
    }

    const body = await req.json().catch(() => ({}));
    const channelId =
      typeof body.channelId === "string" && body.channelId.trim()
        ? body.channelId.trim()
        : null;

    let channelName: string | null = null;
    if (channelId) {
      // Validate against the live list (and resolve the name for display).
      const channels = await listChannels(conn.botToken);
      const match = channels.find((c) => c.id === channelId);
      if (!match) {
        return NextResponse.json(
          { error: "That channel isn’t in this workspace." },
          { status: 400 },
        );
      }
      channelName = match.name;
    }

    await db.slackConnection.update({
      where: { tenantId: user.tenantId },
      data: { notifyChannelId: channelId, notifyChannelName: channelName },
    });

    await runWithTenant(user.tenantId, () =>
      audit({
        actor: user,
        action: "integration.update",
        entity: "SlackConnection",
        entityId: user.tenantId,
        summary: channelId
          ? `${user.name} routed portal notifications to #${channelName}`
          : `${user.name} turned off Slack notification routing`,
        detail: { channelId, channelName },
      }),
    );

    return NextResponse.json({ ok: true, channelId, channelName });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[slack.channel]", e);
    return NextResponse.json(
      { error: "Couldn’t set the channel." },
      { status: 500 },
    );
  }
}
