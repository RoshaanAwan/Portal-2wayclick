"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Activity as ActivityIcon } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { timeAgo } from "@/lib/utils";
import { useActivityStream } from "@/lib/useActivityStream";

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
  assigned: "text-accent",
  created: "text-accent",
  joined: "text-success",
};

export function PulseFeed({ items: initial }: { items: FeedItem[] }) {
  // Live Activity Wall: seed from the server render, then stream new events in.
  const { items, liveCount } = useActivityStream(initial);

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
        <div className="flex items-center gap-2">
          {/* "+N new" badge — pulses in as live entries arrive. */}
          <AnimatePresence>
            {liveCount > 0 && (
              <motion.span
                key="livecount"
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.7 }}
                transition={{ type: "spring", stiffness: 400, damping: 22 }}
                className="rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-semibold text-accent"
              >
                +{liveCount} new
              </motion.span>
            )}
          </AnimatePresence>
          <span className="flex items-center gap-1.5 text-[11px] font-medium text-ink-400">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success/60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
            </span>
            Live
          </span>
        </div>
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
          <AnimatePresence initial={false}>
            {items.map((item) => {
              const color = verbColor[item.verb] ?? "text-ink-500";
              return (
                <motion.li
                  key={item.id}
                  layout
                  initial={{ opacity: 0, height: 0, x: -14 }}
                  animate={{ opacity: 1, height: "auto", x: 0 }}
                  exit={{ opacity: 0, height: 0, x: 14 }}
                  transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
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
          </AnimatePresence>
        </ul>
      )}
    </GlassCard>
  );
}
