import type { Metadata } from "next";
import { Ban } from "lucide-react";
import { pageTitle } from "@/lib/brand";

export const metadata: Metadata = {
  title: pageTitle("Workspace unavailable"),
  robots: { index: false, follow: false },
};

// Static guard page shown when a request's subdomain resolves to a missing or
// suspended tenant. Lives OUTSIDE the (app) route group, so it needs no auth and
// no tenant context — a suspended tenant has no brand to show, so this stays
// brand-neutral. The (app) layout redirects here (see app/(app)/layout.tsx).
export default function SuspendedPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-paper px-6 py-16">
      <div className="glass w-full max-w-sm p-8 text-center">
        <div className="mb-5 grid h-14 w-14 place-items-center rounded-2xl border border-line bg-surface-2 text-ink-400 mx-auto">
          <Ban className="h-6 w-6" />
        </div>

        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">
          This workspace is unavailable
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-500">
          This workspace has been suspended. Contact your administrator.
        </p>
      </div>
    </main>
  );
}
