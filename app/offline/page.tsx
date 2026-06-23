import type { Metadata } from "next";
import { WifiOff } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { BRAND, pageTitle } from "@/lib/brand";
import { OfflineRetry } from "./OfflineRetry";

export const metadata: Metadata = {
  title: pageTitle("Offline"),
};

// Static fallback shown by the service worker when a navigation fails with no
// network. Kept dependency-free of auth/data so it can be precached and render
// fully offline. See public/sw.js.
export default function OfflinePage() {
  return (
    <main className="grid min-h-screen place-items-center bg-paper px-6 py-16">
      <div className="flex max-w-sm flex-col items-center text-center">
        <div className="mb-6">
          <Logo size="lg" />
        </div>

        <div className="mb-5 grid h-14 w-14 place-items-center rounded-2xl border border-line bg-surface-2 text-ink-400">
          <WifiOff className="h-6 w-6" />
        </div>

        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">
          You&apos;re offline
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-500">
          We couldn&apos;t reach the {BRAND.name} servers. Check your connection —
          your workspace will load again as soon as you&apos;re back online.
        </p>

        <div className="mt-7">
          <OfflineRetry />
        </div>
      </div>
    </main>
  );
}
