"use client";

import { RefreshCw } from "lucide-react";

/** Retry button on the offline page — just reloads the current document. */
export function OfflineRetry() {
  return (
    <button
      onClick={() => window.location.reload()}
      className="inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
    >
      <RefreshCw className="h-4 w-4" />
      Try again
    </button>
  );
}
