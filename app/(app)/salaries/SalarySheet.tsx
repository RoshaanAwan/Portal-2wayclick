"use client";

import { Fragment, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  Check,
  X,
  Power,
  Trash2,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { GlassCard } from "@/components/ui/GlassCard";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  formatMoney,
  salaryTotalCents,
  CURRENCIES,
  type ProjectSalaryDTO,
} from "@/lib/finance";

interface ProjectOption {
  id: string;
  name: string;
}
interface EmployeeOption {
  id: string;
  name: string;
  title: string;
}

// A simple salary spreadsheet: one row per (project, employee) with a monthly
// salary. Add a row by picking a project + employee and typing an amount; it
// saves through /api/salaries/create as a single "Salary" component. Existing
// rows show their total and let you edit the amount inline.
export function SalarySheet({
  salaries,
  projects,
  employees,
}: {
  salaries: ProjectSalaryDTO[];
  projects: ProjectOption[];
  employees: EmployeeOption[];
}) {
  const router = useRouter();

  // Per-row edited amount (keyed by salary id) while typing, and busy/save flags.
  const [amountDraft, setAmountDraft] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProjectSalaryDTO | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Which row's payment log is expanded, plus the add-payment draft per row.
  const [expanded, setExpanded] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payNote, setPayNote] = useState("");
  const [payBusy, setPayBusy] = useState(false);

  async function addPayment(s: ProjectSalaryDTO) {
    if (payBusy || !(Number(payAmount) > 0)) return;
    setPayBusy(true);
    const res = await fetch(`/api/salaries/${s.id}/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: Number(payAmount),
        note: payNote.trim() || undefined,
      }),
    });
    setPayBusy(false);
    if (res.ok) {
      setPayAmount("");
      setPayNote("");
      router.refresh();
    }
  }

  async function removePayment(s: ProjectSalaryDTO, paymentId: string) {
    if (payBusy) return;
    setPayBusy(true);
    const res = await fetch(`/api/salaries/${s.id}/payments/${paymentId}`, {
      method: "DELETE",
    });
    if (res.ok) router.refresh();
    setPayBusy(false);
  }

  // New-row editor.
  const [newProject, setNewProject] = useState("");
  const [newEmployee, setNewEmployee] = useState("");
  const [newCurrency, setNewCurrency] = useState("PKR");
  const [newAmount, setNewAmount] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");
  // Whether the add-salary row is shown (revealed by the "Add salary" button).
  const [showAdd, setShowAdd] = useState(false);

  const projectName = useMemo(() => {
    const m = new Map(projects.map((p) => [p.id, p.name]));
    return (id: string) => m.get(id) ?? "—";
  }, [projects]);

  // Projects the chosen employee already has a salary on — excluded from the
  // add-row's project picker (one salary per project+employee; re-adding would
  // just overwrite). Only meaningful once an employee is selected.
  const addRowProjects = useMemo(() => {
    if (!newEmployee) return projects;
    const taken = new Set(
      salaries.filter((s) => s.userId === newEmployee).map((s) => s.projectId),
    );
    return projects.filter((p) => !taken.has(p.id));
  }, [projects, salaries, newEmployee]);

  // ── Group salaries by employee for the Excel-style merged Employee cell ──────
  // Sort so each person's salaries are contiguous (by name, then project), and
  // record per-salary: its group key, whether it's the FIRST row of its group,
  // and the group's row count. A real user groups by userId; a free-text name
  // groups by its (lower-cased) name. The grouped order is what we render.
  const { ordered, groupMeta } = useMemo(() => {
    const keyOf = (s: ProjectSalaryDTO) =>
      s.userId ? `u:${s.userId}` : `n:${s.userName.toLowerCase()}`;
    const sorted = [...salaries].sort(
      (a, b) =>
        a.userName.localeCompare(b.userName) ||
        a.projectName.localeCompare(b.projectName),
    );
    // Count salaries per group.
    const counts = new Map<string, number>();
    for (const s of sorted) counts.set(keyOf(s), (counts.get(keyOf(s)) ?? 0) + 1);
    // First-in-group flags.
    const meta = new Map<
      string,
      { key: string; first: boolean; size: number }
    >();
    const seen = new Set<string>();
    for (const s of sorted) {
      const key = keyOf(s);
      const first = !seen.has(key);
      seen.add(key);
      meta.set(s.id, { key, first, size: counts.get(key) ?? 1 });
    }
    return { ordered: sorted, groupMeta: meta };
  }, [salaries]);

  // Save one salary's amount (a single "Salary" component) via upsert.
  async function saveAmount(s: ProjectSalaryDTO) {
    const raw = amountDraft[s.id];
    if (raw == null) return; // not edited
    const amount = Number(raw) || 0;
    if (amount <= 0) return;
    setBusyId(s.id);
    const res = await fetch("/api/salaries/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: s.projectId,
        userId: s.userId ?? undefined,
        userName: s.userId ? undefined : s.userName,
        components: [{ label: "Salary", amount }],
        currency: s.currency,
      }),
    });
    setBusyId(null);
    if (res.ok) {
      setAmountDraft((d) => {
        const next = { ...d };
        delete next[s.id];
        return next;
      });
      router.refresh();
    }
  }

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

  // Open the add-row pre-filled for an existing employee, so you only pick the
  // new project + amount. Projects the employee already has are excluded below.
  function addForEmployee(s: ProjectSalaryDTO) {
    if (!s.userId) return;
    setShowAdd(true);
    setNewEmployee(s.userId);
    setNewCurrency(s.currency);
    setNewProject("");
    setNewAmount("");
    setAddError("");
  }

  async function addRow() {
    setAddError("");
    if (!newProject || !newEmployee || !(Number(newAmount) > 0)) {
      setAddError("Pick a project, an employee, and a salary.");
      return;
    }
    setAdding(true);
    const res = await fetch("/api/salaries/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: newProject,
        userId: newEmployee,
        components: [{ label: "Salary", amount: Number(newAmount) }],
        currency: newCurrency,
      }),
    });
    setAdding(false);
    if (res.ok) {
      setNewProject("");
      setNewEmployee("");
      setNewAmount("");
      setShowAdd(false); // close the dropdown; the new row appears in the table
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setAddError(data.error || "Could not add the salary.");
    }
  }

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <span className="text-sm text-ink-400">
          {salaries.length} {salaries.length === 1 ? "salary" : "salaries"}
        </span>
        {/* Toggle the composer, like the announcements "New post" button. */}
        <Button
          size="sm"
          onClick={() => setShowAdd((o) => !o)}
          aria-expanded={showAdd}
        >
          {showAdd ? (
            <>
              <X className="h-4 w-4" />
              Cancel
            </>
          ) : (
            <>
              <Plus className="h-4 w-4" />
              Add salary
            </>
          )}
        </Button>
      </div>

      {/* Inline expanding composer (announcements pattern). */}
      <AnimatePresence initial={false}>
        {showAdd && (
          <motion.div
            key="salary-composer"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="mb-4 overflow-hidden"
          >
            <GlassCard strong glow hover={false} className="mb-1 p-5">
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-ink-500">
                      Employee
                    </label>
                    <select
                      value={newEmployee}
                      onChange={(e) => setNewEmployee(e.target.value)}
                      className="input appearance-none"
                    >
                      <option value="" className="bg-surface text-ink">
                        — Select employee —
                      </option>
                      {employees.map((u) => (
                        <option
                          key={u.id}
                          value={u.id}
                          className="bg-surface text-ink"
                        >
                          {u.name}
                          {u.title ? ` — ${u.title}` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-ink-500">
                      Project
                    </label>
                    <select
                      value={newProject}
                      onChange={(e) => setNewProject(e.target.value)}
                      className="input appearance-none"
                    >
                      <option value="" className="bg-surface text-ink">
                        — Select project —
                      </option>
                      {addRowProjects.map((p) => (
                        <option
                          key={p.id}
                          value={p.id}
                          className="bg-surface text-ink"
                        >
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-ink-500">
                      Currency
                    </label>
                    <select
                      value={newCurrency}
                      onChange={(e) => setNewCurrency(e.target.value)}
                      className="input appearance-none"
                    >
                      {CURRENCIES.map((c) => (
                        <option key={c} value={c} className="bg-surface text-ink">
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-ink-500">
                      Monthly salary
                    </label>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={newAmount}
                      onChange={(e) => setNewAmount(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") addRow();
                      }}
                      placeholder="0.00"
                      className="input text-right"
                    />
                  </div>
                </div>

                <AnimatePresence>
                  {addError && (
                    <motion.p
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0 }}
                      className="text-sm text-danger-ink"
                    >
                      {addError}
                    </motion.p>
                  )}
                </AnimatePresence>

                <div className="flex items-center justify-end gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setShowAdd(false);
                      setNewProject("");
                      setNewEmployee("");
                      setNewAmount("");
                      setAddError("");
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    loading={adding}
                    disabled={
                      !newProject || !newEmployee || !(Number(newAmount) > 0)
                    }
                    onClick={addRow}
                  >
                    {!adding && <Check className="h-4 w-4" />}
                    Add salary
                  </Button>
                </div>
              </div>
            </GlassCard>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-surface-2 text-left text-xs uppercase tracking-wide text-ink-500">
              <th className="border border-line/60 px-1 py-3 font-medium" />
              <th className="border border-line/60 px-4 py-3 text-center font-medium">
                Employee
              </th>
              <th className="border border-line/60 px-4 py-3 font-medium">
                Project
              </th>
              <th className="border border-line/60 px-4 py-3 text-right font-medium">
                Salary / mo
              </th>
              <th className="border border-line/60 px-4 py-3 text-right font-medium">
                Paid
              </th>
              <th className="border border-line/60 px-4 py-3 text-right font-medium">
                Remaining
              </th>
              <th className="border border-line/60 px-4 py-3 font-medium">Status</th>
              <th className="border border-line/60 px-3 py-3 font-medium" />
            </tr>
          </thead>
          <tbody>
            {salaries.length === 0 && !showAdd && (
              <tr>
                <td
                  colSpan={8}
                  className="border border-line/60 px-4 py-10 text-center text-sm text-ink-400"
                >
                  No salaries yet — click “Add salary” to add one.
                </td>
              </tr>
            )}
            {ordered.map((s) => {
              const draft = amountDraft[s.id];
              const shownValue =
                draft != null
                  ? draft
                  : (salaryTotalCents(s) / 100).toString();
              const dirty =
                draft != null &&
                Math.round((Number(draft) || 0) * 100) !== salaryTotalCents(s);
              const busy = busyId === s.id;
              const isOpen = expanded === s.id;
              const overpaid = s.remainingCents < 0;
              // Merged Employee cell: render it (with rowSpan) only on the FIRST
              // salary of each employee group. The span covers every salary row
              // in the group PLUS the one expanded payment row, if any belongs to
              // this group (only one row can be expanded at a time).
              const meta = groupMeta.get(s.id)!;
              const expandedInGroup =
                expanded != null &&
                groupMeta.get(expanded)?.key === meta.key;
              const empRowSpan = meta.size + (expandedInGroup ? 1 : 0);
              return (
                <Fragment key={s.id}>
                <tr className="hover:bg-surface-2">
                  <td className="border border-line/60 p-0 text-center">
                    <button
                      type="button"
                      onClick={() => {
                        setExpanded(isOpen ? null : s.id);
                        setPayAmount("");
                        setPayNote("");
                      }}
                      title={isOpen ? "Hide payments" : "Show payments"}
                      aria-label={isOpen ? "Hide payments" : "Show payments"}
                      className="mx-auto grid h-8 w-8 place-items-center rounded-lg text-ink-400 transition-colors hover:bg-surface-2 hover:text-accent-ink"
                    >
                      {isOpen ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </button>
                  </td>
                  {/* Employee — merged across the group (Excel-style), name
                      vertically + horizontally centered in the spanned cell. */}
                  {meta.first && (
                    <td
                      rowSpan={empRowSpan}
                      className="border border-line/60 px-4 py-3 text-center align-middle"
                    >
                      <span className="font-medium text-ink">{s.userName}</span>
                      {s.userTitle && (
                        <span className="ml-1 text-[11px] text-ink-400">
                          {s.userTitle}
                        </span>
                      )}
                    </td>
                  )}
                  <td className="border border-line/60 px-4 py-3 font-medium text-ink">
                    {s.projectName}
                  </td>
                  <td className="border border-line/60 px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="relative">
                        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-ink-400">
                          {s.currency}
                        </span>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={shownValue}
                          onChange={(e) =>
                            setAmountDraft((d) => ({
                              ...d,
                              [s.id]: e.target.value,
                            }))
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveAmount(s);
                          }}
                          disabled={busy}
                          className="h-9 w-32 rounded-lg border border-line bg-surface-2 pl-11 pr-2.5 text-right tabular-nums outline-none focus:border-accent"
                        />
                      </div>
                      {dirty && (
                        <button
                          type="button"
                          onClick={() => saveAmount(s)}
                          disabled={busy}
                          title="Save amount"
                          aria-label="Save amount"
                          className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-white hover:bg-accent/90 disabled:opacity-40"
                        >
                          <Check className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="border border-line/60 px-4 py-3 text-right tabular-nums text-ink-700">
                    {formatMoney(s.paidCents, s.currency)}
                  </td>
                  <td
                    className={`border border-line/60 px-4 py-3 text-right font-medium tabular-nums ${
                      overpaid
                        ? "text-danger-ink"
                        : s.remainingCents === 0
                          ? "text-emerald-600"
                          : "text-ink"
                    }`}
                  >
                    {overpaid
                      ? `−${formatMoney(-s.remainingCents, s.currency)}`
                      : formatMoney(s.remainingCents, s.currency)}
                  </td>
                  <td className="border border-line/60 px-4 py-3">
                    <Badge variant={s.active ? "emerald" : "neutral"}>
                      {s.active ? "Active" : "Inactive"}
                    </Badge>
                  </td>
                  <td className="border border-line/60 px-3 py-3">
                    <div className="flex items-center justify-end gap-0.5">
                      <button
                        type="button"
                        onClick={() => toggleActive(s)}
                        disabled={busy}
                        title={s.active ? "Deactivate" : "Activate"}
                        aria-label={s.active ? "Deactivate" : "Activate"}
                        className="grid h-8 w-8 place-items-center rounded-lg text-ink-400 transition-colors hover:bg-accent-soft hover:text-accent-ink disabled:opacity-40"
                      >
                        <Power className="h-4 w-4" />
                      </button>
                      {/* Add another project's salary for THIS employee. */}
                      {s.userId && (
                        <button
                          type="button"
                          onClick={() => addForEmployee(s)}
                          title={`Add another project for ${s.userName}`}
                          aria-label={`Add another project for ${s.userName}`}
                          className="grid h-8 w-8 place-items-center rounded-lg text-ink-400 transition-colors hover:bg-accent-soft hover:text-accent-ink"
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(s)}
                        title="Remove salary"
                        aria-label="Remove salary"
                        className="grid h-8 w-8 place-items-center rounded-lg text-ink-400 transition-colors hover:bg-danger-soft hover:text-danger-ink"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>

                {/* Expanded payment log for this salary. The Employee column is
                    covered by the group's merged (rowSpan) cell, so this row
                    renders only the chevron cell + a span over the rest. */}
                {isOpen && (
                  <tr>
                    <td className="border border-line/60 bg-surface-2/30 p-0" />
                    <td
                      colSpan={6}
                      className="border border-line/60 bg-surface-2/40 px-4 py-4"
                    >
                      <div className="mb-3 flex items-baseline justify-between gap-2">
                        <span className="text-xs font-medium uppercase tracking-wide text-ink-400">
                          Payment history
                        </span>
                        <span className="text-xs text-ink-500">
                          Paid{" "}
                          <span className="font-medium tabular-nums text-ink">
                            {formatMoney(s.paidCents, s.currency)}
                          </span>{" "}
                          of {formatMoney(salaryTotalCents(s), s.currency)}
                        </span>
                      </div>

                      {s.payments.length > 0 ? (
                        <div className="mb-3 space-y-1">
                          {s.payments.map((p) => (
                            <div
                              key={p.id}
                              className="flex items-center gap-3 rounded-lg bg-surface px-3 py-1.5 text-sm"
                            >
                              <span className="font-medium tabular-nums text-ink">
                                {formatMoney(p.amountCents, s.currency)}
                              </span>
                              {p.note && (
                                <span className="truncate text-xs text-ink-500">
                                  {p.note}
                                </span>
                              )}
                              <span className="ml-auto text-xs text-ink-400">
                                {p.paidOn.slice(0, 10)}
                              </span>
                              <button
                                type="button"
                                onClick={() => removePayment(s, p.id)}
                                disabled={payBusy}
                                aria-label="Remove payment"
                                title="Remove payment"
                                className="text-ink-400 hover:text-danger-ink disabled:opacity-40"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="mb-3 text-sm text-ink-400">
                          No payments logged yet.
                        </div>
                      )}

                      {/* Add a payment */}
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="relative">
                          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-ink-400">
                            {s.currency}
                          </span>
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={payAmount}
                            onChange={(e) => setPayAmount(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") addPayment(s);
                            }}
                            placeholder="0.00"
                            className="h-9 w-32 rounded-lg border border-line bg-surface pl-11 pr-2.5 text-right tabular-nums outline-none focus:border-accent"
                          />
                        </div>
                        <input
                          type="text"
                          value={payNote}
                          onChange={(e) => setPayNote(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") addPayment(s);
                          }}
                          placeholder="Note (optional)"
                          className="h-9 flex-1 min-w-0 rounded-lg border border-line bg-surface px-3 outline-none focus:border-accent md:min-w-[10rem]"
                        />
                        <button
                          type="button"
                          onClick={() => addPayment(s)}
                          disabled={payBusy || !(Number(payAmount) > 0)}
                          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-accent px-3 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-40"
                        >
                          <Plus className="h-4 w-4" />
                          Log payment
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
                </Fragment>
              );
            })}

          </tbody>
        </table>
      </div>


      <ConfirmDialog
        open={!!deleteTarget}
        title="Remove salary"
        message={
          <>
            Remove <strong>{deleteTarget?.userName}</strong>’s salary on{" "}
            {deleteTarget ? projectName(deleteTarget.projectId) : ""}? This can’t
            be undone.
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
