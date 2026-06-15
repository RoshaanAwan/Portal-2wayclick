"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Play, Pause, RotateCcw, Timer, Coffee, Brain } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { cn } from "@/lib/utils";

type Mode = "focus" | "break";

const DURATIONS: Record<Mode, number> = {
  focus: 25 * 60,
  break: 5 * 60,
};

const RADIUS = 78;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function format(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function FocusTimer() {
  const [mode, setMode] = useState<Mode>("focus");
  const [remaining, setRemaining] = useState(DURATIONS.focus);
  const [running, setRunning] = useState(false);
  const [completed, setCompleted] = useState(0);

  // Track the wall-clock deadline so the countdown stays accurate even if the
  // tab is backgrounded and setInterval gets throttled.
  const deadlineRef = useRef<number | null>(null);

  useEffect(() => {
    if (!running) return;

    deadlineRef.current = Date.now() + remaining * 1000;

    const id = setInterval(() => {
      const left = Math.max(
        0,
        Math.round(((deadlineRef.current ?? Date.now()) - Date.now()) / 1000),
      );
      setRemaining(left);
      if (left <= 0) {
        setRunning(false);
        setCompleted((c) => (mode === "focus" ? c + 1 : c));
      }
    }, 250);

    return () => clearInterval(id);
    // We intentionally re-arm only when run state or mode flips; `remaining`
    // is captured into the deadline on each (re)start.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, mode]);

  function switchMode(next: Mode) {
    if (next === mode) return;
    setRunning(false);
    setMode(next);
    setRemaining(DURATIONS[next]);
  }

  function reset() {
    setRunning(false);
    setRemaining(DURATIONS[mode]);
  }

  const total = DURATIONS[mode];
  const progress = 1 - remaining / total;
  const dashOffset = CIRCUMFERENCE * (1 - progress);
  const isFocus = mode === "focus";
  const ringColor = isFocus ? "#f5683f" : "#34d399";

  return (
    <GlassCard glow strong hover={false} className="p-5">
      <div className="mb-4 flex items-center gap-2">
        <Timer className="h-4 w-4 text-accent" />
        <h2 className="text-sm font-semibold text-ink">Focus timer</h2>
        <span className="ml-auto text-xs text-ink-400">
          {completed} done today
        </span>
      </div>

      {/* Mode toggle */}
      <div className="mb-5 grid grid-cols-2 gap-1 rounded-xl border border-line bg-surface-2 p-1">
        {(
          [
            { key: "focus", label: "Focus", icon: Brain },
            { key: "break", label: "Break", icon: Coffee },
          ] as const
        ).map((opt) => {
          const Icon = opt.icon;
          const active = mode === opt.key;
          return (
            <button
              key={opt.key}
              onClick={() => switchMode(opt.key)}
              className={cn(
                "relative flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium transition-colors",
                active ? "text-accent-ink" : "text-ink-400 hover:text-ink-700",
              )}
            >
              {active && (
                <motion.span
                  layoutId="timer-mode"
                  className="absolute inset-0 rounded-lg bg-accent-soft ring-1 ring-inset ring-accent/15"
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                />
              )}
              <Icon className="relative z-10 h-3.5 w-3.5" />
              <span className="relative z-10">{opt.label}</span>
            </button>
          );
        })}
      </div>

      {/* Ring */}
      <div className="relative mx-auto mb-5 h-44 w-44">
        <svg
          viewBox="0 0 180 180"
          className="h-full w-full -rotate-90 text-line"
          aria-hidden
        >
          <circle
            cx="90"
            cy="90"
            r={RADIUS}
            fill="none"
            stroke="currentColor"
            strokeWidth="8"
          />
          <motion.circle
            cx="90"
            cy="90"
            r={RADIUS}
            fill="none"
            stroke={ringColor}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            animate={{ strokeDashoffset: dashOffset }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            style={{
              filter: `drop-shadow(0 0 6px ${ringColor}aa)`,
            }}
          />
        </svg>

        <div className="absolute inset-0 grid place-content-center text-center">
          <AnimatePresence mode="popLayout">
            <motion.div
              key={format(remaining)}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
              className="font-display text-4xl font-bold tabular-nums tracking-tight text-ink"
            >
              {format(remaining)}
            </motion.div>
          </AnimatePresence>
          <p className="mt-1 text-[11px] font-medium uppercase tracking-widest text-ink-400">
            {remaining === 0
              ? "Complete"
              : running
                ? isFocus
                  ? "Stay focused"
                  : "Recharge"
                : "Ready"}
          </p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-3">
        <button
          onClick={reset}
          className="grid h-11 w-11 place-items-center rounded-xl border border-line bg-surface-2 text-ink-500 transition hover:bg-surface-2 hover:text-ink active:scale-95"
          aria-label="Reset timer"
        >
          <RotateCcw className="h-[18px] w-[18px]" />
        </button>

        <button
          onClick={() => setRunning((r) => !r)}
          disabled={remaining === 0}
          className={cn(
            "flex h-12 items-center gap-2 rounded-xl px-7 font-semibold text-white transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40",
            "bg-gradient-to-r from-accent-500 to-accent hover:brightness-110",
          )}
        >
          {running ? (
            <>
              <Pause className="h-[18px] w-[18px]" />
              Pause
            </>
          ) : (
            <>
              <Play className="h-[18px] w-[18px]" />
              Start
            </>
          )}
        </button>
      </div>
    </GlassCard>
  );
}
