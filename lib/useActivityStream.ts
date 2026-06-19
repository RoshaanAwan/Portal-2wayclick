"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FeedItem } from "@/app/(app)/dashboard/PulseFeed";
import { usePolling, REALTIME_TRANSPORT } from "@/lib/usePolling";

// Client store for the Live Activity Wall. Seeds from the server-rendered feed,
// then keeps it live. Default transport is polling (serverless-safe); set
// NEXT_PUBLIC_REALTIME_TRANSPORT="sse" on a single long-running host to use the
// SSE stream. Company-wide and read-only — it's a feed, not an inbox.

export function useActivityStream(initial: FeedItem[], cap = 12) {
  const [items, setItems] = useState<FeedItem[]>(initial);
  // How many entries arrived live since mount — drives the "+N new" pulse.
  const [liveCount, setLiveCount] = useState(0);
  // Guard against duplicate ids (e.g. a poll batch that races a fast first paint).
  const seen = useRef<Set<string>>(new Set(initial.map((i) => i.id)));
  // Poll high-water mark: newest activity timestamp (initial is newest-first).
  const cursor = useRef<string | null>(initial[0]?.createdAt ?? null);

  const ingest = useCallback(
    (item: FeedItem) => {
      if (seen.current.has(item.id)) return;
      seen.current.add(item.id);
      setItems((prev) => [item, ...prev].slice(0, cap));
      setLiveCount((c) => c + 1);
    },
    [cap],
  );

  // ── Transport: polling (serverless-safe, default) ──────────────────────────
  usePolling(
    async () => {
      try {
        const url = cursor.current
          ? `/api/activity/since?cursor=${encodeURIComponent(cursor.current)}`
          : "/api/activity/since";
        const res = await fetch(url);
        if (!res.ok) return;
        const data = await res.json();
        if (data.cursor) cursor.current = data.cursor;
        // Server returns oldest-first; ingest in order so newest ends on top.
        (data.activities ?? []).forEach((a: FeedItem) => ingest(a));
      } catch {
        // next tick retries
      }
    },
    undefined,
    REALTIME_TRANSPORT === "poll",
  );

  // ── Transport: SSE (single long-running host) ──────────────────────────────
  useEffect(() => {
    if (REALTIME_TRANSPORT !== "sse") return;
    const es = new EventSource("/api/activity/stream");
    es.addEventListener("activity", (ev) => {
      try {
        ingest(JSON.parse((ev as MessageEvent).data));
      } catch {
        // ignore malformed frames
      }
    });
    return () => es.close();
  }, [ingest]);

  return { items, liveCount };
}
