"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, Check, Power, Trash2 } from "lucide-react";
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

/** One cell: a person's allocation to a project (percent or fixed), as typed. */
interface CellDraft {
  kind: "PERCENT" | "FIXED";
  value: string; // human percent or major-unit amount
}

/** Per-row editable state, keyed by userId. */
interface RowDraft {
  total: string;
  currency: string;
  cells: Record<string, CellDraft>; // projectId → cell
}

function rowFromUser(u: SalariedUserDTO): RowDraft {
  const cells: Record<string, CellDraft> = {};
  if (u.salary) {
    for (const a of u.salary.allocations) {
      cells[a.projectId] =
        a.percentBps != null
          ? { kind: "PERCENT", value: (a.percentBps / 100).toString() }
          : { kind: "FIXED", value: ((a.amountCents ?? 0) / 100).toString() };
    }
  }
  return {
    total: u.salary ? (u.salary.totalCents / 100).toString() : "",
    currency: u.salary?.currency ?? "PKR",
    cells,
  };
}

// A spreadsheet of every person's salary: rows = people, columns = projects, each
// cell = that person's allocation to that project (percent or fixed). Extra columns
// = "add a project field". Editing is inline; each row saves its whole allocation
// set through the existing /api/user-salaries/create endpoint.
export function UserSalaryGrid({
  rows,
  projects,
  onDelete,
  onCancelDraft,
}: {
  // Each row: the user + whether it's an unsaved draft.
  rows: { user: SalariedUserDTO; isDraft: boolean }[];
  projects: ProjectOption[];
  onDelete: (u: SalariedUserDTO) => void;
  onCancelDraft: (userId: string) => void;
}) {
  const router = useRouter();

  // Project columns = those any row already allocates to, plus client-added ones,
  // in project list order. Seeded from existing allocations so the grid shows them.
  const usedProjectIds = useMemo(() => {
    const set = new Set<string>();
    for (const { user } of rows)
      user.salary?.allocations.forEach((a) => set.add(a.projectId));
    return set;
  }, [rows]);

  const [extraProjects, setExtraProjects] = useState<string[]>([]);
  const columnProjects = useMemo(() => {
    const ids = new Set<string>([...usedProjectIds, ...extraProjects]);
    return projects.filter((p) => ids.has(p.id));
  }, [usedProjectIds, extraProjects, projects]);

  // Per-row drafts keyed by userId. Initialized from the user's saved salary; we
  // re-seed when a row's identity/salary changes (keyed on a signature).
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [rowError, setRowError] = useState<Record<string, string>>({});

  // A stable signature of the saved data; when it changes (after a refresh) we
  // drop stale drafts so the grid reflects what was persisted.
  const savedSig = useMemo(
    () =>
      JSON.stringify(
        rows.map(({ user }) => [
          user.userId,
          user.salary?.totalCents ?? null,
          user.salary?.currency ?? null,
          user.salary?.allocations.map((a) => [
            a.projectId,
            a.percentBps,
            a.amountCents,
          ]) ?? null,
        ]),
      ),
    [rows],
  );
  const [seededSig, setSeededSig] = useState<string | null>(null);
  if (seededSig !== savedSig) {
    const next: Record<string, RowDraft> = {};
    for (const { user } of rows) next[user.userId] = rowFromUser(user);
    setDrafts(next);
    setSeededSig(savedSig);
    setRowError({});
  }

  const [addingColumn, setAddingColumn] = useState(false);
  const [newColumn, setNewColumn] = useState("");

  // Projects available to add as a new column (not already a column).
  const columnIds = new Set(columnProjects.map((p) => p.id));
  const addableProjects = projects.filter((p) => !columnIds.has(p.id));

  function addColumn(projectId: string) {
    setAddingColumn(false);
    setNewColumn("");
    if (projectId && !columnIds.has(projectId)) {
      setExtraProjects((xs) => [...xs, projectId]);
    }
  }

  function patchRow(userId: string, patch: Partial<RowDraft>) {
    setDrafts((d) => ({ ...d, [userId]: { ...d[userId], ...patch } }));
  }
  function patchCell(userId: string, projectId: string, patch: Partial<CellDraft>) {
    setDrafts((d) => {
      const row = d[userId];
      const cell = row.cells[projectId] ?? { kind: "PERCENT", value: "" };
      return {
        ...d,
        [userId]: {
          ...row,
          cells: { ...row.cells, [projectId]: { ...cell, ...patch } },
        },
      };
    });
  }

  // ── Per-row computed values ──
  function rowTotalCents(r: RowDraft): number {
    return Math.round((Number(r.total) || 0) * 100);
  }
  function resolvedCell(r: RowDraft, projectId: string): number {
    const cell = r.cells[projectId];
    if (!cell || !cell.value.trim()) return 0;
    const v = Number(cell.value) || 0;
    if (cell.kind === "PERCENT") {
      return resolveAllocation(
        { percentBps: percentToBpsClamped(v), amountCents: null },
        rowTotalCents(r),
      );
    }
    return Math.round(v * 100);
  }
  function allocatedCents(r: RowDraft): number {
    return columnProjects.reduce((s, p) => s + resolvedCell(r, p.id), 0);
  }

  function isDirty(u: SalariedUserDTO, isDraft: boolean): boolean {
    if (isDraft) return true;
    const r = drafts[u.userId];
    const seed = rowFromUser(u);
    return JSON.stringify(r) !== JSON.stringify(seed);
  }

  async function saveRow(u: SalariedUserDTO) {
    if (saving) return;
    const r = drafts[u.userId];
    const total = Number(r.total) || 0;
    setRowError((e) => ({ ...e, [u.userId]: "" }));
    setSaving(u.userId);
    const res = await fetch("/api/user-salaries/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: u.userId,
        total,
        currency: r.currency,
        allocations: columnProjects
          .filter((p) => {
            const c = r.cells[p.id];
            return c && Number(c.value) > 0;
          })
          .map((p) => ({
            projectId: p.id,
            kind: r.cells[p.id].kind,
            value: Number(r.cells[p.id].value) || 0,
          })),
      }),
    });
    setSaving(null);
    if (res.ok) {
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setRowError((e) => ({ ...e, [u.userId]: data.error || "Could not save." }));
    }
  }

  async function toggleActive(u: SalariedUserDTO) {
    if (!u.salary || busy) return;
    setBusy(u.userId);
    const res = await fetch(`/api/user-salaries/${u.salary.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !u.salary.active }),
    });
    if (res.ok) router.refresh();
    setBusy(null);
  }

  const colSpan = columnProjects.length + 4;

  return (
    <div className="overflow-x-auto rounded-xl border border-line">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-surface-2 text-left text-xs uppercase tracking-wide text-ink-500">
            <th className="border border-line px-3 py-2 font-medium">Person</th>
            <th className="border border-line px-3 py-2 text-right font-medium">
              Monthly
            </th>
            {columnProjects.map((p) => (
              <th
                key={p.id}
                className="border border-line px-3 py-2 text-right font-medium"
                title={p.name}
              >
                {p.name}
              </th>
            ))}
            <th className="border border-line px-3 py-2 text-right font-medium">
              Left
            </th>
            <th className="border border-line px-2 py-2 font-medium">
              {addingColumn ? (
                <select
                  autoFocus
                  value=""
                  onChange={(e) => addColumn(e.target.value)}
                  onBlur={() => setAddingColumn(false)}
                  className="h-7 rounded border border-accent/40 bg-surface px-1 text-xs outline-none"
                >
                  <option value="">Pick project…</option>
                  {addableProjects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              ) : (
                <button
                  type="button"
                  onClick={() => setAddingColumn(true)}
                  disabled={addableProjects.length === 0}
                  title="Add a project column"
                  className="inline-flex items-center gap-1 text-accent hover:text-accent-ink disabled:opacity-40"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Project
                </button>
              )}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ user: u, isDraft }) => {
            const r = drafts[u.userId];
            if (!r) return null;
            const totalCents = rowTotalCents(r);
            const left = totalCents - allocatedCents(r);
            const dirty = isDirty(u, isDraft);
            const cur = r.currency;
            return (
              <tr key={u.userId} className="hover:bg-surface-2">
                {/* Person */}
                <td className="border border-line px-3 py-2 align-top">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium text-ink">{u.userName}</span>
                    {u.userTitle && (
                      <span className="text-[11px] text-ink-400">
                        {u.userTitle}
                      </span>
                    )}
                    {u.salary && (
                      <Badge variant={u.salary.active ? "emerald" : "neutral"}>
                        {u.salary.active ? "Active" : "Inactive"}
                      </Badge>
                    )}
                    {isDraft && <Badge variant="amber">New</Badge>}
                  </div>
                  {rowError[u.userId] && (
                    <div className="mt-1 text-[11px] text-danger-ink">
                      {rowError[u.userId]}
                    </div>
                  )}
                </td>

                {/* Monthly total + currency */}
                <td className="border border-line p-0 align-top">
                  <div className="flex items-center justify-end gap-1 px-2 py-1.5">
                    <select
                      value={cur}
                      onChange={(e) =>
                        patchRow(u.userId, { currency: e.target.value })
                      }
                      className="h-7 rounded border border-line bg-surface px-1 text-xs outline-none"
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
                      value={r.total}
                      onChange={(e) =>
                        patchRow(u.userId, { total: e.target.value })
                      }
                      placeholder="0.00"
                      className="h-7 w-24 rounded border border-line bg-surface px-2 text-right outline-none"
                    />
                  </div>
                </td>

                {/* Allocation cells */}
                {columnProjects.map((p) => {
                  const cell = r.cells[p.id];
                  const resolved = resolvedCell(r, p.id);
                  return (
                    <td key={p.id} className="border border-line p-0 align-top">
                      <div className="flex items-center justify-end gap-1 px-2 py-1.5">
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={cell?.value ?? ""}
                          onChange={(e) =>
                            patchCell(u.userId, p.id, { value: e.target.value })
                          }
                          placeholder="—"
                          className="h-7 w-16 rounded border border-line bg-surface px-1.5 text-right outline-none"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            patchCell(u.userId, p.id, {
                              kind:
                                (cell?.kind ?? "PERCENT") === "PERCENT"
                                  ? "FIXED"
                                  : "PERCENT",
                            })
                          }
                          title="Toggle percent / fixed"
                          className="w-8 shrink-0 rounded px-1 text-xs text-ink-500 hover:text-accent-ink"
                        >
                          {(cell?.kind ?? "PERCENT") === "PERCENT" ? "%" : cur}
                        </button>
                      </div>
                      {cell?.value?.trim() && (
                        <div className="px-2 pb-1 text-right text-[10px] tabular-nums text-ink-400">
                          {formatMoney(resolved, cur)}
                        </div>
                      )}
                    </td>
                  );
                })}

                {/* Left (unallocated) */}
                <td className="border border-line px-3 py-2 text-right align-top tabular-nums">
                  {totalCents <= 0 ? (
                    <span className="text-ink-300">—</span>
                  ) : left === 0 ? (
                    <span className="text-emerald-600">0</span>
                  ) : left > 0 ? (
                    <span className="text-ink-500">
                      {formatMoney(left, cur)}
                    </span>
                  ) : (
                    <span className="text-danger-ink">
                      −{formatMoney(-left, cur)}
                    </span>
                  )}
                </td>

                {/* Actions */}
                <td className="border border-line px-2 py-2 align-top">
                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => saveRow(u)}
                      disabled={!dirty || saving === u.userId || totalCents <= 0}
                      title="Save"
                      className="grid h-7 w-7 place-items-center rounded border border-line text-accent hover:bg-accent-soft disabled:opacity-40"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                    {u.salary ? (
                      <>
                        <button
                          type="button"
                          onClick={() => toggleActive(u)}
                          disabled={busy === u.userId}
                          title={u.salary.active ? "Deactivate" : "Activate"}
                          aria-label={u.salary.active ? "Deactivate" : "Activate"}
                          className="grid h-7 w-7 place-items-center rounded border border-line text-ink-500 hover:bg-accent-soft hover:text-accent-ink disabled:opacity-40"
                        >
                          <Power className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDelete(u)}
                          title="Remove salary"
                          aria-label="Remove salary"
                          className="grid h-7 w-7 place-items-center rounded border border-line text-ink-500 hover:bg-danger-soft hover:text-danger-ink"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onCancelDraft(u.userId)}
                        title="Cancel"
                        aria-label="Cancel"
                        className="grid h-7 w-7 place-items-center rounded border border-line text-ink-500 hover:bg-danger-soft hover:text-danger-ink"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr>
              <td
                colSpan={colSpan}
                className="border border-line px-3 py-6 text-center text-sm text-ink-400"
              >
                No salaries yet — use “Add a person” above to start.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
