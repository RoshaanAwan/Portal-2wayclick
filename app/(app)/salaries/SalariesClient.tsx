"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  Banknote,
  Trash2,
  Pencil,
  FolderKanban,
  Power,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { formatMoney, type ProjectSalaryDTO } from "@/lib/finance";
import { SalaryForm } from "./SalaryForm";

interface ProjectOption {
  id: string;
  name: string;
}
interface EmployeeOption {
  id: string;
  name: string;
  title: string;
}

interface ProjectGroup {
  projectId: string;
  projectName: string;
  rows: ProjectSalaryDTO[];
  // Active monthly cost, per currency (salaries can be in mixed currencies).
  totals: Record<string, number>;
}

export function SalariesClient({
  salaries,
  projects,
  employees,
}: {
  salaries: ProjectSalaryDTO[];
  projects: ProjectOption[];
  employees: EmployeeOption[];
}) {
  const router = useRouter();
  const [composing, setComposing] = useState(false);
  const [editing, setEditing] = useState<ProjectSalaryDTO | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProjectSalaryDTO | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Group salary rows by project, summing each project's active monthly cost.
  const groups = useMemo<ProjectGroup[]>(() => {
    const map = new Map<string, ProjectGroup>();
    for (const s of salaries) {
      let g = map.get(s.projectId);
      if (!g) {
        g = {
          projectId: s.projectId,
          projectName: s.projectName,
          rows: [],
          totals: {},
        };
        map.set(s.projectId, g);
      }
      g.rows.push(s);
      if (s.active) {
        g.totals[s.currency] = (g.totals[s.currency] ?? 0) + s.amountCents;
      }
    }
    return [...map.values()];
  }, [salaries]);

  async function toggleActive(s: ProjectSalaryDTO) {
    if (busyId) return;
    setBusyId(s.id);
    const res = await fetch(`/api/salaries/${s.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !s.active }),
    });
    if (res.ok) router.refresh();
    setBusyId(null);
  }

  async function confirmDelete() {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    const res = await fetch(`/api/salaries/${deleteTarget.id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setDeleteTarget(null);
      router.refresh();
    }
    setDeleting(false);
  }

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-ink-400">
          {salaries.length} {salaries.length === 1 ? "salary" : "salaries"} across{" "}
          {groups.length} {groups.length === 1 ? "project" : "projects"}
        </span>
        {!composing && !editing && (
          <Button size="sm" onClick={() => setComposing(true)}>
            <Plus className="h-4 w-4" />
            Add salary
          </Button>
        )}
      </div>

      <AnimatePresence>
        {(composing || editing) && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-6 overflow-hidden"
          >
            <SalaryForm
              salary={editing ?? undefined}
              projects={projects}
              employees={employees}
              onDone={() => {
                setComposing(false);
                setEditing(null);
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {groups.length === 0 ? (
        <EmptyState
          icon={Banknote}
          title="No salaries set"
          description="Add an employee's monthly salary on a project to start tracking payroll cost."
        />
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <div
              key={g.projectId}
              className="overflow-hidden rounded-2xl border border-line"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface-2 px-4 py-3">
                <span className="inline-flex items-center gap-2 font-medium text-ink">
                  <FolderKanban className="h-4 w-4 text-accent" />
                  {g.projectName}
                </span>
                <span className="text-xs text-ink-500">
                  Monthly cost:{" "}
                  <span className="font-medium tabular-nums text-ink-700">
                    {Object.keys(g.totals).length === 0
                      ? "—"
                      : Object.entries(g.totals)
                          .map(([cur, cents]) => formatMoney(cents, cur))
                          .join(" · ")}
                  </span>
                </span>
              </div>
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-ink-400">
                  <tr>
                    <th className="px-4 py-2.5">Employee</th>
                    <th className="px-4 py-2.5 text-right">Monthly salary</th>
                    <th className="px-4 py-2.5">Status</th>
                    <th className="px-4 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {g.rows.map((s) => {
                    const busy = busyId === s.id;
                    return (
                      <tr key={s.id} className="hover:bg-surface-2">
                        <td className="px-4 py-3">
                          <div className="font-medium text-ink">{s.userName}</div>
                          {s.userTitle && (
                            <div className="text-[11px] text-ink-400">
                              {s.userTitle}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-medium tabular-nums text-ink">
                          {formatMoney(s.amountCents, s.currency)}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={s.active ? "emerald" : "neutral"}>
                            {s.active ? "Active" : "Inactive"}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => toggleActive(s)}
                              disabled={busy}
                              aria-label={s.active ? "Deactivate" : "Activate"}
                              title={s.active ? "Deactivate" : "Activate"}
                              className="grid h-7 w-7 place-items-center rounded-lg border border-line bg-surface-2 text-ink-500 transition-colors hover:border-accent/40 hover:bg-accent-soft hover:text-accent-ink disabled:opacity-40"
                            >
                              <Power className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setComposing(false);
                                setEditing(s);
                              }}
                              aria-label="Edit"
                              title="Edit"
                              className="grid h-7 w-7 place-items-center rounded-lg border border-line bg-surface-2 text-ink-500 transition-colors hover:border-accent/40 hover:bg-accent-soft hover:text-accent-ink"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(s)}
                              aria-label="Delete"
                              title="Delete"
                              className="grid h-7 w-7 place-items-center rounded-lg border border-line bg-surface-2 text-ink-500 transition-colors hover:border-danger/40 hover:bg-danger-soft hover:text-danger-ink"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Remove salary"
        message={
          <>
            Remove <strong>{deleteTarget?.userName}</strong>’s salary on{" "}
            {deleteTarget?.projectName}? This permanently deletes the record. This
            can’t be undone.
          </>
        }
        confirmLabel="Remove"
        loading={deleting}
        onConfirm={confirmDelete}
        onClose={() => !deleting && setDeleteTarget(null)}
      />
    </>
  );
}
