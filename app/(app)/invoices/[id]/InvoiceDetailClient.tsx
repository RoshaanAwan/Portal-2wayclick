"use client";

import { useState } from "react";
import Link from "@/components/Link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Check, Download, Pencil } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  INVOICE_STATUSES,
  STATUS_META,
  type InvoiceDTO,
  type InvoiceStatus,
} from "@/lib/invoices";
import { InvoiceForm } from "../InvoiceForm";
import { InvoiceDocument } from "../InvoiceDocument";
import { InvoiceSharePanel } from "./InvoiceSharePanel";

export function InvoiceDetailClient({
  invoice,
  shareUrl,
}: {
  invoice: InvoiceDTO;
  shareUrl: string | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [error, setError] = useState("");

  async function changeStatus(status: InvoiceStatus) {
    if (status === invoice.status || savingStatus) return;
    setSavingStatus(true);
    setError("");
    const res = await fetch(`/api/invoices/${invoice.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Could not update status.");
    }
    setSavingStatus(false);
  }

  if (editing) {
    return (
      <div className="mx-auto max-w-[1200px]">
        <button
          onClick={() => setEditing(false)}
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-400 transition-colors hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to invoice
        </button>
        <h1 className="mb-4 text-lg font-semibold text-ink">
          Edit invoice {invoice.number}
        </h1>
        <InvoiceForm invoice={invoice} onDone={() => setEditing(false)} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[900px]">
      {/* Toolbar — never printed. */}
      <div className="no-print mb-5">
        <Link
          href="/invoices"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-400 transition-colors hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" />
          All invoices
        </Link>

        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Status selector */}
          <div className="flex items-center gap-1.5">
            <span className="mr-1 text-xs font-medium text-ink-400">
              Status
            </span>
            {INVOICE_STATUSES.map((s) => {
              const active = s === invoice.status;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => changeStatus(s)}
                  disabled={savingStatus}
                  className={
                    "inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-60 " +
                    (active
                      ? "border-accent bg-accent-soft text-accent-ink"
                      : "border-line bg-surface-2 text-ink-500 hover:border-line-strong hover:text-ink")
                  }
                >
                  {active && <Check className="h-3 w-3" />}
                  {STATUS_META[s].label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <Button size="sm" variant="glass" onClick={() => setEditing(true)}>
              <Pencil className="h-4 w-4" />
              Edit
            </Button>
            <Button size="sm" onClick={() => window.print()}>
              <Download className="h-4 w-4" />
              Download / Print
            </Button>
          </div>
        </div>

        <AnimatePresence>
          {error && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-2 text-sm text-danger-ink"
            >
              {error}
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      {/* The printable invoice — the only thing that prints. */}
      <div className="print-area">
        <InvoiceDocument invoice={invoice} />
      </div>

      {/* Client share link — never printed. */}
      <div className="no-print mt-6">
        <InvoiceSharePanel invoiceId={invoice.id} initialUrl={shareUrl} />
      </div>
    </div>
  );
}
