import {
  formatMoney,
  formatTaxRate,
  STATUS_META,
  type InvoiceDTO,
} from "@/lib/invoices";
import { formatDate } from "@/lib/utils";

// ── The printable invoice ─────────────────────────────────────────────────────
// A self-contained, paper-style invoice rendered identically in the admin detail
// page and the public client share page. It deliberately uses FIXED light colors
// (zinc/white + the brand accent) and `print-color-adjust: exact` so it looks the
// same on a dark portal, a light portal, and a printed PDF. Wrap it in an element
// with the `print-area` class to make it the only thing that prints.

// Issuer identity shown on every invoice. Edit here to rebrand.
const ISSUER = {
  name: "2WayClick",
  tagline: "Company Portal",
  website: "2wayclick.com",
};

// The brand accent (#f5683f). Used inline so it survives the print pipeline
// regardless of theme — Tailwind theme tokens don't apply to printed output.
const ACCENT = "#f5683f";
const exact = {
  printColorAdjust: "exact",
  WebkitPrintColorAdjust: "exact",
} as const;

export function InvoiceDocument({ invoice }: { invoice: InvoiceDTO }) {
  const status = STATUS_META[invoice.status];

  return (
    <div
      className="mx-auto w-full max-w-[820px] overflow-hidden rounded-2xl border border-zinc-200 bg-white text-zinc-800 shadow-sm"
      style={exact}
    >
      {/* Accent top bar */}
      <div className="h-1.5 w-full" style={{ backgroundColor: ACCENT, ...exact }} />

      <div className="p-8 sm:p-10">
        {/* Header: brand ↔ invoice meta */}
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.png"
              alt={ISSUER.name}
              className="h-12 w-auto object-contain"
              style={exact}
            />
            <div>
              <p className="text-lg font-bold leading-tight tracking-tight text-zinc-900">
                {ISSUER.name}
              </p>
              <p className="text-xs text-zinc-400">{ISSUER.tagline}</p>
            </div>
          </div>

          <div className="text-right">
            <p
              className="text-[26px] font-extrabold uppercase leading-none tracking-tight"
              style={{ color: ACCENT, ...exact }}
            >
              Invoice
            </p>
            <p className="mt-1.5 font-mono text-sm text-zinc-500">
              {invoice.number}
            </p>
            <span className={statusPillClass(invoice.status)} style={exact}>
              {status.label}
            </span>
          </div>
        </div>

        {/* Parties + meta panel */}
        <div className="mt-9 grid grid-cols-1 gap-6 sm:grid-cols-[1fr_1fr_auto]">
          <Party label="From">
            <p className="text-sm font-semibold text-zinc-900">{ISSUER.name}</p>
          </Party>

          <Party label="Bill to">
            <p className="text-sm font-semibold text-zinc-900">
              {invoice.clientName}
            </p>
            {invoice.clientAddress && (
              <p className="mt-0.5 whitespace-pre-line text-sm text-zinc-500">
                {invoice.clientAddress}
              </p>
            )}
          </Party>

          {/* Dates / amount-due summary card */}
          <div
            className="rounded-xl bg-zinc-50 p-4 sm:min-w-[190px]"
            style={exact}
          >
            <MetaRow label="Issued" value={formatDate(invoice.issueDate)} />
            {invoice.dueDate && (
              <MetaRow label="Due" value={formatDate(invoice.dueDate)} />
            )}
            <div className="my-2.5 h-px bg-zinc-200" style={exact} />
            <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
              Amount due
            </p>
            <p
              className="mt-0.5 text-xl font-extrabold tabular-nums"
              style={{ color: ACCENT, ...exact }}
            >
              {formatMoney(invoice.totalCents, invoice.currency)}
            </p>
          </div>
        </div>

        {/* Line items */}
        <table className="mt-9 w-full border-collapse text-sm">
          <thead>
            <tr style={exact}>
              <th
                className="rounded-l-lg bg-zinc-900 py-2.5 pl-3 pr-2 text-left text-[11px] font-semibold uppercase tracking-wider text-white"
                style={exact}
              >
                Description
              </th>
              <th
                className="bg-zinc-900 px-2 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-white"
                style={exact}
              >
                Qty
              </th>
              <th
                className="bg-zinc-900 px-2 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-white"
                style={exact}
              >
                Unit price
              </th>
              <th
                className="rounded-r-lg bg-zinc-900 py-2.5 pl-2 pr-3 text-right text-[11px] font-semibold uppercase tracking-wider text-white"
                style={exact}
              >
                Amount
              </th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((it, i) => (
              <tr
                key={it.id}
                className="align-top"
                style={i % 2 === 1 ? { backgroundColor: "#fafafa", ...exact } : exact}
              >
                <td className="py-3 pl-3 pr-2 text-zinc-800">{it.description}</td>
                <td className="px-2 py-3 text-right tabular-nums text-zinc-500">
                  {it.quantity}
                </td>
                <td className="px-2 py-3 text-right tabular-nums text-zinc-500">
                  {formatMoney(it.unitPriceCents, invoice.currency)}
                </td>
                <td className="py-3 pl-2 pr-3 text-right font-semibold tabular-nums text-zinc-900">
                  {formatMoney(it.amountCents, invoice.currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div className="mt-6 flex justify-end">
          <div className="w-full max-w-[280px] text-sm">
            <TotalRow
              label="Subtotal"
              value={formatMoney(invoice.subtotalCents, invoice.currency)}
            />
            {invoice.taxRateBps > 0 && (
              <TotalRow
                label={`Tax (${formatTaxRate(invoice.taxRateBps)})`}
                value={formatMoney(invoice.taxCents, invoice.currency)}
              />
            )}
            <div
              className="mt-2 flex items-center justify-between rounded-xl px-4 py-3 text-white"
              style={{ backgroundColor: ACCENT, ...exact }}
            >
              <span className="text-sm font-semibold">Total due</span>
              <span className="text-lg font-extrabold tabular-nums">
                {formatMoney(invoice.totalCents, invoice.currency)}
              </span>
            </div>
          </div>
        </div>

        {/* Notes */}
        {invoice.notes && (
          <div className="mt-9 border-t border-zinc-200 pt-5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
              Notes
            </p>
            <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-zinc-600">
              {invoice.notes}
            </p>
          </div>
        )}

        {/* Footer */}
        <div className="mt-10 border-t border-zinc-200 pt-5 text-center">
          <p className="text-sm font-medium text-zinc-700">
            Thank you for your business.
          </p>
          <p className="mt-1 text-xs text-zinc-400">
            {ISSUER.name} · {ISSUER.website}
          </p>
          <p className="mt-2 text-[11px] text-zinc-300">
            Issued by {invoice.creatorName}
          </p>
        </div>
      </div>
    </div>
  );
}

function Party({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
        {label}
      </p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-0.5 text-sm">
      <span className="text-zinc-400">{label}</span>
      <span className="font-medium text-zinc-700">{value}</span>
    </div>
  );
}

function TotalRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-1.5 text-zinc-600">
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

// Fixed-color status pill (independent of theme tokens, so it prints correctly).
function statusPillClass(status: InvoiceDTO["status"]): string {
  const base =
    "mt-2 inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold";
  switch (status) {
    case "PAID":
      return `${base} bg-emerald-100 text-emerald-700`;
    case "SENT":
      return `${base} bg-amber-100 text-amber-700`;
    case "CANCELLED":
      return `${base} bg-zinc-200 text-zinc-500 line-through`;
    default:
      return `${base} bg-zinc-100 text-zinc-600`;
  }
}
