"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Sunrise, Sun, Moon, RefreshCw } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { useBrand } from "@/components/BrandProvider";

const TIPS = [
  "Block 90 minutes of deep work before checking Slack.",
  "Ship the smallest version that's still useful, then iterate.",
  "A 5-minute walk beats a fourth coffee. Take the walk.",
  "Write the PR description first — it sharpens the change.",
  "Default to a quick call when a thread hits five replies.",
  "Celebrate the boring fixes; they keep the lights on.",
  "Async update > status meeting. Post it, tag two people, move on.",
  "If it's not in a doc, it didn't happen. Capture decisions.",
  "Pair for an hour when you've been stuck for two.",
  "End the day by writing down tomorrow's first task.",
];

function greeting(hour: number): { label: string; icon: typeof Sun } {
  if (hour < 12) return { label: "Good morning", icon: Sunrise };
  if (hour < 18) return { label: "Good afternoon", icon: Sun };
  return { label: "Good evening", icon: Moon };
}

export function TodayPanel({ firstName }: { firstName: string }) {
  const brand = useBrand();
  // Compute on the client so the date reflects the viewer's locale/timezone.
  const [now, setNow] = useState<Date | null>(null);
  const [tipIndex, setTipIndex] = useState(0);

  useEffect(() => {
    const d = new Date();
    setNow(d);
    // Deterministic starting tip seeded by day-of-year, then user can cycle.
    const dayOfYear = Math.floor(
      (d.getTime() - new Date(d.getFullYear(), 0, 0).getTime()) / 86_400_000,
    );
    setTipIndex(dayOfYear % TIPS.length);
  }, []);

  const { label, icon: GreetIcon, dateLabel, weekday } = useMemo(() => {
    const d = now ?? new Date();
    const g = greeting(d.getHours());
    return {
      label: g.label,
      icon: g.icon,
      weekday: d.toLocaleDateString(undefined, { weekday: "long" }),
      dateLabel: d.toLocaleDateString(undefined, {
        month: "long",
        day: "numeric",
        year: "numeric",
      }),
    };
  }, [now]);

  return (
    <GlassCard hover={false} className="overflow-hidden p-0">
      {/* Header band */}
      <div className="relative border-b border-line bg-accent-soft p-5">
        <div className="absolute right-4 top-4 text-ink-300">
          <GreetIcon className="h-9 w-9" />
        </div>
        <p className="text-xs font-medium uppercase tracking-widest text-ink-400">
          {`Today at ${brand.name}`}
        </p>
        <h2 className="mt-1.5 pr-12 text-lg font-bold text-ink">
          {label}, {firstName}
        </h2>
        <p className="mt-0.5 text-sm text-ink-500" suppressHydrationWarning>
          {now ? `${weekday}, ${dateLabel}` : " "}
        </p>
      </div>

      {/* Tip */}
      <div className="p-5">
        <div className="mb-2 flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-accent" />
          <span className="text-xs font-semibold uppercase tracking-wider text-ink-400">
            Daily tip
          </span>
          <button
            onClick={() => setTipIndex((i) => (i + 1) % TIPS.length)}
            className="ml-auto grid h-6 w-6 place-items-center rounded-lg text-ink-300 transition hover:bg-surface-2 hover:text-ink-700 active:scale-90"
            aria-label="Show another tip"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="min-h-[3rem] rounded-xl border border-line bg-surface-2 p-3.5">
          <AnimatePresence mode="wait">
            <motion.p
              key={tipIndex}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.25 }}
              className="text-sm leading-relaxed text-ink-700"
            >
              {TIPS[tipIndex]}
            </motion.p>
          </AnimatePresence>
        </div>
      </div>
    </GlassCard>
  );
}
