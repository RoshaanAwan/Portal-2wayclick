"use client";

import { useEffect, useRef } from "react";

// ── Polling primitive ─────────────────────────────────────────────────────────
// Calls `fn` on an interval, but only while the tab is visible — a backgrounded
// tab stops hitting the DB and resumes (with an immediate catch-up call) when the
// user returns. `fn` is held in a ref so callers don't need to memoize it. The
// loop self-schedules AFTER each call settles, so a slow request can't stack up
// overlapping polls.
//
// This is the serverless-safe transport for live updates: the in-process SSE bus
// can't cross Vercel instances, so each consumer polls a `?cursor=` endpoint
// instead. On a single long-running server (DigitalOcean) you can flip back to
// true SSE — see REALTIME_TRANSPORT.

/** Default cadence for live-feeling updates. 2.5s reads "instant" enough for
 *  chat/notifications without hammering Neon. */
export const POLL_INTERVAL_MS = 2500;

/**
 * Transport switch. "poll" (default) works everywhere including Vercel
 * serverless. Set NEXT_PUBLIC_REALTIME_TRANSPORT="sse" on a single-instance
 * long-running host (e.g. DigitalOcean) to use the in-process SSE streams
 * instead — the stream routes are still in the codebase.
 */
export const REALTIME_TRANSPORT =
  (process.env.NEXT_PUBLIC_REALTIME_TRANSPORT as "poll" | "sse" | undefined) ??
  "poll";

export function usePolling(
  fn: () => void | Promise<void>,
  intervalMs: number = POLL_INTERVAL_MS,
  enabled: boolean = true,
) {
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    if (!enabled) return;

    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      if (stopped) return;
      // Skip the DB hit entirely while hidden; the visibilitychange handler
      // fires an immediate catch-up when the tab comes back.
      if (document.visibilityState === "visible") {
        try {
          await fnRef.current();
        } catch {
          // swallow — next tick retries
        }
      }
      if (stopped) return;
      timer = setTimeout(tick, intervalMs);
    };

    const onVisible = () => {
      if (document.visibilityState === "visible" && !stopped) {
        // Came back to the tab — catch up right away instead of waiting out
        // the remaining interval.
        void fnRef.current();
      }
    };

    document.addEventListener("visibilitychange", onVisible);
    // Kick off immediately so the first update doesn't wait a full interval.
    void tick();

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [intervalMs, enabled]);
}
