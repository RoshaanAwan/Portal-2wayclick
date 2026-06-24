"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check, Loader2, ExternalLink, AlertTriangle, CheckCircle2 } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";

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
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(cents / 100);
  } catch {
    return `${currency.toUpperCase()} ${(cents / 100).toFixed(2)}`;
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
    <div className="space-y-5">
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

      {/* Current subscription summary */}
      <GlassCard hover={false}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-ink-400">Current plan</p>
            <div className="mt-1 flex items-center gap-2">
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
          {hasSubscription && (
            <Button variant="glass" onClick={openPortal} loading={portalBusy}>
              <ExternalLink className="h-4 w-4" /> Manage subscription
            </Button>
          )}
        </div>
      </GlassCard>

      {/* Plan catalog */}
      {plans.length === 0 ? (
        <GlassCard hover={false} className="py-12 text-center">
          <p className="text-sm text-ink-400">No plans are available right now.</p>
        </GlassCard>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {plans.map((p) => {
            const isCurrent = p.id === activePlanId;
            return (
              <GlassCard key={p.id} hover={false} className={isCurrent ? "ring-2 ring-accent" : ""}>
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-semibold text-ink">{p.name}</h3>
                  {isCurrent && (
                    <span className="rounded-md bg-accent-soft px-1.5 py-0.5 text-[11px] font-semibold text-accent-ink">Current</span>
                  )}
                </div>
                {p.description && <p className="mt-0.5 text-xs text-ink-400">{p.description}</p>}

                <p className="my-3 text-2xl font-bold text-ink">
                  {money(p.priceCents, p.currency)}
                  <span className="text-sm font-normal text-ink-400">/{p.interval}</span>
                </p>

                <ul className="mb-4 space-y-1.5 text-sm text-ink-600">
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 shrink-0 text-success" />
                    {p.maxUsers != null ? `Up to ${p.maxUsers} users` : "Unlimited users"}
                  </li>
                  {p.trialDays > 0 && (
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 shrink-0 text-success" />
                      {p.trialDays}-day free trial
                    </li>
                  )}
                  {p.features.map((f, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <Check className="h-4 w-4 shrink-0 text-success" />
                      {f}
                    </li>
                  ))}
                </ul>

                <Button
                  className="w-full justify-center"
                  disabled={!stripeReady || isCurrent || busyId !== null}
                  onClick={() => subscribe(p.id)}
                >
                  {busyId === p.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : isCurrent ? (
                    "Current plan"
                  ) : p.trialDays > 0 ? (
                    "Start free trial"
                  ) : (
                    "Subscribe"
                  )}
                </Button>
              </GlassCard>
            );
          })}
        </div>
      )}
    </div>
  );
}
