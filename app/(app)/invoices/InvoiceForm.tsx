"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Trash2 } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import {
  CURRENCIES,
  computeTotals,
  formatMoney,
  toCents,
  type InvoiceDTO,
} from "@/lib/invoices";

// A single editable line in the form. Prices are kept as the raw string the
// user typed (major units, e.g. "12.50") and only converted to cents on submit
// and for the live total — so an in-progress "12." doesn't get mangled.
interface DraftLine {
  key: string;
  description: string;
  quantity: string;
  unitPrice: string;
}

let keySeq = 0;
function blankLine(): DraftLine {
  return { key: `l${keySeq++}`, description: "", quantity: "1", unitPrice: "" };
}

function linesFromInvoice(inv: InvoiceDTO): DraftLine[] {
  return inv.items.map((it) => ({
    key: `l${keySeq++}`,
    description: it.description,
    quantity: String(it.quantity),
    unitPrice: (it.unitPriceCents / 100).toString(),
  }));
}

/** yyyy-mm-dd for <input type="date"> from an ISO string. */
function dateInput(iso: string | null): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

// Shared create/edit form. When `invoice` is provided it edits via PATCH;
// otherwise it creates via POST. `onDone` is called to dismiss the form.
export function InvoiceForm({
  invoice,
  onDone,
}: {
  invoice?: InvoiceDTO;
  onDone: () => void;
}) {
  const router = useRouter();
  const editing = !!invoice;

  const [clientName, setClientName] = useState(invoice?.clientName ?? "");
  const [clientEmail, setClientEmail] = useState(invoice?.clientEmail ?? "");
  const [clientAddress, setClientAddress] = useState(
    invoice?.clientAddress ?? "",
  );
  const [currency, setCurrency] = useState(invoice?.currency ?? "USD");
  const [taxPercent, setTaxPercent] = useState(
    invoice ? (invoice.taxRateBps / 100).toString() : "0",
  );
  const [issueDate, setIssueDate] = useState(
    dateInput(invoice?.issueDate ?? null),
  );
  const [dueDate, setDueDate] = useState(dateInput(invoice?.dueDate ?? null));
  const [notes, setNotes] = useState(invoice?.notes ?? "");
  const [lines, setLines] = useState<DraftLine[]>(
    invoice ? linesFromInvoice(invoice) : [blankLine()],
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function updateLine(key: string, patch: Partial<DraftLine>) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }
  function addLine() {
    setLines((ls) => [...ls, blankLine()]);
  }
  function removeLine(key: string) {
    setLines((ls) => (ls.length === 1 ? ls : ls.filter((l) => l.key !== key)));
  }

  // Live totals from the current draft (ignores blank/invalid rows for preview).
  const totals = useMemo(() => {
    const parsed = lines.map((l) => ({
      description: l.description.trim(),
      quantity: Math.max(0, Math.floor(Number(l.quantity) || 0)),
      unitPriceCents: toCents(Number(l.unitPrice) || 0),
    }));
    const taxBps = Math.round((Number(taxPercent) || 0) * 100);
    return computeTotals(parsed, taxBps);
  }, [lines, taxPercent]);

  const validLines = lines.filter(
    (l) => l.description.trim() && Number(l.quantity) >= 1,
  );
  const canSubmit = clientName.trim().length >= 1 && validLines.length >= 1;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || loading) return;
    setLoading(true);
    setError("");

    const payload = {
      clientName: clientName.trim(),
      clientEmail: clientEmail.trim() || undefined,
      clientAddress: clientAddress.trim() || undefined,
      notes: notes.trim() || undefined,
      currency,
      taxRateBps: Math.round((Number(taxPercent) || 0) * 100),
      issueDate: issueDate || undefined,
      dueDate: dueDate || undefined,
      items: validLines.map((l) => ({
        description: l.description.trim(),
        quantity: Math.floor(Number(l.quantity)),
        unitPriceCents: toCents(Number(l.unitPrice) || 0),
      })),
    };

    const url = editing ? `/api/invoices/${invoice!.id}` : "/api/invoices/create";
    const res = await fetch(url, {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      onDone();
      router.refresh();
      if (!editing && data.id) router.push(`/invoices/${data.id}`);
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Could not save the invoice.");
      setLoading(false);
    }
  }

  return (
    <GlassCard strong glow hover={false} className="p-5">
      <form onSubmit={submit} className="space-y-5">
        {/* Client */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-ink-500">
              Client name
            </label>
            <input
              autoFocus
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              maxLength={160}
              required
              placeholder="e.g. Acme Corp"
              className="input"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-ink-500">
              Client email{" "}
              <span className="font-normal text-ink-400">(optional)</span>
            </label>
            <input
              type="email"
              value={clientEmail}
              onChange={(e) => setClientEmail(e.target.value)}
              maxLength={200}
              placeholder="billing@acme.com"
              className="input"
            />
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-ink-500">
            Billing address{" "}
            <span className="font-normal text-ink-400">(optional)</span>
          </label>
          <textarea
            value={clientAddress}
            onChange={(e) => setClientAddress(e.target.value)}
            maxLength={500}
            rows={2}
            placeholder="123 Main St, Springfield…"
            className="input resize-y leading-relaxed"
          />
        </div>

        {/* Meta: currency, tax, dates */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-ink-500">
              Currency
            </label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="input"
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-ink-500">
              Tax %
            </label>
            <input
              type="number"
              min={0}
              max={100}
              step="0.01"
              value={taxPercent}
              onChange={(e) => setTaxPercent(e.target.value)}
              className="input"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-ink-500">
              Issue date
            </label>
            <input
              type="date"
              value={issueDate}
              onChange={(e) => setIssueDate(e.target.value)}
              className="input"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-ink-500">
              Due date
            </label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="input"
            />
          </div>
        </div>

        {/* Line items */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-xs font-medium text-ink-500">
              Line items
            </label>
            <Button type="button" size="sm" variant="glass" onClick={addLine}>
              <Plus className="h-3.5 w-3.5" />
              Add line
            </Button>
          </div>

          <div className="space-y-2">
            {lines.map((l) => {
              const qty = Math.max(0, Math.floor(Number(l.quantity) || 0));
              const amount = toCents(Number(l.unitPrice) || 0) * qty;
              return (
                <div
                  key={l.key}
                  className="flex items-start gap-2 rounded-xl border border-line bg-surface-2 p-2.5"
                >
                  <input
                    value={l.description}
                    onChange={(e) =>
                      updateLine(l.key, { description: e.target.value })
                    }
                    maxLength={300}
                    placeholder="Description of work or item"
                    className="input min-w-0 flex-1"
                  />
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={l.quantity}
                    onChange={(e) =>
                      updateLine(l.key, { quantity: e.target.value })
                    }
                    aria-label="Quantity"
                    placeholder="Qty"
                    className="input w-16 shrink-0 text-center"
                  />
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={l.unitPrice}
                    onChange={(e) =>
                      updateLine(l.key, { unitPrice: e.target.value })
                    }
                    aria-label="Unit price"
                    placeholder="Price"
                    className="input w-24 shrink-0 text-right"
                  />
                  <div className="grid h-9 w-24 shrink-0 place-items-end px-1 text-right text-sm tabular-nums text-ink-700">
                    {formatMoney(amount, currency)}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeLine(l.key)}
                    disabled={lines.length === 1}
                    aria-label="Remove line"
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line bg-surface text-ink-400 transition-colors hover:border-danger/40 hover:bg-danger-soft hover:text-danger-ink disabled:opacity-40 disabled:hover:border-line disabled:hover:bg-surface disabled:hover:text-ink-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Totals preview */}
        <div className="ml-auto w-full max-w-xs space-y-1.5 rounded-xl border border-line bg-surface-2 p-3.5 text-sm">
          <div className="flex justify-between text-ink-500">
            <span>Subtotal</span>
            <span className="tabular-nums">
              {formatMoney(totals.subtotalCents, currency)}
            </span>
          </div>
          <div className="flex justify-between text-ink-500">
            <span>Tax ({Number(taxPercent) || 0}%)</span>
            <span className="tabular-nums">
              {formatMoney(totals.taxCents, currency)}
            </span>
          </div>
          <div className="flex justify-between border-t border-line pt-1.5 text-base font-semibold text-ink">
            <span>Total</span>
            <span className="tabular-nums">
              {formatMoney(totals.totalCents, currency)}
            </span>
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-ink-500">
            Notes{" "}
            <span className="font-normal text-ink-400">
              (optional — shown on the invoice)
            </span>
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={1000}
            rows={2}
            placeholder="Payment terms, thank-you note…"
            className="input resize-y leading-relaxed"
          />
        </div>

        <AnimatePresence>
          {error && (
            <motion.p
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              className="text-sm text-danger-ink"
            >
              {error}
            </motion.p>
          )}
        </AnimatePresence>

        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" size="sm" loading={loading} disabled={!canSubmit}>
            {editing ? "Save changes" : "Create invoice"}
          </Button>
        </div>
      </form>
    </GlassCard>
  );
}
