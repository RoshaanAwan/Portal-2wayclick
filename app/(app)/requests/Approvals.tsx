"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowRight, Check, X, Inbox } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { formatDate, timeAgo } from "@/lib/utils";
import type { RequestRow } from "./page";

const typeVariant: Record<string, "accent" | "cyan" | "pink" | "emerald"> = {
  Vacation: "accent",
  Sick: "pink",
  Personal: "cyan",
  WFH: "emerald",
};

export function Approvals({ requests }: { requests: RequestRow[] }) {
  const router = useRouter();
  // Tracks which request id + decision is mid-flight, to disable buttons.
  const [busy, setBusy] = useState<{ id: string; decision: string } | null>(
    null,
  );

  async function decide(id: string, decision: "APPROVED" | "DENIED") {
    if (busy) return;
    setBusy({ id, decision });
    const res = await fetch("/api/requests/decide", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, decision }),
    });
    if (res.ok) {
      router.refresh();
    }
    setBusy(null);
  }

  return (
    <section className="mb-6">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-400">
          Approvals
        </h2>
        <Badge variant="amber">
          <Inbox className="h-3 w-3" />
          {requests.length} pending
        </Badge>
      </div>

      <div className="space-y-3">
        {requests.map((r, i) => {
          const isBusy = busy?.id === r.id;
          return (
            <GlassCard
              key={r.id}
              glow
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: i * 0.05, ease: "easeOut" }}
              className="p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex min-w-0 gap-3">
                  <Avatar
                    name={r.owner.name}
                    src={r.owner.avatarUrl}
                    size="md"
                  />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-ink">
                        {r.owner.name}
                      </span>
                      <span className="text-xs text-ink-400">
                        {r.owner.title}
                      </span>
                    </div>

                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <Badge variant={typeVariant[r.type] ?? "neutral"}>
                        {r.type}
                      </Badge>
                      <span className="flex items-center gap-1.5 text-sm text-ink-700">
                        {formatDate(r.startDate)}
                        <ArrowRight className="h-3.5 w-3.5 text-ink-300" />
                        {formatDate(r.endDate)}
                      </span>
                    </div>

                    {r.reason && (
                      <p className="mt-2 text-sm text-ink-500">{r.reason}</p>
                    )}
                    <p className="mt-1.5 text-xs text-ink-400">
                      Requested {timeAgo(r.createdAt)}
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 gap-2">
                  <Button
                    size="sm"
                    variant="glass"
                    onClick={() => decide(r.id, "DENIED")}
                    disabled={!!busy}
                    loading={isBusy && busy?.decision === "DENIED"}
                  >
                    {!(isBusy && busy?.decision === "DENIED") && (
                      <X className="h-4 w-4" />
                    )}
                    Deny
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => decide(r.id, "APPROVED")}
                    disabled={!!busy}
                    loading={isBusy && busy?.decision === "APPROVED"}
                  >
                    {!(isBusy && busy?.decision === "APPROVED") && (
                      <Check className="h-4 w-4" />
                    )}
                    Approve
                  </Button>
                </div>
              </div>
            </GlassCard>
          );
        })}
      </div>
    </section>
  );
}
