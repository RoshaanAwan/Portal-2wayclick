"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  UtensilsCrossed,
  Trash2,
  Pencil,
  Check,
  X,
  Paperclip,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { formatDate } from "@/lib/utils";
import {
  formatMoney,
  FINANCE_STATUS_META,
  FINANCE_STATUSES,
  type CanteenExpenseDTO,
  type FinanceStatus,
} from "@/lib/finance";
import { CanteenForm } from "./CanteenForm";

type Filter = "ALL" | FinanceStatus;

export function CanteenClient({
  expenses,
  currentUserId,
}: {
  expenses: CanteenExpenseDTO[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [composing, setComposing] = useState(false);
  const [editing, setEditing] = useState<CanteenExpenseDTO | null>(null);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [deleteTarget, setDeleteTarget] = useState<CanteenExpenseDTO | null>(null);
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

  async function decide(exp: CanteenExpenseDTO, decision: "APPROVED" | "REJECTED") {
    if (busyId) return;
    setBusyId(exp.id);
    const res = await fetch("/api/canteen/decide", {
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
    const res = await fetch(`/api/canteen/${deleteTarget.id}`, {
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
            New canteen expense
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
            <CanteenForm
              expense={editing ?? undefined}
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
          icon={UtensilsCrossed}
          title={filter === "ALL" ? "No canteen expenses yet" : "Nothing here"}
          description={
            filter === "ALL"
              ? "Log your first canteen expense — attach the receipt slip and how many people it covered."
              : "No canteen expenses match this filter."
          }
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-line">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-ink-400">
              <tr>
                <th className="px-4 py-3">Vendor</th>
                <th className="px-4 py-3">People</th>
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
                const perHead = Math.round(e.amountCents / Math.max(1, e.headcount));
                return (
                  <tr key={e.id} className="align-top hover:bg-surface-2">
                    <td className="px-4 py-3">
                      <div className="font-medium text-ink">{e.vendor}</div>
                      <div className="mt-0.5 flex items-center gap-2 text-[11px] text-ink-400">
                        <span>{formatDate(e.mealDate)}</span>
                        <a
                          href={e.slipUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-accent-ink hover:underline"
                        >
                          <Paperclip className="h-3 w-3" />
                          Slip
                        </a>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-ink-500">
                      <span className="inline-flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5 text-ink-400" />
                        {e.headcount}
                      </span>
                      <div className="mt-0.5 text-[11px] text-ink-400">
                        {formatMoney(perHead, e.currency)}/head
                      </div>
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
        title="Delete canteen expense"
        message={
          <>
            Delete the canteen expense from{" "}
            <strong>{deleteTarget?.vendor}</strong>? This permanently removes it.
            This can’t be undone.
          </>
        }
        loading={deleting}
        onConfirm={confirmDelete}
        onClose={() => !deleting && setDeleteTarget(null)}
      />
    </>
  );
}
