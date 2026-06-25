import { NextResponse } from "next/server";
import { requireTenantUser } from "@/lib/auth";
import { getSlackConnection } from "@/lib/integrationsServer";
import { channelHistory, SlackError } from "@/lib/integrations/slack";

// Returns the most recent messages for a channel (newest first), for the
// dashboard's message pane. Open to any tenant member. ?channel=<id> required.

export async function GET(req: Request) {
  try {
    await requireTenantUser();

    const conn = await getSlackConnection();
    if (!conn) {
      return NextResponse.json(
        { error: "Slack isn’t connected." },
        { status: 400 },
      );
    }

    const channelId = new URL(req.url).searchParams.get("channel")?.trim();
    if (!channelId) {
      return NextResponse.json({ error: "Missing channel." }, { status: 400 });
    }

    const messages = await channelHistory(conn.botToken, channelId);
    return NextResponse.json({ messages });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (e instanceof SlackError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[slack.history]", e);
    return NextResponse.json(
      { error: "Couldn’t load messages." },
      { status: 500 },
    );
  }
}

export const dynamic = "force-dynamic";
