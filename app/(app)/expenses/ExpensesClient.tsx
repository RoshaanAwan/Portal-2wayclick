"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  Wallet,
  Trash2,
  Pencil,
  Check,
  X,
  Paperclip,
  FolderKanban,
} from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { formatDate } from "@/lib/utils";
import {
  formatMoney,
  FINANCE_STATUS_META,
  FINANCE_STATUSES,
  type ExpenseDTO,
  type FinanceStatus,
} from "@/lib/finance";
import { ExpenseForm } from "./ExpenseForm";

interface ProjectOption {
  id: string;
  name: string;
}

type Filter = "ALL" | FinanceStatus;

export function ExpensesClient({
  expenses,
  projects,
  currentUserId,
}: {
  expenses: ExpenseDTO[];
  projects: ProjectOption[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [composing, setComposing] = useState(false);
  const [editing, setEditing] = useState<ExpenseDTO | null>(null);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [deleteTarget, setDeleteTarget] = useState<ExpenseDTO | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = {
      ALL: expenses.length,
      PENDING: 0,
      APPROVED: 0,
      REJECTED: 0,
    };
    for (const e of expenses) c[e.status]++;
    return c;
  }, [expenses]);

  // Approved total, only meaningful when one currency is in play.
  const approvedSummary = useMemo(() => {
    const approved = expenses.filter((e) => e.status === "APPROVED");
    const currencies = new Set(approved.map((e) => e.currency));
    if (currencies.size !== 1) return null;
    const total = approved.reduce((s, e) => s + e.amountCents, 0);
    return formatMoney(total, [...currencies][0]);
  }, [expenses]);

  const visible = useMemo(
    () => (filter === "ALL" ? expenses : expenses.filter((e) => e.status === filter)),
    [expenses, filter],
  );

  async function decide(exp: ExpenseDTO, decision: "APPROVED" | "REJECTED") {
    if (busyId) return;
    setBusyId(exp.id);
    const res = await fetch("/api/expenses/decide", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: exp.id, decision }),
    });
    if (res.ok) router.refresh();
    setBusyId(null);
  }

  async function confirmDelete() {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    const res = await fetch(`/api/expenses/${deleteTarget.id}`, {
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
        <div className="flex flex-wrap items-center gap-1.5">
          {(["ALL", ...FINANCE_STATUSES] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={
                "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors " +
                (filter === f
                  ? "border-accent/30 bg-accent-soft text-accent-ink"
                  : "border-line bg-surface-2 text-ink-500 hover:text-ink")
              }
            >
              {f === "ALL" ? "All" : FINANCE_STATUS_META[f].label}
              <span className="ml-1.5 text-ink-400">{counts[f]}</span>
            </button>
          ))}
          {approvedSummary && (
            <span className="ml-1 text-xs text-success-ink">
              {approvedSummary} approved
            </span>
          )}
        </div>
        {!composing && !editing && (
          <Button size="sm" onClick={() => setComposing(true)}>
            <Plus className="h-4 w-4" />
            New expense
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
            <ExpenseForm
              expense={editing ?? undefined}
              projects={projects}
              onDone={() => {
                setComposing(false);
                setEditing(null);
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {visible.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title={filter === "ALL" ? "No expenses yet" : "Nothing here"}
          description={
            filter === "ALL"
              ? "Submit your first expense claim — attach a receipt and pick the project it belongs to."
              : "No expenses match this filter."
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line">
          <table className="w-full min-w-[680px] text-sm">
            <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-ink-400">
              <tr>
                <th className="px-4 py-3">Expense</th>
                <th className="px-4 py-3">Project</th>
                <th className="px-4 py-3">Submitted by</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {visible.map((e) => {
                const status = FINANCE_STATUS_META[e.status];
                const isOwn = e.submitterId === currentUserId;
                const busy = busyId === e.id;
                return (
                  <tr key={e.id} className="align-top hover:bg-surface-2">
                    <td className="px-4 py-3">
                      <div className="font-medium text-ink">{e.title}</div>
                      <div className="mt-0.5 flex items-center gap-2 text-[11px] text-ink-400">
                        <Badge variant="neutral">{e.category}</Badge>
                        <span>{formatDate(e.spentOn)}</span>
                        {e.slipUrl && (
                          <a
                            href={e.slipUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-accent-ink hover:underline"
                          >
                            <Paperclip className="h-3 w-3" />
                            Slip
                          </a>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-ink-500">
                      {e.projectName ? (
                        <span className="inline-flex items-center gap-1.5">
                          <FolderKanban className="h-3.5 w-3.5 text-ink-400" />
                          {e.projectName}
                        </span>
                      ) : (
                        <span className="text-ink-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-ink-500">{e.submitterName}</td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums text-ink">
                      {formatMoney(e.amountCents, e.currency)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={status.badge}>{status.label}</Badge>
                      {e.status !== "PENDING" && e.reviewerName && (
                        <div className="mt-0.5 text-[11px] text-ink-400">
                          by {e.reviewerName}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        {e.status === "PENDING" && (
                          <>
                            {/* A user can't approve/reject their own claim. */}
                            {!isOwn && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => decide(e, "APPROVED")}
                                  disabled={busy}
                                  aria-label="Approve"
                                  title="Approve"
                                  className="grid h-7 w-7 place-items-center rounded-lg border border-line bg-surface-2 text-ink-500 transition-colors hover:border-success/40 hover:bg-success-soft hover:text-success-ink disabled:opacity-40"
                                >
                                  <Check className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => decide(e, "REJECTED")}
                                  disabled={busy}
                                  aria-label="Reject"
                                  title="Reject"
                                  className="grid h-7 w-7 place-items-center rounded-lg border border-line bg-surface-2 text-ink-500 transition-colors hover:border-danger/40 hover:bg-danger-soft hover:text-danger-ink disabled:opacity-40"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                setComposing(false);
                                setEditing(e);
                              }}
                              aria-label="Edit"
                              title="Edit"
                              className="grid h-7 w-7 place-items-center rounded-lg border border-line bg-surface-2 text-ink-500 transition-colors hover:border-accent/40 hover:bg-accent-soft hover:text-accent-ink"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(e)}
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
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete expense"
        message={
          <>
            Delete the expense <strong>{deleteTarget?.title}</strong>? This
            permanently removes it. This can’t be undone.
          </>
        }
        loading={deleting}
        onConfirm={confirmDelete}
        onClose={() => !deleting && setDeleteTarget(null)}
      />
    </>
  );
}
