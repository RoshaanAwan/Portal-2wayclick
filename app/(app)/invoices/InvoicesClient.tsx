"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Plus, Receipt, Trash2, User } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { formatDate } from "@/lib/utils";
import {
  formatMoney,
  STATUS_META,
  type InvoiceDTO,
} from "@/lib/invoices";
import { InvoiceForm } from "./InvoiceForm";

export function InvoicesClient({ invoices }: { invoices: InvoiceDTO[] }) {
  const router = useRouter();
  const [composing, setComposing] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<InvoiceDTO | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Headline numbers: outstanding (SENT) and paid totals, by currency.
  const stats = useMemo(() => {
    let outstanding = 0;
    let paid = 0;
    let primaryCurrency = "USD";
    for (const inv of invoices) {
      primaryCurrency = inv.currency;
      if (inv.status === "SENT") outstanding += inv.totalCents;
      if (inv.status === "PAID") paid += inv.totalCents;
    }
    return { outstanding, paid, currency: primaryCurrency };
  }, [invoices]);

  // Whether every invoice shares one currency — only then is a summed total
  // meaningful (mixed currencies can't be added, so we hide the figure).
  const singleCurrency = useMemo(
    () => new Set(invoices.map((i) => i.currency)).size <= 1,
    [invoices],
  );

  async function confirmDelete() {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    const res = await fetch(`/api/invoices/${deleteTarget.id}`, {
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
        <div className="flex items-center gap-2.5 text-sm">
          <span className="text-ink-400">
            {invoices.length}{" "}
            {invoices.length === 1 ? "invoice" : "invoices"}
          </span>
          {singleCurrency && invoices.length > 0 && (
            <>
              <span className="text-ink-300">·</span>
              <span className="text-warn-ink">
                {formatMoney(stats.outstanding, stats.currency)} outstanding
              </span>
              <span className="text-ink-300">·</span>
              <span className="text-success-ink">
                {formatMoney(stats.paid, stats.currency)} paid
              </span>
            </>
          )}
        </div>
        {!composing && (
          <Button size="sm" onClick={() => setComposing(true)}>
            <Plus className="h-4 w-4" />
            New invoice
          </Button>
        )}
      </div>

      <AnimatePresence>
        {composing && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-6 overflow-hidden"
          >
            <InvoiceForm onDone={() => setComposing(false)} />
          </motion.div>
        )}
      </AnimatePresence>

      {invoices.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="No invoices yet"
          description="Create your first invoice to bill a client — then download it or share a link."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {invoices.map((inv) => (
            <InvoiceCard
              key={inv.id}
              invoice={inv}
              onDelete={() => setDeleteTarget(inv)}
            />
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete invoice"
        message={
          <>
            Delete invoice <strong>{deleteTarget?.number}</strong> for{" "}
            {deleteTarget?.clientName}? This permanently removes it and its line
            items, and any client share link stops working. This can’t be undone.
          </>
        }
        loading={deleting}
        onConfirm={confirmDelete}
        onClose={() => !deleting && setDeleteTarget(null)}
      />
    </>
  );
}

function InvoiceCard({
  invoice,
  onDelete,
}: {
  invoice: InvoiceDTO;
  onDelete: () => void;
}) {
  const status = STATUS_META[invoice.status];
  return (
    <GlassCard className="group flex flex-col p-5">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="grid h-10 w-10 place-items-center rounded-xl border border-line bg-accent-soft text-accent shadow-xs">
          <Receipt className="h-5 w-5" />
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={status.badge}>{status.label}</Badge>
          <button
            type="button"
            onClick={onDelete}
            aria-label="Delete invoice"
            className="grid h-7 w-7 place-items-center rounded-lg border border-line bg-surface-2 text-ink-500 transition-colors hover:border-danger/40 hover:bg-danger-soft hover:text-danger-ink"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <Link href={`/invoices/${invoice.id}`} className="min-w-0">
        <h2 className="truncate text-[15px] font-semibold text-ink transition-colors group-hover:text-accent-ink">
          {invoice.number}
        </h2>
      </Link>
      <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-ink-400">
        <User className="h-3.5 w-3.5" />
        <span className="truncate">{invoice.clientName}</span>
      </p>

      <div className="mt-4 flex items-end justify-between border-t border-line pt-3.5">
        <div>
          <p className="text-[11px] text-ink-400">Total</p>
          <p className="text-lg font-semibold tabular-nums text-ink">
            {formatMoney(invoice.totalCents, invoice.currency)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[11px] text-ink-400">Issued</p>
          <p className="text-xs text-ink-500">{formatDate(invoice.issueDate)}</p>
        </div>
      </div>

      <Link
        href={`/invoices/${invoice.id}`}
        className="mt-3 inline-flex items-center gap-1 self-end text-xs font-medium text-accent-ink transition-all hover:gap-1.5"
      >
        Open
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </GlassCard>
  );
}
