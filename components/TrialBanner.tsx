import Link from "./Link";
import { Sparkles, Clock, ArrowRight } from "lucide-react";

// Slim countdown shown across the top of the tenant shell while the workspace is
// inside its System-Owner-granted free trial (and has not yet subscribed). Only
// the Company Owner (canSubscribe) gets the "Subscribe" CTA; other users just see
// how long is left. Rendered from app/(app)/layout.tsx — the trial state is
// computed there so the access read happens once per request.
export function TrialBanner({
  daysLeft,
  canSubscribe,
}: {
  daysLeft: number;
  canSubscribe: boolean;
}) {
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
        "relative overflow-hidden border-b " +
        (urgent
          ? "border-amber-400/30 bg-amber-400/10"
          : "border-accent/20 bg-accent-soft")
      }
    >
      {/* Soft glow accent on the right */}
      <div
        aria-hidden
        className={
          "pointer-events-none absolute -right-10 -top-12 h-32 w-32 rounded-full blur-3xl " +
          (urgent ? "bg-amber-400/20" : "bg-accent/20")
        }
      />
      <div className="relative mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-4 gap-y-2 px-4 py-2.5 sm:justify-between">
        <div className="flex items-center gap-2.5">
          <span
            className={
              "grid h-7 w-7 shrink-0 place-items-center rounded-lg text-white shadow-sm " +
              (urgent ? "bg-amber-500" : "bg-accent-grad")
            }
          >
            <Clock className="h-4 w-4" />
          </span>
          <div className="text-left">
            <p
              className={
                "text-sm font-semibold " +
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
              "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-3.5 text-xs font-semibold text-white shadow-sm transition hover:brightness-[1.05] " +
              (urgent ? "bg-amber-500" : "bg-accent-grad")
            }
          >
            <Sparkles className="h-3.5 w-3.5" />
            {urgent ? "Subscribe now" : "View plans"}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
    </div>
  );
}
