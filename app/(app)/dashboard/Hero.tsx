"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Sun, Sunrise, Moon, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import { Spotlight } from "@/components/ui/Spotlight";
import { rise } from "@/lib/motion";

function greetingFor(hour: number): { label: string; Icon: typeof Sun } {
  if (hour < 5) return { label: "Good evening", Icon: Moon };
  if (hour < 12) return { label: "Good morning", Icon: Sunrise };
  if (hour < 18) return { label: "Good afternoon", Icon: Sun };
  return { label: "Good evening", Icon: Moon };
}

export function Hero({
  firstName,
  name,
  title,
  department,
  avatarUrl,
}: {
  firstName: string;
  name: string;
  title: string;
  department: string;
  avatarUrl?: string | null;
}) {
  // Compute on the client so the greeting reflects the viewer's local time
  // without a hydration mismatch. Start with morning, then settle on mount.
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const hour = now ? now.getHours() : 9;
  const { label, Icon } = greetingFor(hour);

  const dateLabel = (now ?? new Date()).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const timeLabel = now
    ? now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    : null;

  return (
    <motion.div
      {...rise()}
      className="glass-strong group relative overflow-hidden p-6 sm:p-8"
    >
      <Spotlight size={420} />
      {/* Ambient brand glow + faint grid texture */}
      <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 animate-breathe rounded-full bg-accent/[0.12] blur-3xl" />
      <div className="pointer-events-none absolute inset-0 bg-grid opacity-[0.35] [mask-image:radial-gradient(circle_at_top_right,black,transparent_60%)]" />

      <div className="relative z-[1] flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-5">
          <motion.div
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.12, type: "spring", stiffness: 220 }}
            className="relative"
          >
            <Avatar name={name} src={avatarUrl} size="xl" ring />
            {/* live presence dot */}
            <span className="absolute bottom-0.5 right-0.5 flex h-3.5 w-3.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success/60" />
              <span className="relative inline-flex h-3.5 w-3.5 rounded-full bg-success ring-2 ring-surface" />
            </span>
          </motion.div>

          <div>
            <div className="mb-2.5 inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-ink-500">
              <Icon className="h-3.5 w-3.5 text-accent" />
              {dateLabel}
              {timeLabel && (
                <>
                  <span className="text-ink-300">•</span>
                  <span className="nums">{timeLabel}</span>
                </>
              )}
            </div>
            <h1 className="font-display text-[1.8rem] font-semibold leading-tight tracking-tight text-ink sm:text-[2.1rem]">
              {label},{" "}
              <span className="bg-accent-grad bg-clip-text text-transparent">
                {firstName}
              </span>
            </h1>
            <p className="mt-1 text-sm text-ink-500">
              {title} · {department}
            </p>
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, x: 10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.25, duration: 0.4 }}
          className="self-start sm:self-auto"
        >
          <Link
            href="/announcements"
            className="group/cta flex items-center gap-3 rounded-xl border border-line bg-surface-2 px-4 py-3 transition hover:border-accent/40 hover:bg-accent-soft"
          >
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-accent-grad font-display text-sm font-bold text-white shadow-accent-glow">
              3.0
            </div>
            <div>
              <p className="text-xs font-semibold text-ink-700">2WayClick 3.0</p>
              <p className="text-[11px] text-ink-400">
                Ships Friday — see what&apos;s new
              </p>
            </div>
            <ArrowUpRight className="h-4 w-4 text-ink-300 transition group-hover/cta:translate-x-0.5 group-hover/cta:text-accent" />
          </Link>
        </motion.div>
      </div>
    </motion.div>
  );
}
