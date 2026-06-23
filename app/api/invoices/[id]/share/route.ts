import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { can } from "@/lib/permissions";
import { newShareToken } from "@/lib/share";
import { invoiceShareUrl } from "@/lib/invoiceQueries";

// ── Manage an invoice's public client link ─────────────────────────────────
// Admins-only. Two actions, mirroring the project share route:
//   • regenerate → issue a fresh token (also creates a link where none exists).
//     Any previously shared URL stops working.
//   • revoke     → drop the token; the public invoice view returns 404.
// The link is read at /invoices/shared/<token>.

const schema = z.object({
  action: z.enum(["regenerate", "revoke"]),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireUser();
    if (!can.manageInvoices(actor.role)) {
      return NextResponse.json({ error: "Admins only" }, { status: 403 });
    }

    const { id } = await params;
    const { action } = schema.parse(await req.json());

    // The client link must point at THIS tenant's host (subdomain), forwarded
    // by middleware as x-tenant-subdomain — not the global base URL.
    const subdomain = (await headers()).get("x-tenant-subdomain");

    const invoice = await db.invoice.findUnique({
      where: { id },
      select: { id: true, number: true },
    });
    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    if (action === "revoke") {
      await db.invoice.update({ where: { id }, data: { shareToken: null } });
      await audit({
        actor,
        action: "invoice.share_revoke",
        entity: "Invoice",
        entityId: invoice.id,
        summary: `${actor.name} revoked the client link for invoice ${invoice.number}`,
      });
      return NextResponse.json({ ok: true, shareUrl: null });
    }

    const shareToken = newShareToken();
    await db.invoice.update({ where: { id }, data: { shareToken } });
    await audit({
      actor,
      action: "invoice.share_regenerate",
      entity: "Invoice",
      entityId: invoice.id,
      summary: `${actor.name} created a client link for invoice ${invoice.number}`,
    });
    return NextResponse.json({
      ok: true,
      shareUrl: invoiceShareUrl(shareToken, subdomain),
    });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
