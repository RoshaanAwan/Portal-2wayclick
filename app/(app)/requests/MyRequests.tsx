"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  CalendarDays,
  ArrowRight,
  UserCheck,
  Pencil,
  Trash2,
} from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { formatDate, timeAgo } from "@/lib/utils";
import { statusVariant, type RequestStatus } from "@/lib/constants";
import { RequestFormModal } from "./RequestFormModal";
import type { RequestRow } from "./page";

const typeVariant: Record<string, "accent" | "cyan" | "pink" | "emerald"> = {
  Vacation: "accent",
  Sick: "pink",
  Personal: "cyan",
  WFH: "emerald",
};

const statusLabel: Record<RequestStatus, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  DENIED: "Denied",
};

export function MyRequests({ requests }: { requests: RequestRow[] }) {
  const router = useRouter();
  // The request currently open in the edit modal (PENDING only).
  const [editing, setEditing] = useState<RequestRow | null>(null);
  // The request awaiting delete confirmation (any status).
  const [deleteTarget, setDeleteTarget] = useState<RequestRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function confirmDelete() {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    const res = await fetch("/api/requests/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: deleteTarget.id }),
    });
    setDeleting(false);
    if (res.ok) {
      setDeleteTarget(null);
      router.refresh();
    }
  }

  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-ink-400">
        My requests
      </h2>

      {requests.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="No time-off requests yet"
          description="When you request leave, it will show up here with its status."
        />
      ) : (
        <div className="space-y-3">
          {requests.map((r, i) => (
            <GlassCard
              key={r.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: i * 0.05, ease: "easeOut" }}
              className="p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={typeVariant[r.type] ?? "neutral"}>
                      {r.type}
                    </Badge>
                    <span className="flex items-center gap-1.5 text-sm font-medium text-ink-700">
                      {formatDate(r.startDate)}
                      <ArrowRight className="h-3.5 w-3.5 text-ink-300" />
                      {formatDate(r.endDate)}
                    </span>
                  </div>

                  {r.reason && (
                    <p className="mt-2 text-sm text-ink-500">{r.reason}</p>
                  )}

                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-400">
                    <span>Requested {timeAgo(r.createdAt)}</span>
                    {r.reviewer && (
                      <span className="flex items-center gap-1">
                        <UserCheck className="h-3 w-3" />
                        {r.status === "PENDING"
                          ? `Awaiting ${r.reviewer.name}`
                          : `Reviewed by ${r.reviewer.name}`}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Badge variant={statusVariant[r.status]}>
                    {statusLabel[r.status]}
                  </Badge>

                  {/* Edit is only possible while the request is still pending —
                      once decided, its dates are locked (the server enforces this
                      too). Withdraw (delete) is allowed in any status. */}
                  <div className="flex items-center gap-1">
                    {r.status === "PENDING" && (
                      <button
                        type="button"
                        onClick={() => setEditing(r)}
                        aria-label="Edit request"
                        title="Edit request"
                        className="grid h-8 w-8 place-items-center rounded-lg text-ink-400 transition hover:bg-surface-2 hover:text-ink"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(r)}
                      aria-label="Withdraw request"
                      title="Withdraw request"
                      className="grid h-8 w-8 place-items-center rounded-lg text-ink-400 transition hover:bg-surface-2 hover:text-danger-ink"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            </GlassCard>
          ))}
        </div>
      )}

      {/* Edit modal (PENDING requests). Keyed by id so reopening on a different
          row resets the form's pre-filled state. */}
      <RequestFormModal
        key={editing?.id ?? "none"}
        open={!!editing}
        request={editing}
        onClose={() => setEditing(null)}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="Withdraw request"
        confirmLabel="Withdraw"
        loading={deleting}
        message={
          deleteTarget?.status === "APPROVED" ? (
            <>
              Withdraw your approved <strong>{deleteTarget?.type}</strong> time
              off? This frees up that time on the team calendar.
            </>
          ) : (
            <>
              Withdraw this <strong>{deleteTarget?.type}</strong> request? This
              can&apos;t be undone.
            </>
          )
        }
        onConfirm={confirmDelete}
        onClose={() => !deleting && setDeleteTarget(null)}
      />
    </section>
  );
}
