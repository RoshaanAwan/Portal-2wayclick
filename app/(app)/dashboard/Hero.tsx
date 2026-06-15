"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Sun, Sunrise, Moon, ArrowUpRight, UserCheck, Plane, ListChecks } from "lucide-react";
import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import { CountUp } from "@/components/ui/CountUp";
import { rise } from "@/lib/motion";

interface TodayStats {
  availableNow: number;
  outToday: number;
  openTasks: number;
}

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
  todayStats,
}: {
  firstName: string;
  name: string;
  title: string;
  department: string;
  avatarUrl?: string | null;
  todayStats?: TodayStats;
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
      {/* slow-drifting accent aurora — pure ambience, lives behind the content */}
      <motion.div
        aria-hidden
        initial={{ opacity: 0 }}
        animate={{
          opacity: 0.5,
          x: [0, 28, -12, 0],
          y: [0, -16, 10, 0],
        }}
        transition={{
          opacity: { duration: 1.2 },
          x: { duration: 18, repeat: Infinity, ease: "easeInOut" },
          y: { duration: 22, repeat: Infinity, ease: "easeInOut" },
        }}
        className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full bg-accent/25 blur-[90px]"
      />
      <motion.div
        aria-hidden
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.35, x: [0, -20, 8, 0], y: [0, 14, -8, 0] }}
        transition={{
          opacity: { duration: 1.2, delay: 0.2 },
          x: { duration: 24, repeat: Infinity, ease: "easeInOut" },
          y: { duration: 20, repeat: Infinity, ease: "easeInOut" },
        }}
        className="pointer-events-none absolute -bottom-24 left-1/3 h-64 w-64 rounded-full bg-info/20 blur-[90px]"
      />

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
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-accent-grad font-display text-sm font-bold text-white">
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

      {/* Live "today" snapshot — animated count-ups, real numbers. */}
      {todayStats && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, duration: 0.45 }}
          className="relative z-[1] mt-6 flex flex-wrap gap-2.5 border-t border-line/70 pt-5"
        >
          <StatPill
            Icon={UserCheck}
            tone="success"
            value={todayStats.availableNow}
            label="available now"
          />
          <StatPill
            Icon={Plane}
            tone="info"
            value={todayStats.outToday}
            label="out today"
          />
          <StatPill
            Icon={ListChecks}
            tone="accent"
            value={todayStats.openTasks}
            label="open tasks"
          />
        </motion.div>
      )}
    </motion.div>
  );
}

const TONES = {
  success: { chip: "bg-success-soft", icon: "text-success", dot: "bg-success" },
  info: { chip: "bg-info-soft", icon: "text-info", dot: "bg-info" },
  accent: { chip: "bg-accent-soft", icon: "text-accent", dot: "bg-accent" },
} as const;

function StatPill({
  Icon,
  tone,
  value,
  label,
}: {
  Icon: typeof UserCheck;
  tone: keyof typeof TONES;
  value: number;
  label: string;
}) {
  const t = TONES[tone];
  return (
    <div className="inline-flex items-center gap-2.5 rounded-xl border border-line bg-surface-2 px-3.5 py-2">
      <span className={`grid h-7 w-7 place-items-center rounded-lg ${t.chip}`}>
        <Icon className={`h-3.5 w-3.5 ${t.icon}`} />
      </span>
      <span className="font-display text-lg font-semibold leading-none text-ink">
        <CountUp value={value} />
      </span>
      <span className="text-[11px] font-medium text-ink-500">{label}</span>
    </div>
  );
}
