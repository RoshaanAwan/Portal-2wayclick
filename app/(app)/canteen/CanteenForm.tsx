"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { SlipField } from "@/components/finance/SlipField";
import { CURRENCIES, type CanteenExpenseDTO, type SlipMeta } from "@/lib/finance";

/** yyyy-mm-dd for <input type="date"> from an ISO string. */
function dateInput(iso: string | null): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

// Shared create/edit form. When `expense` is provided it edits via PATCH;
// otherwise it creates via POST. The slip is REQUIRED.
export function CanteenForm({
  expense,
  onDone,
}: {
  expense?: CanteenExpenseDTO;
  onDone: () => void;
}) {
  const router = useRouter();
  const editing = !!expense;

  const [vendor, setVendor] = useState(expense?.vendor ?? "");
  const [amount, setAmount] = useState(
    expense ? (expense.amountCents / 100).toString() : "",
  );
  const [currency, setCurrency] = useState(expense?.currency ?? "PKR");
  const [headcount, setHeadcount] = useState(
    expense ? String(expense.headcount) : "1",
  );
  const [mealDate, setMealDate] = useState(dateInput(expense?.mealDate ?? null));
  const [notes, setNotes] = useState(expense?.notes ?? "");
  const [slip, setSlip] = useState<SlipMeta | null>(
    expense
      ? { url: expense.slipUrl, name: expense.slipName, sizeKb: expense.slipSizeKb }
      : null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const canSubmit =
    vendor.trim().length >= 1 &&
    Number(amount) > 0 &&
    Number(headcount) >= 1 &&
    !!slip;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    if (!slip) {
      setError("A receipt slip is required for canteen expenses.");
      return;
    }
    if (!canSubmit) return;
    setLoading(true);
    setError("");

    const payload = {
      vendor: vendor.trim(),
      amount: Number(amount),
      currency,
      headcount: Math.floor(Number(headcount)),
      mealDate: mealDate || undefined,
      notes: notes.trim() || undefined,
      slip,
    };

    const url = editing ? `/api/canteen/${expense!.id}` : "/api/canteen/create";
    const res = await fetch(url, {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      onDone();
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Could not save the canteen expense.");
      setLoading(false);
    }
  }

  return (
    <GlassCard strong glow hover={false} className="p-5">
      <form onSubmit={submit} className="space-y-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-ink-500">
              Vendor / canteen
            </label>
            <input
              autoFocus
              value={vendor}
              onChange={(e) => setVendor(e.target.value)}
              maxLength={200}
              required
              placeholder="e.g. Office Canteen, Cafe Rio"
              className="input"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-ink-500">
              Meal date
            </label>
            <input
              type="date"
              value={mealDate}
              onChange={(e) => setMealDate(e.target.value)}
              className="input"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-ink-500">
              Amount
            </label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              placeholder="0.00"
              className="input text-right"
            />
          </div>
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
              Headcount
            </label>
            <input
              type="number"
              min={1}
              step={1}
              value={headcount}
              onChange={(e) => setHeadcount(e.target.value)}
              className="input text-center"
            />
          </div>
        </div>

        <SlipField value={slip} onChange={setSlip} required />

        <div>
          <label className="mb-1.5 block text-xs font-medium text-ink-500">
            Notes{" "}
            <span className="font-normal text-ink-400">(optional)</span>
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={1000}
            rows={2}
            placeholder="Occasion, team, etc."
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
            {editing ? "Save changes" : "Submit canteen expense"}
          </Button>
        </div>
      </form>
    </GlassCard>
  );
}
