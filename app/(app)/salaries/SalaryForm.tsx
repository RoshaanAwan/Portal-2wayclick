"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { CURRENCIES, type ProjectSalaryDTO } from "@/lib/finance";

interface ProjectOption {
  id: string;
  name: string;
}
interface EmployeeOption {
  id: string;
  name: string;
  title: string;
}

/** yyyy-mm-dd for <input type="date"> from an ISO string. */
function dateInput(iso: string | null): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

// Create/edit a per-project salary. Editing prefills and locks the project +
// employee (the create endpoint upserts on that pair, so re-saving the same pair
// updates the amount). For a brand-new entry both pickers are editable.
export function SalaryForm({
  salary,
  projects,
  employees,
  onDone,
}: {
  salary?: ProjectSalaryDTO;
  projects: ProjectOption[];
  employees: EmployeeOption[];
  onDone: () => void;
}) {
  const router = useRouter();
  const editing = !!salary;

  const [projectId, setProjectId] = useState(salary?.projectId ?? "");
  const [userId, setUserId] = useState(salary?.userId ?? "");
  const [amount, setAmount] = useState(
    salary ? (salary.amountCents / 100).toString() : "",
  );
  const [currency, setCurrency] = useState(salary?.currency ?? "PKR");
  const [effectiveFrom, setEffectiveFrom] = useState(
    dateInput(salary?.effectiveFrom ?? null),
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const canSubmit = !!projectId && !!userId && Number(amount) > 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || loading) return;
    setLoading(true);
    setError("");

    // Both create and edit hit the upsert endpoint (keyed on project+employee).
    const res = await fetch("/api/salaries/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
        userId,
        amount: Number(amount),
        currency,
        effectiveFrom: effectiveFrom || undefined,
      }),
    });

    if (res.ok) {
      onDone();
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Could not save the salary.");
      setLoading(false);
    }
  }

  return (
    <GlassCard strong glow hover={false} className="p-5">
      <form onSubmit={submit} className="space-y-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-ink-500">
              Project
            </label>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              disabled={editing}
              required
              className="input disabled:opacity-60"
            >
              <option value="">— Select project —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-ink-500">
              Employee
            </label>
            <select
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              disabled={editing}
              required
              className="input disabled:opacity-60"
            >
              <option value="">— Select employee —</option>
              {employees.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                  {u.title ? ` — ${u.title}` : ""}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-ink-500">
              Monthly salary
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
              Effective from
            </label>
            <input
              type="date"
              value={effectiveFrom}
              onChange={(e) => setEffectiveFrom(e.target.value)}
              className="input"
            />
          </div>
        </div>

        {editing && (
          <p className="text-xs text-ink-400">
            Editing updates this person’s salary on this project.
          </p>
        )}

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
            {editing ? "Save changes" : "Add salary"}
          </Button>
        </div>
      </form>
    </GlassCard>
  );
}
