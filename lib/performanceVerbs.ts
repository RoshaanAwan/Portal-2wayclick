// Client-safe activity vocabulary, shared by the server report builder
// (lib/performance.ts) and the client board (PerformanceBoard.tsx).
//
// Kept in its own module — with NO server-only imports — so the client bundle
// can use these constants without pulling in lib/performance.ts, which is
// `server-only` and imports `db` (→ next/headers).

// The verbs we recognise, in the order we want to show them. Anything else is
// bucketed under "other" so the totals always reconcile.
export const ACTIVITY_VERBS = [
  "created",
  "updated",
  "assigned",
  "commented",
  "posted",
  "uploaded",
  "requested",
  "approved",
  "denied",
  "deleted",
  "joined",
] as const;

export type ActivityVerbKey = (typeof ACTIVITY_VERBS)[number] | "other";
