"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { TimePicker } from "@/components/ui/TimePicker";
import { cn } from "@/lib/utils";

// The states the admin can set from this modal. PRESENT is time-driven (and the
// server flips it to CHECKED_OUT when a check-out exists / clears the day when
// blank); ABSENT and HALF_LEAVE are explicit dispositions.
type EditStatus = "PRESENT" | "HALF_LEAVE" | "ABSENT";

const STATUS_OPTIONS: { value: EditStatus; label: string }[] = [
  { value: "PRESENT", label: "Present" },
  { value: "HALF_LEAVE", label: "Half-leave" },
  { value: "ABSENT", label: "Absent" },
];

// ── Admin attendance edit ─────────────────────────────────────────────────────
// A per-row "edit" affordance on the daily roster (Admin tier only — the page
// gates this). Opens a modal to set/clear the person's check-in & check-out for
// the selected day; posts to /api/attendance/update. Times are wall-clock in the
// business timezone (handled server-side).

export interface EditAttendanceTarget {
  userId: string;
  name: string;
  day: string; // YYYY-MM-DD
  // Existing wall-clock times in the business TZ ("HH:MM"), or "" if unset.
  checkIn: string;
  checkOut: string;
  // The day's current disposition, seeding the status toggle. CHECKED_OUT maps
  // to "Present" (it's still a present day, just ended); AWAY (no row) → Present.
  status: EditStatus;
}

export function EditAttendanceButton({ target }: { target: EditAttendanceTarget }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label={`Edit ${target.name}'s attendance`}
        className="hover-surface inline-grid h-8 w-8 place-items-center rounded-lg border border-line text-ink-400 hover:text-ink"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
      <AnimatePresence>
        {open && <EditModal target={target} onClose={() => setOpen(false)} />}
      </AnimatePresence>
    </>
  );
}

function EditModal({
  target,
  onClose,
}: {
  target: EditAttendanceTarget;
  onClose: () => void;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<EditStatus>(target.status);
  const [checkIn, setCheckIn] = useState(target.checkIn);
  const [checkOut, setCheckOut] = useState(target.checkOut);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Times only apply when the person actually worked some of the day.
  const showTimes = status !== "ABSENT";

  const dayLabel = new Date(`${target.day}T00:00:00Z`).toLocaleDateString([], {
    weekday: "long",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

  async function save() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/attendance/update", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          userId: target.userId,
          day: target.day,
          status,
          // Absent days carry no times.
          checkIn: showTimes ? checkIn || null : null,
          checkOut: showTimes ? checkOut || null : null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not save.");
        setSubmitting(false);
        return;
      }
      onClose();
      router.refresh();
    } catch {
      setError("Network error — please try again.");
      setSubmitting(false);
    }
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-40 bg-black/55 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="fixed inset-0 z-50 grid place-items-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.98 }}
          transition={{ type: "spring", stiffness: 320, damping: 30 }}
          className="glass-strong w-full max-w-sm overflow-hidden p-0"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <div>
              <h2 className="font-display text-[15px] font-semibold text-ink">
                Edit attendance
              </h2>
              <p className="text-xs text-ink-400">
                {target.name} · {dayLabel}
              </p>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="hover-surface grid h-8 w-8 place-items-center rounded-lg text-ink-400 hover:text-ink"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-4 p-5">
            {/* Status segmented control */}
            <div>
              <span className="mb-1.5 block text-xs font-medium text-ink-500">
                Status
              </span>
              <div className="grid grid-cols-3 gap-1 rounded-xl border border-line bg-surface-2 p-1">
                {STATUS_OPTIONS.map((opt) => {
                  const on = status === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setStatus(opt.value)}
                      aria-pressed={on}
                      className={cn(
                        "rounded-lg px-2 py-1.5 text-xs font-medium transition-colors",
                        on
                          ? "bg-surface text-ink shadow-xs"
                          : "text-ink-400 hover:text-ink",
                      )}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {showTimes && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-ink-500">
                      Check-in
                    </span>
                    <TimePicker
                      value={checkIn}
                      onChange={setCheckIn}
                      aria-label="Check-in time"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-ink-500">
                      Check-out
                    </span>
                    <TimePicker
                      value={checkOut}
                      onChange={setCheckOut}
                      aria-label="Check-out time"
                    />
                  </label>
                </div>
                <p className="text-[11px] text-ink-400">
                  Times are local (Pakistan).
                  {status === "PRESENT"
                    ? " Clear both to mark the day as not in."
                    : " Optional for a half-leave day."}
                </p>
              </>
            )}

            {status === "ABSENT" && (
              <p className="rounded-lg border border-danger/20 bg-danger-soft px-3 py-2 text-[11px] text-danger-ink">
                {target.name} will be recorded as absent for this day.
              </p>
            )}

            {error && (
              <p className="rounded-lg border border-danger/20 bg-danger-soft px-3 py-2 text-xs text-danger-ink">
                {error}
              </p>
            )}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="glass" onClick={onClose}>
                Cancel
              </Button>
              <Button type="button" onClick={save} disabled={submitting}>
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Pencil className="h-4 w-4" />
                )}
                Save
              </Button>
            </div>
          </div>
        </motion.div>
      </div>
    </>
  );
}
