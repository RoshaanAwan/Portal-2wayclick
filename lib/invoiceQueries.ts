import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "./db";
import { appBaseUrl } from "./share";
import type { InvoiceDTO, InvoiceStatus } from "./invoices";

/**
 * Absolute URL a client opens to view an invoice for a given share token.
 * Lives here (not in lib/invoices.ts) because it needs the server-only trusted
 * base URL — keeping lib/invoices.ts free of server-only imports so it can be
 * shared with client components (the form, the detail toolbar).
 */
export function invoiceShareUrl(
  token: string,
  subdomain?: string | null,
): string {
  return `${appBaseUrl(subdomain)}/invoices/shared/${token}`;
}

// ── Invoice read helpers ──────────────────────────────────────────────────────
// Server-only queries + the single Prisma→DTO serializer used by the admin
// pages, the detail page, and the public share page. Keeping serialization here
// (not in each page) means the wire shape stays identical everywhere.

// The fields/relations every invoice view needs. Items ordered top→bottom.
const invoiceInclude = {
  items: { orderBy: { position: "asc" } },
} satisfies Prisma.InvoiceInclude;

type InvoiceRow = Prisma.InvoiceGetPayload<{ include: typeof invoiceInclude }>;

/** Convert a Prisma invoice row (with items) to the client-safe DTO. */
export function toInvoiceDTO(inv: InvoiceRow): InvoiceDTO {
  return {
    id: inv.id,
    number: inv.number,
    clientName: inv.clientName,
    clientEmail: inv.clientEmail,
    clientAddress: inv.clientAddress,
    notes: inv.notes,
    status: inv.status as InvoiceStatus,
    currency: inv.currency,
    subtotalCents: inv.subtotalCents,
    taxRateBps: inv.taxRateBps,
    taxCents: inv.taxCents,
    totalCents: inv.totalCents,
    issueDate: inv.issueDate.toISOString(),
    dueDate: inv.dueDate ? inv.dueDate.toISOString() : null,
    sentAt: inv.sentAt ? inv.sentAt.toISOString() : null,
    paidAt: inv.paidAt ? inv.paidAt.toISOString() : null,
    shareToken: inv.shareToken,
    creatorName: inv.creatorName,
    createdAt: inv.createdAt.toISOString(),
    items: inv.items.map((it) => ({
      id: it.id,
      description: it.description,
      quantity: it.quantity,
      unitPriceCents: it.unitPriceCents,
      amountCents: it.amountCents,
    })),
  };
}

/** All invoices, newest first, as DTOs. */
export async function listInvoices(): Promise<InvoiceDTO[]> {
  const rows = await db.invoice.findMany({
    orderBy: { createdAt: "desc" },
    include: invoiceInclude,
  });
  return rows.map(toInvoiceDTO);
}

/** One invoice by id, or null. */
export async function getInvoice(id: string): Promise<InvoiceDTO | null> {
  const row = await db.invoice.findUnique({
    where: { id },
    include: invoiceInclude,
  });
  return row ? toInvoiceDTO(row) : null;
}

/** One invoice by its public share token, or null (login-less view). */
export async function getInvoiceByToken(
  token: string,
): Promise<InvoiceDTO | null> {
  const row = await db.invoice.findUnique({
    where: { shareToken: token },
    include: invoiceInclude,
  });
  return row ? toInvoiceDTO(row) : null;
}
