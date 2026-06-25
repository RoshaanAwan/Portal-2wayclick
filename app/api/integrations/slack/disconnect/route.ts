import { NextResponse } from "next/server";
import { requireTenantUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { runWithTenant } from "@/lib/tenantContext";

// Disconnects the tenant's Slack workspace: deletes the stored connection (and
// thus the bot token). Admin-tier only. Idempotent. We don't revoke the token at
// Slack — uninstalling the app is the admin's call from Slack's side; deleting our
// copy is enough to stop the portal using it.

export async function POST() {
  try {
    const user = await requireTenantUser();
    if (!can.manageIntegrations(user.role)) {
      return NextResponse.json(
        { error: "Only an admin can disconnect Slack." },
        { status: 403 },
      );
    }

    const conn = await db.slackConnection.findFirst({
      where: { tenantId: user.tenantId },
      select: { id: true },
    });
    if (!conn) return NextResponse.json({ ok: true }); // already gone

    await db.slackConnection.delete({ where: { id: conn.id } });

    await runWithTenant(user.tenantId, () =>
      audit({
        actor: user,
        action: "integration.update",
        entity: "SlackConnection",
        entityId: user.tenantId,
        summary: `${user.name} disconnected Slack`,
      }),
    );

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[slack.disconnect]", e);
    return NextResponse.json({ error: "Disconnect failed" }, { status: 500 });
  }
}
