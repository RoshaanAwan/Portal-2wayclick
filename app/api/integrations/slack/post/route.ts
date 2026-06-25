import { NextResponse } from "next/server";
import { requireTenantUser } from "@/lib/auth";
import { getSlackConnection } from "@/lib/integrationsServer";
import { postMessage, SlackError } from "@/lib/integrations/slack";

// Posts a message to a Slack channel as the workspace bot. Open to any tenant
// member (the dashboard is workspace-wide). The message is prefixed with the
// sender's name so Slack readers know who posted via the portal (the bot is the
// nominal author). Slack isn't connected → 400 with a friendly hint.

export async function POST(req: Request) {
  try {
    const user = await requireTenantUser();

    const conn = await getSlackConnection();
    if (!conn) {
      return NextResponse.json(
        { error: "Slack isn’t connected — ask an admin to connect it." },
        { status: 400 },
      );
    }

    const body = await req.json().catch(() => ({}));
    const channelId = typeof body.channelId === "string" ? body.channelId.trim() : "";
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (!channelId) {
      return NextResponse.json({ error: "Pick a channel." }, { status: 400 });
    }
    if (!text) {
      return NextResponse.json({ error: "Message can’t be empty." }, { status: 400 });
    }
    if (text.length > 3000) {
      return NextResponse.json(
        { error: "Message is too long (max 3000 characters)." },
        { status: 400 },
      );
    }

    // Attribute the message to the portal user (the bot is the API author).
    const result = await postMessage(
      conn.botToken,
      channelId,
      `*${user.name}* (via portal): ${text}`,
    );

    return NextResponse.json({ ok: true, ts: result.ts });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (e instanceof SlackError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[slack.post]", e);
    return NextResponse.json({ error: "Couldn’t send the message." }, { status: 500 });
  }
}
