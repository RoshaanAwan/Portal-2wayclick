"use client";

import { useEffect, useRef } from "react";

// ── Polling primitive ─────────────────────────────────────────────────────────
// Calls `fn` on an interval, but only while the tab is visible — a backgrounded
// tab stops hitting the DB and resumes (with an immediate catch-up call) when the
// user returns. `fn` is held in a ref so callers don't need to memoize it. The
// loop self-schedules AFTER each call settles, so a slow request can't stack up
// overlapping polls.
//
// This is the always-on FALLBACK transport for live updates. The primary live
// path is a Web Push nudge: the service worker postMessages open tabs the moment
// a push lands, and each consumer pulls its `?cursor=` endpoint once, right then
// (see useNotifications / useActivityStream). Polling underneath only catches
// what push misses (user hasn't enabled push, push hiccup, no HTTPS in dev), so
// it ramps down to a slow cadence and mostly sits idle.

/** Fast cadence used right after activity — reads "near-instant" for a company
 *  portal. Polling RAMPS DOWN from here toward POLL_INTERVAL_MAX_MS the longer
 *  nothing new arrives (see the adaptive backoff in usePolling), so this fast
 *  rate is only paid when there's actually something happening. */
export const POLL_INTERVAL_MS = 6000;

/** Slowest cadence the adaptive backoff ramps to while the user sits idle-ish on
 *  a page with no new data. Raised to 60s because polling is now a fallback —
 *  Web Push carries the live updates, so an open tab making ~1 call/60s is purely
 *  a safety net for users without push. This is the bulk of the call-volume
 *  reduction. */
export const POLL_INTERVAL_MAX_MS = 60_000;

/** After this much wall-clock with NO user interaction (and even while the tab is
 *  still visible), polling pauses entirely — an open-but-ignored tab shouldn't
 *  keep hitting Neon at all. Any mouse/key/scroll/touch resumes it (at the fast
 *  cadence again) with an immediate catch-up poll. */
export const IDLE_PAUSE_MS = 60_000;

/**
 * Transport switch. "poll" (default) works everywhere including Vercel
 * serverless. "sse" is an ADDITIVE faster path layered on top of polling (which
 * ALWAYS runs); the client dedupes, so enabling it never disables or duplicates
 * updates. Use "sse" only on a single long-running host (DigitalOcean) — the
 * in-process bus can't cross Vercel instances.
 */
export const REALTIME_TRANSPORT =
  (process.env.NEXT_PUBLIC_REALTIME_TRANSPORT as "poll" | "sse" | undefined) ??
  "poll";

/**
 * Adaptive polling primitive.
 *
 * Calls `fn` on a self-tuning interval that ADAPTS to what's happening, so the
 * fast cadence is only paid when there's a reason to:
 *   • starts at `minMs` (fast, near-instant),
 *   • each tick that returns falsy ("nothing new") DOUBLES the next delay, up to
 *     `maxMs` — so a quiet page ramps 6s → 12s → 24s → 30s and mostly sits there,
 *   • any tick that returns `true` ("got new data") snaps back to `minMs`, and
 *   • any user interaction also snaps back to fast (you're active → stay live).
 *
 * On top of that it skips work while the tab is hidden, pauses entirely after
 * `IDLE_PAUSE_MS` of no interaction, and fires an immediate catch-up poll when
 * the user returns. Net effect: a logged-in but idle user generates ~1 call per
 * 60s instead of 10/min, while the Web Push nudge delivers actual new data
 * near-instantly regardless of where the poll loop currently sits.
 *
 * `fn` may return a boolean (or a Promise of one): `true` = new data arrived
 * (reset to fast). Returning nothing is treated as "no new data" (ramp down), so
 * the signal is optional and old call sites still work — they just won't get the
 * snap-back-on-data behaviour.
 */
export function usePolling(
  fn: () => boolean | void | Promise<boolean | void>,
  minMs: number = POLL_INTERVAL_MS,
  enabled: boolean = true,
  maxMs: number = POLL_INTERVAL_MAX_MS,
) {
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    if (!enabled) return;

    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    // Current backoff delay; starts fast and ramps toward maxMs while quiet.
    let delay = minMs;
    // Wall-clock of the last user interaction. performance.now() is monotonic and
    // doesn't need the disallowed argless Date; it's only used as a relative idle
    // measure, so the absolute origin doesn't matter.
    let lastActivity = performance.now();
    const isIdle = () => performance.now() - lastActivity > IDLE_PAUSE_MS;

    // Run fn once and adjust the next delay from its result. `eager` callers
    // (interaction / focus / new data) want to reset to fast first.
    const runOnce = async () => {
      try {
        const gotNew = await fnRef.current();
        // New data → go fast again; nothing new → back off (capped at maxMs).
        delay = gotNew ? minMs : Math.min(delay * 2, maxMs);
      } catch {
        // Error → don't hammer; back off like an empty tick.
        delay = Math.min(delay * 2, maxMs);
      }
    };

    const schedule = () => {
      if (stopped) return;
      timer = setTimeout(tick, delay);
    };

    const tick = async () => {
      if (stopped) return;
      // Skip the DB hit while the tab is hidden OR the user has been idle past
      // the threshold — an open-but-ignored tab shouldn't keep polling. Both the
      // visibilitychange and the activity handlers fire an immediate catch-up
      // when the user comes back, so nothing is lost, only deferred.
      if (document.visibilityState === "visible" && !isIdle()) {
        await runOnce();
      }
      schedule();
    };

    // Snap back to the fast cadence and poll right now (used on focus + the first
    // interaction after going idle). Clears any pending slow timer so the reset
    // takes effect immediately.
    const resetFastAndPoll = () => {
      if (stopped) return;
      delay = minMs;
      lastActivity = performance.now();
      if (timer) clearTimeout(timer);
      void (async () => {
        await runOnce();
        schedule();
      })();
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") resetFastAndPoll();
    };

    // Resume ONLY from a true idle pause. High-frequency events (mousemove,
    // scroll) just stamp lastActivity so the idle timer keeps resetting; they must
    // NOT trigger a poll, or a single mouse drag fires a burst of immediate
    // fetches. We also deliberately do NOT snap an already-running but backed-off
    // loop to fast on mere movement — with Web Push carrying live updates, an
    // active-but-quiet page should stay on the slow fallback cadence. Only a
    // genuine resume-from-idle does a catch-up poll.
    const onActivity = () => {
      const wasIdle = isIdle();
      lastActivity = performance.now();
      if (wasIdle && !stopped && document.visibilityState === "visible") {
        resetFastAndPoll();
      }
    };
    const activityEvents = [
      "mousemove",
      "mousedown",
      "keydown",
      "scroll",
      "touchstart",
      "focus",
    ] as const;

    document.addEventListener("visibilitychange", onVisible);
    activityEvents.forEach((ev) =>
      window.addEventListener(ev, onActivity, { passive: true }),
    );
    // Kick off immediately so the first update doesn't wait a full interval.
    void tick();

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      activityEvents.forEach((ev) => window.removeEventListener(ev, onActivity));
    };
  }, [minMs, maxMs, enabled]);
}
