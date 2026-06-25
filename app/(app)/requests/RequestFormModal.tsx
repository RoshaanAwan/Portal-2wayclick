"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { X, CalendarPlus, CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { LEAVE_TYPES, type LeaveType } from "@/lib/constants";
import type { RequestRow } from "./page";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// Shared create/edit modal for a time-off request. In "create" mode it POSTs to
// /api/requests/create; in "edit" mode it pre-fills from `request` and PATCHes
// /api/requests/update. Editing is only offered for PENDING requests (the caller
// gates the entry point), so the form here is identical in both modes.
export function RequestFormModal({
  open,
  request,
  onClose,
}: {
  open: boolean;
  /** Present → edit that request; absent → create a new one. */
  request?: RequestRow | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const isEdit = !!request;

  const [type, setType] = useState<LeaveType>(
    (request?.type as LeaveType) ?? LEAVE_TYPES[0],
  );
  const [startDate, setStartDate] = useState(
    request ? request.startDate.slice(0, 10) : todayISO(),
  );
  const [endDate, setEndDate] = useState(
    request ? request.endDate.slice(0, 10) : todayISO(),
  );
  const [reason, setReason] = useState(request?.reason ?? "");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function close() {
    if (loading) return;
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (new Date(endDate) < new Date(startDate)) {
      setError("End date must be on or after the start date.");
      return;
    }

    setLoading(true);
    const res = await fetch(
      isEdit ? "/api/requests/update" : "/api/requests/create",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(isEdit ? { id: request!.id } : {}),
          type,
          startDate,
          endDate,
          reason,
        }),
      },
    );

    if (res.ok) {
      setLoading(false);
      onClose();
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(
        data.error ||
          (isEdit
            ? "Could not save your changes."
            : "Could not submit your request."),
      );
      setLoading(false);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 grid place-items-center p-4"
        >
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={close}
          />

          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="glass-strong relative z-10 w-full max-w-lg rounded-2xl p-6"
          >
            <div className="mb-5 flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-accent-soft border border-line">
                  {isEdit ? (
                    <CalendarClock className="h-5 w-5 text-accent" />
                  ) : (
                    <CalendarPlus className="h-5 w-5 text-accent" />
                  )}
                </div>
                <div>
                  <h2 className="text-lg font-bold tracking-tight text-ink">
                    {isEdit ? "Edit request" : "Request time off"}
                  </h2>
                  <p className="text-xs text-ink-400">
                    {isEdit
                      ? "Update the dates or details before it's reviewed."
                      : "Your manager will be notified to review."}
                  </p>
                </div>
              </div>
              <button
                onClick={close}
                className="grid h-8 w-8 place-items-center rounded-lg text-ink-400 transition hover:bg-surface-2 hover:text-ink"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-ink-500">
                  Type
                </label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {LEAVE_TYPES.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setType(t)}
                      className={
                        "rounded-xl border px-2 py-2 text-xs font-medium transition " +
                        (type === t
                          ? "border-accent/30 bg-accent-soft text-accent-ink"
                          : "border-line bg-surface-2 text-ink-500 hover:text-ink hover:border-line-strong")
                      }
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-ink-500">
                    Start date
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => {
                      setStartDate(e.target.value);
                      if (endDate < e.target.value) setEndDate(e.target.value);
                    }}
                    required
                    className="input [color-scheme:light]"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-ink-500">
                    End date
                  </label>
                  <input
                    type="date"
                    value={endDate}
                    min={startDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    required
                    className="input [color-scheme:light]"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-ink-500">
                  Reason <span className="text-ink-300">(optional)</span>
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                  maxLength={500}
                  placeholder="Add a short note for your manager…"
                  className="input resize-none"
                />
              </div>

              {error && (
                <motion.p
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="text-sm text-danger-ink"
                >
                  {error}
                </motion.p>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={close}
                  disabled={loading}
                >
                  Cancel
                </Button>
                <Button type="submit" loading={loading}>
                  {isEdit ? "Save changes" : "Submit request"}
                </Button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
