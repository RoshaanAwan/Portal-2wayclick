import { NextResponse } from "next/server";
import { requireTenantUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { runWithTenant } from "@/lib/tenantContext";
import {
  sendTenantEmail,
  GmailNotConnectedError,
  GmailError,
} from "@/lib/integrations/gmailServer";

// Send an email AS the workspace mailbox (the owner's connected Google account).
// Admin-tier only — this sends from the company's address, not a personal one.

export async function POST(req: Request) {
  try {
    const user = await requireTenantUser();
    if (!can.manageIntegrations(user.role)) {
      return NextResponse.json(
        { error: "Only an admin can send mail from the workspace mailbox." },
        { status: 403 },
      );
    }

    const body = await req.json().catch(() => ({}));
    const to = typeof body.to === "string" ? body.to.trim() : "";
    const subject = typeof body.subject === "string" ? body.subject.trim() : "";
    const text = typeof body.body === "string" ? body.body : "";

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
      return NextResponse.json({ error: "Enter a valid recipient email." }, { status: 400 });
    }
    if (!subject) {
      return NextResponse.json({ error: "Subject can’t be empty." }, { status: 400 });
    }
    if (!text.trim()) {
      return NextResponse.json({ error: "Message body can’t be empty." }, { status: 400 });
    }

    const result = await sendTenantEmail(user.tenantId, { to, subject, body: text });

    await runWithTenant(user.tenantId, () =>
      audit({
        actor: user,
        action: "integration.update",
        entity: "Gmail",
        entityId: result.id,
        summary: `${user.name} sent an email to ${to}`,
        detail: { to, subject },
      }),
    );

    return NextResponse.json({ ok: true, id: result.id });
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
    console.error("[gmail.send]", e);
    return NextResponse.json({ error: "Couldn’t send the email." }, { status: 500 });
  }
}
