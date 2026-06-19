"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  X,
  Check,
  Power,
  Trash2,
  Scale,
  Wand2,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import {
  formatMoney,
  percentToBpsClamped,
  resolveAllocation,
  CURRENCIES,
  type SalariedUserDTO,
} from "@/lib/userSalary";

interface ProjectOption {
  id: string;
  name: string;
}

/** A draft allocation line in the editor. */
interface AllocDraft {
  projectId: string;
  kind: "PERCENT" | "FIXED";
  value: string; // human percent or major-unit amount, as typed
}

function initialAllocs(user: SalariedUserDTO): AllocDraft[] {
  if (!user.salary) return [];
  return user.salary.allocations.map((a) => ({
    projectId: a.projectId,
    kind: a.percentBps != null ? "PERCENT" : "FIXED",
    value:
      a.percentBps != null
        ? (a.percentBps / 100).toString()
        : ((a.amountCents ?? 0) / 100).toString(),
  }));
}

export function UserSalaryRow({
  user,
  projects,
  isDraft,
  onDelete,
  onCancelDraft,
}: {
  user: SalariedUserDTO;
  projects: ProjectOption[];
  // A not-yet-saved row added via the picker (no salary record yet).
  isDraft: boolean;
  onDelete: () => void;
  onCancelDraft: () => void;
}) {
  const router = useRouter();
  const salary = user.salary;

  const [total, setTotal] = useState(
    salary ? (salary.totalCents / 100).toString() : "",
  );
  const [currency, setCurrency] = useState(salary?.currency ?? "PKR");
  const [allocs, setAllocs] = useState<AllocDraft[]>(() => initialAllocs(user));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const totalCents = Math.round((Number(total) || 0) * 100);

  function resolved(a: AllocDraft): number {
    const v = Number(a.value) || 0;
    if (a.kind === "PERCENT") {
      return resolveAllocation(
        { percentBps: percentToBpsClamped(v), amountCents: null },
        totalCents,
      );
    }
    return Math.round(v * 100);
  }
  const allocatedCents = allocs.reduce((sum, a) => sum + resolved(a), 0);
  const unallocatedCents = totalCents - allocatedCents;

  const projectName = (id: string) =>
    projects.find((p) => p.id === id)?.name ?? "—";

  const usedProjectIds = new Set(allocs.map((a) => a.projectId));
  const availableProjects = projects.filter((p) => !usedProjectIds.has(p.id));

  function addLine() {
    if (availableProjects.length === 0) return;
    setAllocs((xs) => {
      const next: AllocDraft[] = [
        ...xs,
        { projectId: availableProjects[0].id, kind: "PERCENT", value: "" },
      ];
      // Split-evenly by default: only when EVERY line is a percent that's still
      // blank or whose values currently sum to ~100 (i.e. you haven't switched to
      // fixed amounts or set custom numbers). This makes "add 2nd project → 50/50"
      // automatic without ever overwriting amounts you typed on purpose.
      const allPercent = next.every((a) => a.kind === "PERCENT");
      const sumPrev = xs.reduce((s, a) => s + (Number(a.value) || 0), 0);
      const untouched = xs.every((a) => !a.value.trim());
      if (allPercent && (untouched || Math.abs(sumPrev - 100) < 0.5)) {
        const each = Math.floor(10000 / next.length) / 100;
        return next.map((a, i) => ({
          ...a,
          value:
            i === next.length - 1
              ? (100 - each * (next.length - 1)).toFixed(2)
              : each.toFixed(2),
        }));
      }
      return next;
    });
  }
  function setLine(i: number, patch: Partial<AllocDraft>) {
    setAllocs((xs) => xs.map((a, j) => (j === i ? { ...a, ...patch } : a)));
  }
  function removeLine(i: number) {
    setAllocs((xs) => xs.filter((_, j) => j !== i));
  }

  // ── Helpers ──
  // Split evenly: set every line to an equal PERCENT (last absorbs rounding).
  function splitEvenly() {
    if (allocs.length === 0) return;
    const each = Math.floor(10000 / allocs.length) / 100; // 2dp percent
    setAllocs((xs) =>
      xs.map((a, i) => ({
        ...a,
        kind: "PERCENT",
        value:
          i === xs.length - 1
            ? (100 - each * (xs.length - 1)).toFixed(2)
            : each.toFixed(2),
      })),
    );
  }
  // Fill remainder: give the LAST line whatever is unallocated, as a fixed amount.
  function fillRemainder() {
    if (allocs.length === 0 || totalCents <= 0) return;
    const others = allocs
      .slice(0, -1)
      .reduce((sum, a) => sum + resolved(a), 0);
    const rest = Math.max(0, totalCents - others);
    setAllocs((xs) =>
      xs.map((a, i) =>
        i === xs.length - 1
          ? { ...a, kind: "FIXED", value: (rest / 100).toString() }
          : a,
      ),
    );
  }

  async function save() {
    if (saving) return;
    setError(null);
    setSaving(true);
    const res = await fetch("/api/user-salaries/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: user.userId,
        total: Number(total) || 0,
        currency,
        allocations: allocs
          .filter((a) => a.projectId)
          .map((a) => ({
            projectId: a.projectId,
            kind: a.kind,
            value: Number(a.value) || 0,
          })),
      }),
    });
    setSaving(false);
    if (res.ok) {
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Could not save.");
    }
  }

  async function toggleActive() {
    if (!salary || busy) return;
    setBusy(true);
    const res = await fetch(`/api/user-salaries/${salary.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !salary.active }),
    });
    if (res.ok) router.refresh();
    setBusy(false);
  }

  const dirty =
    isDraft ||
    !salary ||
    totalCents !== salary.totalCents ||
    currency !== salary.currency ||
    JSON.stringify(allocs) !== JSON.stringify(initialAllocs(user));

  return (
    <div className="rounded-xl border border-line bg-surface p-3">
      {/* Header: name + total + actions */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-[10rem] flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-ink">{user.userName}</span>
            {user.userTitle && (
              <span className="text-[11px] text-ink-400">{user.userTitle}</span>
            )}
            {salary && (
              <Badge variant={salary.active ? "emerald" : "neutral"}>
                {salary.active ? "Active" : "Inactive"}
              </Badge>
            )}
            {isDraft && <Badge variant="amber">New</Badge>}
          </div>
        </div>

        {/* Total monthly salary */}
        <div className="inline-flex items-center gap-1">
          <span className="text-xs text-ink-400">Monthly</span>
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="h-8 rounded border border-line bg-surface px-1 text-xs outline-none"
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <input
            type="number"
            min={0}
            step="0.01"
            value={total}
            onChange={(e) => setTotal(e.target.value)}
            placeholder="0.00"
            className="h-8 w-28 rounded border border-line bg-surface px-2 text-right outline-none"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={save}
            disabled={!dirty || saving || totalCents <= 0}
            title="Save"
            className="inline-flex h-8 items-center gap-1 rounded border border-line bg-surface px-2.5 text-xs font-medium text-accent hover:bg-accent-soft disabled:opacity-40"
          >
            <Check className="h-3.5 w-3.5" />
            {saving ? "Saving…" : "Save"}
          </button>
          {salary ? (
            <>
              <button
                type="button"
                onClick={toggleActive}
                disabled={busy}
                title={salary.active ? "Deactivate" : "Activate"}
                aria-label={salary.active ? "Deactivate" : "Activate"}
                className="grid h-8 w-8 place-items-center rounded border border-line text-ink-500 hover:bg-accent-soft hover:text-accent-ink disabled:opacity-40"
              >
                <Power className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={onDelete}
                title="Remove salary"
                aria-label="Remove salary"
                className="grid h-8 w-8 place-items-center rounded border border-line text-ink-500 hover:bg-danger-soft hover:text-danger-ink"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onCancelDraft}
              title="Cancel"
              aria-label="Cancel"
              className="grid h-8 w-8 place-items-center rounded border border-line text-ink-500 hover:bg-danger-soft hover:text-danger-ink"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Inline allocation chips */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] uppercase tracking-wide text-ink-400">
          Across:
        </span>
        {allocs.map((a, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-2 px-2 py-1 text-xs"
          >
            <select
              value={a.projectId}
              onChange={(e) => setLine(i, { projectId: e.target.value })}
              className="max-w-[8rem] bg-transparent outline-none"
            >
              {projects
                .filter((p) => p.id === a.projectId || !usedProjectIds.has(p.id))
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
            <input
              type="number"
              min={0}
              step="0.01"
              value={a.value}
              onChange={(e) => setLine(i, { value: e.target.value })}
              placeholder={a.kind === "PERCENT" ? "40" : "0"}
              className="w-14 rounded bg-surface px-1 text-right outline-none"
            />
            <button
              type="button"
              onClick={() =>
                setLine(i, { kind: a.kind === "PERCENT" ? "FIXED" : "PERCENT" })
              }
              title="Toggle percent / fixed"
              className="rounded px-1 text-ink-500 hover:text-accent-ink"
            >
              {a.kind === "PERCENT" ? "%" : currency}
            </button>
            <span className="tabular-nums text-ink-500">
              = {formatMoney(resolved(a), currency)}
            </span>
            <button
              type="button"
              onClick={() => removeLine(i)}
              aria-label={`Remove ${projectName(a.projectId)}`}
              className="text-ink-400 hover:text-danger-ink"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        {availableProjects.length > 0 && (
          <button
            type="button"
            onClick={addLine}
            className="inline-flex items-center gap-0.5 rounded-full border border-dashed border-line px-2 py-1 text-xs text-ink-500 hover:border-accent/40 hover:text-accent-ink"
          >
            <Plus className="h-3 w-3" />
            allocate
          </button>
        )}
      </div>

      {/* Helpers + remainder */}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px]">
        <div className="flex items-center gap-1.5">
          {allocs.length > 1 && (
            <button
              type="button"
              onClick={splitEvenly}
              className="inline-flex items-center gap-1 rounded border border-line px-1.5 py-0.5 text-ink-500 hover:bg-surface-2 hover:text-accent-ink"
            >
              <Scale className="h-3 w-3" />
              Split evenly
            </button>
          )}
          {allocs.length > 0 && unallocatedCents > 0 && totalCents > 0 && (
            <button
              type="button"
              onClick={fillRemainder}
              className="inline-flex items-center gap-1 rounded border border-line px-1.5 py-0.5 text-ink-500 hover:bg-surface-2 hover:text-accent-ink"
            >
              <Wand2 className="h-3 w-3" />
              Fill remainder
            </button>
          )}
        </div>
        <div>
          {allocs.length === 0 ? (
            <span className="text-ink-400">No allocations yet</span>
          ) : unallocatedCents === 0 ? (
            <span className="text-emerald-600">Fully allocated</span>
          ) : unallocatedCents > 0 ? (
            <span className="text-ink-400">
              {formatMoney(unallocatedCents, currency)} unallocated
            </span>
          ) : (
            <span className="text-danger-ink">
              Over by {formatMoney(-unallocatedCents, currency)}
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-1 text-[11px] text-danger-ink">{error}</div>
      )}
    </div>
  );
}
