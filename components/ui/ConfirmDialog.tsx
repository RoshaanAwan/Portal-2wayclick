"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, X } from "lucide-react";
import { Button } from "@/components/ui/Button";

// ── Confirm dialog ──────────────────────────────────────────────────────────
// A small, reusable "are you sure?" modal for destructive actions (delete a
// project, announcement, document…). Controlled by `open`; calls `onConfirm`
// when the danger button is pressed and `onClose` on cancel / backdrop / Escape.

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Delete",
  loading = false,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  // Close on Escape (ignored while the action is in flight).
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !loading) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, loading, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => !loading && onClose()}
          />

          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            role="alertdialog"
            aria-modal="true"
            aria-label={title}
            className="glass-strong relative z-10 w-full max-w-sm rounded-2xl p-6"
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-danger-soft">
                  <AlertTriangle className="h-5 w-5 text-danger-ink" />
                </div>
                <h2 className="text-lg font-semibold text-ink">{title}</h2>
              </div>
              <button
                type="button"
                onClick={() => !loading && onClose()}
                className="grid h-8 w-8 place-items-center rounded-lg text-ink-400 transition hover:bg-surface-2 hover:text-ink"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="text-sm leading-relaxed text-ink-700">{message}</div>

            <div className="mt-6 flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={onClose}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="danger"
                loading={loading}
                onClick={onConfirm}
              >
                {confirmLabel}
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
