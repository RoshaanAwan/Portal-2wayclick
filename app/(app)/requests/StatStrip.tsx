"use client";

import { motion } from "framer-motion";
import { Clock, CheckCircle2, XCircle, CalendarRange } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { statusVariant } from "@/lib/constants";
import type { RequestRow } from "./page";

/** Inclusive whole-day span between two ISO dates. */
function dayCount(startISO: string, endISO: string): number {
  const start = new Date(startISO);
  const end = new Date(endISO);
  const ms = end.getTime() - start.getTime();
  return Math.max(1, Math.round(ms / (24 * 60 * 60 * 1000)) + 1);
}

export function StatStrip({ requests }: { requests: RequestRow[] }) {
  const pending = requests.filter((r) => r.status === "PENDING").length;
  const approved = requests.filter((r) => r.status === "APPROVED").length;
  const denied = requests.filter((r) => r.status === "DENIED").length;

  const thisYear = new Date().getFullYear();
  const daysThisYear = requests
    .filter(
      (r) =>
        r.status !== "DENIED" &&
        new Date(r.startDate).getFullYear() === thisYear,
    )
    .reduce((sum, r) => sum + dayCount(r.startDate, r.endDate), 0);

  const tiles = [
    {
      label: "Pending",
      value: pending,
      icon: Clock,
      variant: statusVariant.PENDING,
    },
    {
      label: "Approved",
      value: approved,
      icon: CheckCircle2,
      variant: statusVariant.APPROVED,
    },
    {
      label: "Denied",
      value: denied,
      icon: XCircle,
      variant: statusVariant.DENIED,
    },
    {
      label: `Days in ${thisYear}`,
      value: daysThisYear,
      icon: CalendarRange,
      variant: "cyan" as const,
    },
  ];

  return (
    <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
      {tiles.map((tile, i) => {
        const Icon = tile.icon;
        return (
          <motion.div
            key={tile.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: i * 0.06, ease: "easeOut" }}
            className="glass glass-hover rounded-2xl p-4"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-ink-400">
                {tile.label}
              </span>
              <Badge variant={tile.variant} className="px-1.5">
                <Icon className="h-3 w-3" />
              </Badge>
            </div>
            <p className="mt-2 font-display text-2xl font-semibold tracking-tight text-ink nums">
              {tile.value}
            </p>
          </motion.div>
        );
      })}
    </div>
  );
}
