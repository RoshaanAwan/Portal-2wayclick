"use client";

import { motion } from "framer-motion";
import { Activity as ActivityIcon } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { timeAgo } from "@/lib/utils";

export interface FeedItem {
  id: string;
  verb: string;
  target: string;
  createdAt: string;
  user: {
    name: string;
    avatarUrl?: string | null;
    title: string;
  };
}

// Tint the verb word so the feed reads at a glance.
const verbColor: Record<string, string> = {
  posted: "text-accent",
  approved: "text-success",
  denied: "text-danger",
  requested: "text-warn",
  uploaded: "text-info",
  commented: "text-accent",
  joined: "text-success",
};

export function PulseFeed({ items }: { items: FeedItem[] }) {
  return (
    <GlassCard hover={false} className="p-0">
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <div className="flex items-center gap-2.5">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-accent-soft">
            <ActivityIcon className="h-4 w-4 text-accent" />
          </div>
          <div>
            <h2 className="font-display text-[15px] font-semibold tracking-tight text-ink">Pulse</h2>
            <p className="text-[11px] text-ink-400">What&apos;s happening across 2WayClick</p>
          </div>
        </div>
        <span className="flex items-center gap-1.5 text-[11px] font-medium text-ink-400">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success/60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
          </span>
          Live
        </span>
      </div>

      {items.length === 0 ? (
        <div className="p-5">
          <EmptyState
            icon={ActivityIcon}
            title="No activity yet"
            description="When your team posts, uploads, or requests time off, it shows up here."
          />
        </div>
      ) : (
        <ul className="relative px-5 py-2">
          {/* connecting line */}
          <span className="pointer-events-none absolute bottom-6 left-[2.45rem] top-6 w-px bg-gradient-to-b from-line-strong via-line to-transparent" />
          {items.map((item, i) => {
            const color = verbColor[item.verb] ?? "text-ink-500";
            return (
              <motion.li
                key={item.id}
                initial={{ opacity: 0, x: -14 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.06 * i + 0.15, duration: 0.4, ease: "easeOut" }}
                className="group relative flex items-start gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-surface-2"
              >
                <div className="relative z-10">
                  <Avatar
                    name={item.user.name}
                    src={item.user.avatarUrl}
                    size="sm"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm leading-snug text-ink-700">
                    <span className="font-semibold text-ink">
                      {item.user.name}
                    </span>{" "}
                    <span className={`font-medium ${color}`}>{item.verb}</span>{" "}
                    <span className="text-ink-500">{item.target}</span>
                  </p>
                  <p className="mt-0.5 text-[11px] text-ink-400">
                    {item.user.title} · {timeAgo(item.createdAt)}
                  </p>
                </div>
              </motion.li>
            );
          })}
        </ul>
      )}
    </GlassCard>
  );
}
