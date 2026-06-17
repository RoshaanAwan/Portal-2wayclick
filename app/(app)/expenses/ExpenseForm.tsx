"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { SlipField } from "@/components/finance/SlipField";
import {
  CURRENCIES,
  EXPENSE_CATEGORIES,
  type ExpenseDTO,
  type SlipMeta,
} from "@/lib/finance";

interface ProjectOption {
  id: string;
  name: string;
}

/** yyyy-mm-dd for <input type="date"> from an ISO string. */
function dateInput(iso: string | null): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

// Shared create/edit form. When `expense` is provided it edits via PATCH;
// otherwise it creates via POST. `onDone` dismisses the form.
export function ExpenseForm({
  expense,
  projects,
  onDone,
}: {
  expense?: ExpenseDTO;
  projects: ProjectOption[];
  onDone: () => void;
}) {
  const router = useRouter();
  const editing = !!expense;

  const [title, setTitle] = useState(expense?.title ?? "");
  const [category, setCategory] = useState(expense?.category ?? "Travel");
  const [amount, setAmount] = useState(
    expense ? (expense.amountCents / 100).toString() : "",
  );
  const [currency, setCurrency] = useState(expense?.currency ?? "PKR");
  const [projectId, setProjectId] = useState(expense?.projectId ?? "");
  const [spentOn, setSpentOn] = useState(dateInput(expense?.spentOn ?? null));
  const [notes, setNotes] = useState(expense?.notes ?? "");
  const [slip, setSlip] = useState<SlipMeta | null>(
    expense?.slipUrl
      ? {
          url: expense.slipUrl,
          name: expense.slipName ?? "receipt",
          sizeKb: expense.slipSizeKb ?? 0,
        }
      : null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const canSubmit = title.trim().length >= 1 && Number(amount) > 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || loading) return;
    setLoading(true);
    setError("");

    const payload = {
      title: title.trim(),
      category,
      amount: Number(amount),
      currency,
      projectId: projectId || undefined,
      notes: notes.trim() || undefined,
      spentOn: spentOn || undefined,
      slip,
    };

    const url = editing ? `/api/expenses/${expense!.id}` : "/api/expenses/create";
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
      setError(data.error || "Could not save the expense.");
      setLoading(false);
    }
  }

  return (
    <GlassCard strong glow hover={false} className="p-5">
      <form onSubmit={submit} className="space-y-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-ink-500">
              Title
            </label>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              required
              placeholder="e.g. Client lunch, taxi to airport"
              className="input"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-ink-500">
              Category
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="input"
            >
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
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
              Date
            </label>
            <input
              type="date"
              value={spentOn}
              onChange={(e) => setSpentOn(e.target.value)}
              className="input"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-ink-500">
              Project{" "}
              <span className="font-normal text-ink-400">(optional)</span>
            </label>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="input"
            >
              <option value="">— None —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <SlipField value={slip} onChange={setSlip} />

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
            placeholder="What was this for?"
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
            {editing ? "Save changes" : "Submit expense"}
          </Button>
        </div>
      </form>
    </GlassCard>
  );
}
