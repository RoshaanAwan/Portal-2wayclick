"use client";

import { useEffect, useState } from "react";
import Link from "./Link";
import { Sparkles, Clock, ArrowRight, X } from "lucide-react";

// Slim countdown shown across the top of the tenant shell while the workspace is
// inside its System-Owner-granted free trial (and has not yet subscribed). Only
// the Company Owner (canSubscribe) gets the "Subscribe" CTA; other users just see
// how long is left. Rendered from app/(app)/layout.tsx — the trial state is
// computed there so the access read happens once per request.
//
// Dismissible: the cross hides it and persists a timestamp in localStorage so it
// stays hidden for 24h (then reappears). EXCEPTION: on the final day (daysLeft<=0)
// it's not dismissible — you can't permanently bury "your trial ends today".

const DISMISS_KEY = "trial-banner-dismissed-at";
const HIDE_FOR_MS = 24 * 60 * 60 * 1000; // 1 day

export function TrialBanner({
  daysLeft,
  canSubscribe,
}: {
  daysLeft: number;
  canSubscribe: boolean;
}) {
  // The last day is non-dismissible (always show).
  const dismissible = daysLeft > 0;

  // Start hidden so SSR and the first client render agree (no flash / hydration
  // mismatch); reveal after mount once we've checked the saved dismissal.
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!dismissible) {
      setVisible(true);
      return;
    }
    const raw = localStorage.getItem(DISMISS_KEY);
    const dismissedAt = raw ? Number(raw) : 0;
    const stillHidden = dismissedAt && Date.now() - dismissedAt < HIDE_FOR_MS;
    setVisible(!stillHidden);
  }, [dismissible]);

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setVisible(false);
  }

  if (!visible) return null;

  // Ramp up urgency in the final stretch: warm/amber treatment in the last 3 days
  // (and on the final day), accent treatment otherwise.
  const urgent = daysLeft <= 3;

  const label =
    daysLeft <= 0
      ? "Your free trial ends today"
      : `${daysLeft} ${daysLeft === 1 ? "day" : "days"} left in your free trial`;

  const sub = canSubscribe
    ? "Subscribe to keep your workspace running without interruption."
    : "Ask your workspace owner to choose a plan before it ends.";

  return (
    <div
      className={
        "relative overflow-hidden rounded-b-2xl border-t " +
        (urgent
          ? "border-amber-400/30 bg-gradient-to-r from-amber-400/15 via-amber-400/5 to-transparent"
          : "border-accent/20 bg-gradient-to-r from-accent-soft via-accent-soft/60 to-transparent")
      }
    >
      {/* Soft glow accents on both ends */}
      <div
        aria-hidden
        className={
          "pointer-events-none absolute -left-12 -top-14 h-36 w-36 rounded-full blur-3xl " +
          (urgent ? "bg-amber-400/15" : "bg-accent/15")
        }
      />
      <div
        aria-hidden
        className={
          "pointer-events-none absolute -right-12 -bottom-14 h-36 w-36 rounded-full blur-3xl " +
          (urgent ? "bg-amber-400/20" : "bg-accent/20")
        }
      />
      <div className="relative mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-4 gap-y-2 px-4 py-2.5 pr-12 sm:justify-between sm:pr-12">
        <div className="flex items-center gap-2.5">
          <span
            className={
              "relative grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white shadow-sm " +
              (urgent ? "bg-amber-500" : "bg-accent-grad")
            }
          >
            {/* Pulsing ring to draw the eye on the final stretch. */}
            {urgent && (
              <span className="absolute inset-0 animate-ping rounded-lg bg-amber-500/40" />
            )}
            <Clock className="relative h-4 w-4" />
          </span>
          <div className="text-left">
            <p
              className={
                "text-sm font-semibold leading-tight " +
                (urgent ? "text-amber-700 dark:text-amber-300" : "text-accent-ink")
              }
            >
              {label}
            </p>
            <p className="hidden text-xs text-ink-500 sm:block">{sub}</p>
          </div>
        </div>

        {canSubscribe && (
          <Link
            href="/billing"
            className={
              "group inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-3.5 text-xs font-semibold text-white shadow-sm transition hover:brightness-[1.05] " +
              (urgent ? "bg-amber-500" : "bg-accent-grad")
            }
          >
            <Sparkles className="h-3.5 w-3.5" />
            {urgent ? "Subscribe now" : "View plans"}
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </Link>
        )}
      </div>

      {/* Dismiss — hides for 24h. Hidden on the final day (non-dismissible). */}
      {dismissible && (
        <button
          onClick={dismiss}
          aria-label="Dismiss for today"
          title="Hide for today"
          className={
            "absolute right-2.5 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-lg transition hover:bg-black/5 dark:hover:bg-white/10 " +
            (urgent
              ? "text-amber-700/70 hover:text-amber-700 dark:text-amber-300/70 dark:hover:text-amber-300"
              : "text-accent-ink/60 hover:text-accent-ink")
          }
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
