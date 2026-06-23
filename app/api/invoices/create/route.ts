import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { recordActivity } from "@/lib/activityFeed";
import { can } from "@/lib/permissions";
import {
  invoiceInputSchema,
  computeTotals,
  nextNumber,
  formatMoney,
} from "@/lib/invoices";

// POST /api/invoices/create — raise a new client invoice (Admin tier only).
// Computes per-line and invoice totals server-side from the validated input,
// assigns the next sequential number, and stores everything as a snapshot.
export async function POST(req: Request) {
  try {
    const actor = await requireUser();
    if (!can.manageInvoices(actor.role)) {
      return NextResponse.json({ error: "Admins only" }, { status: 403 });
    }

    const input = invoiceInputSchema.parse(await req.json());

    const totals = computeTotals(
      input.items.map((it) => ({
        description: it.description,
        quantity: it.quantity,
        unitPriceCents: it.unitPriceCents,
      })),
      input.taxRateBps,
    );

    // Sequential number from the current count. Wrapped with the create in a
    // transaction so two concurrent creates can't collide on the same number;
    // the @unique constraint is the final backstop.
    const invoice = await db.$transaction(async (tx) => {
      const count = await tx.invoice.count();
      return tx.invoice.create({
        data: {
          tenantId: actor.tenantId,
          number: nextNumber(count),
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
          creatorId: actor.id,
          creatorName: actor.name,
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
      });
    });

    await recordActivity({
      actor,
      verb: "created",
      target: `invoice ${invoice.number} for ${input.clientName}`,
    });

    await audit({
      actor,
      action: "invoice.create",
      entity: "Invoice",
      entityId: invoice.id,
      summary: `${actor.name} created invoice ${invoice.number} (${formatMoney(
        totals.totalCents,
        input.currency,
      )}) for ${input.clientName}`,
      detail: {
        number: invoice.number,
        clientName: input.clientName,
        totalCents: totals.totalCents,
        currency: input.currency,
        lineCount: totals.lines.length,
      },
    });

    return NextResponse.json({ ok: true, id: invoice.id, number: invoice.number });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (e?.name === "ZodError")
      return NextResponse.json(
        { error: e.issues?.[0]?.message || "Invalid invoice." },
        { status: 400 },
      );
    console.error("[invoices.create]", e);
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
