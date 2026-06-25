"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Check,
  Loader2,
  ExternalLink,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  Users,
  Clock,
} from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

interface PlanRow {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  currency: string;
  interval: string;
  trialDays: number;
  maxUsers: number | null;
  features: string[];
}

function money(cents: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(cents / 100);
  } catch {
    return `${currency.toUpperCase()} ${(cents / 100).toFixed(0)}`;
  }
}

// Map Stripe's subscription status to a friendly label + tone.
function statusBadge(status: string | null): { label: string; tone: string } | null {
  switch (status) {
    case "active":
      return { label: "Active", tone: "bg-success/15 text-success" };
    case "trialing":
      return { label: "Trial", tone: "bg-accent-soft text-accent-ink" };
    case "past_due":
      return { label: "Past due", tone: "bg-amber-400/15 text-amber-700 dark:text-amber-300" };
    case "canceled":
      return { label: "Canceled", tone: "bg-danger-soft text-danger" };
    case "incomplete":
    case "unpaid":
      return { label: "Payment needed", tone: "bg-amber-400/15 text-amber-700 dark:text-amber-300" };
    default:
      return status ? { label: status, tone: "bg-surface-2 text-ink-400" } : null;
  }
}

export function BillingClient({
  plans,
  stripeReady,
  currentPlanName,
  subscriptionStatus,
  currentPeriodEnd,
  hasSubscription,
  activePlanId,
}: {
  plans: PlanRow[];
  stripeReady: boolean;
  currentPlanName: string | null;
  subscriptionStatus: string | null;
  currentPeriodEnd: string | null;
  hasSubscription: boolean;
  activePlanId: string | null;
}) {
  const params = useSearchParams();
  const returned = params.get("status"); // "success" | "canceled" after Checkout
  const [busyId, setBusyId] = useState<string | null>(null);
  const [portalBusy, setPortalBusy] = useState(false);
  const [error, setError] = useState("");

  const badge = statusBadge(subscriptionStatus);
  const periodEnd = currentPeriodEnd ? new Date(currentPeriodEnd) : null;

  // Whether the workspace already has a live plan (anything but a clean slate).
  const isSubscribed = !!activePlanId && subscriptionStatus !== "canceled";

  // Highlight the priciest active plan as "Most popular" — but never override the
  // user's current plan as the highlighted one (their own plan reads as Current).
  const topPlanId = plans.reduce<{ id: string | null; cents: number }>(
    (acc, p) => (p.priceCents > acc.cents ? { id: p.id, cents: p.priceCents } : acc),
    { id: null, cents: -1 },
  ).id;

  async function subscribe(planId: string) {
    setBusyId(planId);
    setError("");
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) {
        setError(data.error || "Could not start checkout");
        setBusyId(null);
        return;
      }
      window.location.href = data.url; // hosted Stripe Checkout
    } catch {
      setError("Could not start checkout");
      setBusyId(null);
    }
  }

  async function openPortal() {
    setPortalBusy(true);
    setError("");
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) {
        setError(data.error || "Could not open billing portal");
        setPortalBusy(false);
        return;
      }
      window.location.href = data.url;
    } catch {
      setError("Could not open billing portal");
      setPortalBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* Status / config banners */}
      <div className="space-y-3">
        {returned === "success" && (
          <div className="flex items-start gap-2.5 rounded-xl border border-success/40 bg-success/10 px-3.5 py-2.5 text-sm text-success">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <span>Thanks! Your subscription is being activated — it may take a moment to reflect below.</span>
          </div>
        )}
        {returned === "canceled" && (
          <div className="flex items-start gap-2.5 rounded-xl border border-line bg-surface-2 px-3.5 py-2.5 text-sm text-ink-500">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>Checkout canceled — no charge was made.</span>
          </div>
        )}
        {!stripeReady && (
          <div className="flex items-start gap-2.5 rounded-xl border border-amber-400/40 bg-amber-400/10 px-3.5 py-2.5 text-sm text-amber-700 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>Billing isn’t set up on this platform yet. Please check back later.</span>
          </div>
        )}
        {error && (
          <p className="rounded-xl border border-danger/40 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</p>
        )}
      </div>

      {/* Current subscription — only meaningful once a plan exists. */}
      {isSubscribed && (
        <GlassCard hover={false} className="border-accent/30 bg-accent-soft/40">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent-grad text-white">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-ink-400">Current plan</p>
                <div className="mt-0.5 flex items-center gap-2">
                  <p className="text-lg font-semibold text-ink">{currentPlanName ?? "No plan"}</p>
                  {badge && (
                    <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${badge.tone}`}>{badge.label}</span>
                  )}
                </div>
                {periodEnd && (
                  <p className="mt-0.5 text-xs text-ink-400">
                    {subscriptionStatus === "canceled" ? "Access until" : "Renews"}{" "}
                    {periodEnd.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
                  </p>
                )}
              </div>
            </div>
            {hasSubscription && (
              <Button variant="glass" onClick={openPortal} loading={portalBusy}>
                <ExternalLink className="h-4 w-4" /> Manage subscription
              </Button>
            )}
          </div>
        </GlassCard>
      )}

      {/* Pricing hero — shown when choosing/upgrading a plan. */}
      <div className="text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent-soft px-3 py-1 text-xs font-semibold text-accent-ink">
          <Sparkles className="h-3.5 w-3.5" />
          {isSubscribed ? "Change your plan" : "Pricing"}
        </span>
        <h2 className="mt-3 font-display text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
          {isSubscribed ? "Switch to the plan that fits" : "Choose the plan that fits your team"}
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-ink-500">
          Simple, transparent pricing. Cancel or change anytime from the billing portal.
        </p>
      </div>

      {/* Plan catalog */}
      {plans.length === 0 ? (
        <GlassCard hover={false} className="py-12 text-center">
          <p className="text-sm text-ink-400">No plans are available right now.</p>
        </GlassCard>
      ) : (
        <div
          className={cn(
            "mx-auto grid max-w-5xl items-start gap-6",
            plans.length === 1 && "max-w-sm grid-cols-1",
            plans.length === 2 && "max-w-3xl grid-cols-1 sm:grid-cols-2",
            plans.length >= 3 && "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
          )}
        >
          {plans.map((p) => {
            const isCurrent = p.id === activePlanId;
            // Spotlight the top tier, unless the user is already on another plan.
            const isFeatured = p.id === topPlanId && !isCurrent;
            const ctaLabel = isCurrent
              ? "Current plan"
              : p.trialDays > 0
                ? "Start free trial"
                : "Subscribe";

            return (
              <div
                key={p.id}
                className={cn(
                  "relative flex flex-col rounded-2xl border bg-surface p-6 transition-shadow",
                  isCurrent
                    ? "border-accent ring-2 ring-accent"
                    : isFeatured
                      ? "border-accent/50 shadow-[0_8px_40px_-12px_rgb(var(--c-accent)/0.35)] sm:-mt-2 sm:mb-2"
                      : "border-line",
                )}
              >
                {/* Ribbon */}
                {(isFeatured || isCurrent) && (
                  <span
                    className={cn(
                      "absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-[11px] font-semibold shadow-sm",
                      isCurrent ? "bg-accent-soft text-accent-ink" : "bg-accent-grad text-white",
                    )}
                  >
                    {isCurrent ? "Your plan" : "Most popular"}
                  </span>
                )}

                <div className="mb-1 flex items-center gap-2">
                  <h3 className="text-lg font-semibold text-ink">{p.name}</h3>
                </div>
                {p.description && (
                  <p className="min-h-[2.5rem] text-sm text-ink-400">{p.description}</p>
                )}

                {/* Price */}
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-4xl font-bold tracking-tight text-ink">
                    {money(p.priceCents, p.currency)}
                  </span>
                  <span className="text-sm font-medium text-ink-400">/{p.interval}</span>
                </div>

                {/* Quick facts */}
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-surface-2 px-2.5 py-1 text-xs font-medium text-ink-600">
                    <Users className="h-3.5 w-3.5 text-ink-400" />
                    {p.maxUsers != null ? `Up to ${p.maxUsers} users` : "Unlimited users"}
                  </span>
                  {p.trialDays > 0 && (
                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-surface-2 px-2.5 py-1 text-xs font-medium text-ink-600">
                      <Clock className="h-3.5 w-3.5 text-ink-400" />
                      {p.trialDays}-day free trial
                    </span>
                  )}
                </div>

                {/* CTA up top so it aligns across cards regardless of feature count */}
                <Button
                  className="mt-5 w-full justify-center"
                  variant={isFeatured ? "primary" : "glass"}
                  disabled={!stripeReady || isCurrent || busyId !== null}
                  onClick={() => subscribe(p.id)}
                >
                  {busyId === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : ctaLabel}
                </Button>

                {/* Feature list */}
                {p.features.length > 0 && (
                  <>
                    <p className="mt-6 mb-3 text-xs font-semibold uppercase tracking-wide text-ink-400">
                      What’s included
                    </p>
                    <ul className="space-y-2.5 text-sm text-ink-600">
                      {p.features.map((f, i) => (
                        <li key={i} className="flex items-start gap-2.5">
                          <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full bg-success/15 text-success">
                            <Check className="h-3 w-3" strokeWidth={3} />
                          </span>
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
