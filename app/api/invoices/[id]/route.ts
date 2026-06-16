import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { recordActivity } from "@/lib/activityFeed";
import { can } from "@/lib/permissions";
import {
  invoiceInputSchema,
  computeTotals,
  isInvoiceStatus,
  STATUS_META,
  type InvoiceStatus,
} from "@/lib/invoices";

// A PATCH is either a status change (just { status }) or a full edit (the same
// shape as create). We discriminate on whether `status` is the only key.
const statusSchema = z.object({
  status: z.enum(["DRAFT", "SENT", "PAID", "CANCELLED"]),
});

// PATCH /api/invoices/[id] — edit the invoice or move its status. Admin tier.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireUser();
    if (!can.manageInvoices(actor.role)) {
      return NextResponse.json({ error: "Admins only" }, { status: 403 });
    }

    const { id } = await params;
    const existing = await db.invoice.findUnique({
      where: { id },
      select: { id: true, number: true, status: true, clientName: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    const body = await req.json();

    // ── Status-only change ────────────────────────────────────────────────────
    if (
      body &&
      typeof body === "object" &&
      "status" in body &&
      Object.keys(body).length === 1
    ) {
      const { status } = statusSchema.parse(body);
      if (status === existing.status) {
        return NextResponse.json({ ok: true, status });
      }

      await db.invoice.update({
        where: { id },
        data: {
          status,
          // Stamp the first time it's sent / marked paid.
          sentAt:
            status === "SENT" ? new Date() : undefined,
          paidAt: status === "PAID" ? new Date() : undefined,
        },
      });

      await audit({
        actor,
        action: "invoice.status_change",
        entity: "Invoice",
        entityId: id,
        summary: `${actor.name} marked invoice ${existing.number} as ${STATUS_META[status as InvoiceStatus].label}`,
        detail: { from: existing.status, to: status },
      });

      if (status === "PAID") {
        await recordActivity({
          actor,
          verb: "approved",
          target: `invoice ${existing.number} as paid`,
        });
      }

      return NextResponse.json({ ok: true, status });
    }

    // ── Full edit ─────────────────────────────────────────────────────────────
    const input = invoiceInputSchema.parse(body);
    const totals = computeTotals(
      input.items.map((it) => ({
        description: it.description,
        quantity: it.quantity,
        unitPriceCents: it.unitPriceCents,
      })),
      input.taxRateBps,
    );

    // Replace line items wholesale (delete + recreate) inside a transaction —
    // simplest correct way to handle adds/edits/removes in one PATCH.
    await db.$transaction([
      db.invoiceItem.deleteMany({ where: { invoiceId: id } }),
      db.invoice.update({
        where: { id },
        data: {
          clientName: input.clientName,
          clientEmail: input.clientEmail || null,
          clientAddress: input.clientAddress || null,
          notes: input.notes || null,
          currency: input.currency,
          taxRateBps: input.taxRateBps,
          subtotalCents: totals.subtotalCents,
          taxCents: totals.taxCents,
          totalCents: totals.totalCents,
          issueDate: input.issueDate ? new Date(input.issueDate) : undefined,
          dueDate: input.dueDate ? new Date(input.dueDate) : null,
          items: {
            create: totals.lines.map((l) => ({
              description: l.description,
              quantity: l.quantity,
              unitPriceCents: l.unitPriceCents,
              amountCents: l.amountCents,
              position: l.position,
            })),
          },
        },
      }),
    ]);

    await audit({
      actor,
      action: "invoice.update",
      entity: "Invoice",
      entityId: id,
      summary: `${actor.name} edited invoice ${existing.number}`,
      detail: {
        totalCents: totals.totalCents,
        currency: input.currency,
        lineCount: totals.lines.length,
      },
    });

    return NextResponse.json({ ok: true, id });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (e?.name === "ZodError")
      return NextResponse.json(
        { error: e.issues?.[0]?.message || "Invalid invoice." },
        { status: 400 },
      );
    console.error("[invoices.patch]", e);
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}

// DELETE /api/invoices/[id] — remove an invoice and its line items. Admin tier.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireUser();
    if (!can.manageInvoices(actor.role)) {
      return NextResponse.json({ error: "Admins only" }, { status: 403 });
    }

    const { id } = await params;
    const invoice = await db.invoice.findUnique({
      where: { id },
      select: { id: true, number: true, clientName: true },
    });
    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    // Items cascade-delete via the relation's onDelete: Cascade.
    await db.invoice.delete({ where: { id } });

    await audit({
      actor,
      action: "invoice.delete",
      entity: "Invoice",
      entityId: id,
      summary: `${actor.name} deleted invoice ${invoice.number} for ${invoice.clientName}`,
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[invoices.delete]", e);
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
