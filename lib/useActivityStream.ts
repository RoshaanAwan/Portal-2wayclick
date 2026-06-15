"use client";

import { useEffect, useRef, useState } from "react";
import type { FeedItem } from "@/app/(app)/dashboard/PulseFeed";

// Client store for the Live Activity Wall. Seeds from the server-rendered feed,
// then opens an SSE stream so new activity arrives live and animates in. Mirrors
// useNotifications(), but the channel is company-wide and read-only (no
// read-state to persist — it's a feed, not an inbox).

export function useActivityStream(initial: FeedItem[], cap = 12) {
  const [items, setItems] = useState<FeedItem[]>(initial);
  // How many entries arrived live since mount — drives the "+N new" pulse.
  const [liveCount, setLiveCount] = useState(0);
  // Guard against duplicate ids (e.g. an event that races a fast first paint).
  const seen = useRef<Set<string>>(new Set(initial.map((i) => i.id)));

  useEffect(() => {
    const es = new EventSource("/api/activity/stream");
    es.addEventListener("activity", (ev) => {
      try {
        const item: FeedItem = JSON.parse((ev as MessageEvent).data);
        if (seen.current.has(item.id)) return;
        seen.current.add(item.id);
        setItems((prev) => [item, ...prev].slice(0, cap));
        setLiveCount((c) => c + 1);
      } catch {
        // ignore malformed frames
      }
    });
    // On error EventSource auto-reconnects; nothing to do but let it.
    return () => es.close();
  }, [cap]);

  return { items, liveCount };
}
