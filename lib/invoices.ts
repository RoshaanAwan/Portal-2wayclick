import { z } from "zod";

// ── Invoice domain helpers ───────────────────────────────────────────────────
// Money is integer minor units (cents) everywhere — never a float. A line's
// amount is qty * unitPriceCents; the invoice subtotal is the sum of lines; tax
// is subtotal * taxRateBps / 10000 (basis points, so 825 = 8.25%); the total is
// subtotal + tax. All rounding happens once, here, with Math.round.

/** Supported currencies (ISO 4217). Extend as needed. */
export const CURRENCIES = ["USD", "EUR", "GBP", "PKR", "AED", "CAD", "AUD"] as const;
export type Currency = (typeof CURRENCIES)[number];

export function isCurrency(v: unknown): v is Currency {
  return typeof v === "string" && (CURRENCIES as readonly string[]).includes(v);
}

// ── Status ────────────────────────────────────────────────────────────────────

export const INVOICE_STATUSES = ["DRAFT", "SENT", "PAID", "CANCELLED"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export function isInvoiceStatus(v: unknown): v is InvoiceStatus {
  return (
    typeof v === "string" &&
    (INVOICE_STATUSES as readonly string[]).includes(v)
  );
}

/** Label + badge variant per status (badge variants match components/ui/Badge). */
export const STATUS_META: Record<
  InvoiceStatus,
  { label: string; badge: "accent" | "amber" | "cyan" | "emerald" | "neutral" }
> = {
  DRAFT: { label: "Draft", badge: "neutral" },
  SENT: { label: "Sent", badge: "amber" },
  PAID: { label: "Paid", badge: "emerald" },
  CANCELLED: { label: "Cancelled", badge: "neutral" },
};

// ── Money ─────────────────────────────────────────────────────────────────────

/** Minor-unit symbol-ish formatting via Intl; falls back to code + amount. */
export function formatMoney(cents: number, currency: string): string {
  const amount = cents / 100;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

/** Convert a user-entered major-unit string/number (e.g. "12.50") to cents. */
export function toCents(value: number): number {
  return Math.round(value * 100);
}

/** Basis points → human percent string, e.g. 825 → "8.25%". */
export function formatTaxRate(bps: number): string {
  return `${(bps / 100).toFixed(2).replace(/\.?0+$/, "")}%`;
}

// ── Totals ────────────────────────────────────────────────────────────────────

export interface LineInput {
  description: string;
  quantity: number;
  unitPriceCents: number;
}

export interface ComputedLine extends LineInput {
  amountCents: number;
  position: number;
}

export interface ComputedTotals {
  lines: ComputedLine[];
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
}

/**
 * Compute per-line amounts and the invoice subtotal/tax/total from raw line
 * inputs and a tax rate in basis points. Pure — the single source of truth for
 * invoice math, called at create and on every edit so the cached columns and a
 * live preview never disagree.
 */
export function computeTotals(
  lines: LineInput[],
  taxRateBps: number,
): ComputedTotals {
  const computed: ComputedLine[] = lines.map((l, i) => ({
    ...l,
    amountCents: Math.round(l.quantity * l.unitPriceCents),
    position: i,
  }));
  const subtotalCents = computed.reduce((sum, l) => sum + l.amountCents, 0);
  const taxCents = Math.round((subtotalCents * taxRateBps) / 10000);
  return {
    lines: computed,
    subtotalCents,
    taxCents,
    totalCents: subtotalCents + taxCents,
  };
}

// ── Numbering ─────────────────────────────────────────────────────────────────

/**
 * The next human invoice number, e.g. "INV-0007", given how many invoices
 * already exist. Zero-padded to 4 digits; rolls over gracefully past 9999.
 * Pass the current total count (await db.invoice.count()).
 */
export function nextNumber(existingCount: number): string {
  const n = existingCount + 1;
  return `INV-${String(n).padStart(4, "0")}`;
}

// Note: invoiceShareUrl (which needs the server-only trusted base URL) lives in
// lib/invoiceQueries.ts so this module stays importable from client components.

// ── Validation (shared by the create/update API routes) ───────────────────────

export const lineSchema = z.object({
  description: z.string().trim().min(1, "Description required").max(300),
  quantity: z.number().int().min(1).max(1_000_000),
  // Per-unit price in minor units (cents). Non-negative.
  unitPriceCents: z.number().int().min(0).max(1_000_000_000),
});

export const invoiceInputSchema = z.object({
  clientName: z.string().trim().min(1, "Client name required").max(160),
  clientEmail: z.string().trim().email().max(200).optional().or(z.literal("")),
  clientAddress: z.string().trim().max(500).optional().or(z.literal("")),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
  currency: z.enum(CURRENCIES),
  // Basis points: 0–10000 (= 0%–100%).
  taxRateBps: z.number().int().min(0).max(10000).default(0),
  // ISO date strings (yyyy-mm-dd) from <input type="date">, or empty.
  issueDate: z.string().trim().optional().or(z.literal("")),
  dueDate: z.string().trim().optional().or(z.literal("")),
  items: z.array(lineSchema).min(1, "Add at least one line item").max(100),
});

export type InvoiceInput = z.infer<typeof invoiceInputSchema>;

// ── DTO shared between server pages and client components ──────────────────────

export interface InvoiceItemDTO {
  id: string;
  description: string;
  quantity: number;
  unitPriceCents: number;
  amountCents: number;
}

export interface InvoiceDTO {
  id: string;
  number: string;
  clientName: string;
  clientEmail: string | null;
  clientAddress: string | null;
  notes: string | null;
  status: InvoiceStatus;
  currency: string;
  subtotalCents: number;
  taxRateBps: number;
  taxCents: number;
  totalCents: number;
  issueDate: string;
  dueDate: string | null;
  sentAt: string | null;
  paidAt: string | null;
  shareToken: string | null;
  creatorName: string;
  createdAt: string;
  items: InvoiceItemDTO[];
}
