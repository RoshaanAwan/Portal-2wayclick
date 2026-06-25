import { NextResponse } from "next/server";
import { requireTenantUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import {
  readTenantMessage,
  GmailNotConnectedError,
  GmailError,
} from "@/lib/integrations/gmailServer";

// Read one message from the workspace mailbox, for the dashboard reader pane.
// Admin-tier only (it's the company inbox). ?id=<messageId> required.

export async function GET(req: Request) {
  try {
    const user = await requireTenantUser();
    if (!can.manageIntegrations(user.role)) {
      return NextResponse.json(
        { error: "Only an admin can read the workspace mailbox." },
        { status: 403 },
      );
    }

    const id = new URL(req.url).searchParams.get("id")?.trim();
    if (!id) {
      return NextResponse.json({ error: "Missing message id." }, { status: 400 });
    }

    const message = await readTenantMessage(user.tenantId, id);
    return NextResponse.json({ message });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (e instanceof GmailNotConnectedError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    if (e instanceof GmailError) {
      return NextResponse.json(
        { error: e.message, needsReconnect: e.needsReconnect },
        { status: e.status },
      );
    }
    console.error("[gmail.message]", e);
    return NextResponse.json({ error: "Couldn’t load the message." }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
