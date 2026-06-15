"use client";

import { motion } from "framer-motion";
import { CalendarDays, ArrowRight, UserCheck } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDate, timeAgo } from "@/lib/utils";
import { statusVariant, type RequestStatus } from "@/lib/constants";
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

                <Badge variant={statusVariant[r.status]}>
                  {statusLabel[r.status]}
                </Badge>
              </div>
            </GlassCard>
          ))}
        </div>
      )}
    </section>
  );
}
