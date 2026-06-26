import Link from "./Link";
import { Clock } from "lucide-react";

// Slim countdown shown across the top of the tenant shell while the workspace is
// inside its System-Owner-granted free trial (and has not yet subscribed). Only
// the Company Owner (canSubscribe) gets the "Subscribe now" link; other users
// just see how long is left. Rendered from app/(app)/layout.tsx — the trial state
// is computed there so the access read happens once per request.
export function TrialBanner({
  daysLeft,
  canSubscribe,
}: {
  daysLeft: number;
  canSubscribe: boolean;
}) {
  const label =
    daysLeft <= 0
      ? "Your free trial ends today"
      : `${daysLeft} ${daysLeft === 1 ? "day" : "days"} left in your free trial`;

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-accent/20 bg-accent-soft px-4 py-2 text-center text-sm text-accent-ink">
      <span className="inline-flex items-center gap-1.5">
        <Clock className="h-4 w-4 shrink-0" />
        {label}
      </span>
      {canSubscribe && (
        <Link
          href="/billing"
          className="font-semibold underline underline-offset-2 hover:opacity-80"
        >
          Subscribe now →
        </Link>
      )}
    </div>
  );
}
