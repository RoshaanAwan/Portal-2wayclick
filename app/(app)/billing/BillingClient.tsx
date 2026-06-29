"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Check,
  Loader2,
  ExternalLink,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  Users,
  Clock,
  CreditCard,
  ShieldCheck,
  ArrowUp,
  ArrowDown,
  CalendarClock,
  Wallet,
  X,
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

// The live subscription snapshot — seeded from the server render, then kept in
// sync by polling /api/billing/status after a Checkout redirect (so the plan
// flips to "active" the moment the Stripe webhook lands, with no manual reload).
interface ScheduledChange {
  planName: string | null;
  effectiveAt: string; // ISO — when the downgrade takes effect (renewal)
}

interface BillingSnapshot {
  planId: string | null;
  planName: string | null;
  subscriptionStatus: string | null;
  currentPeriodEnd: string | null;
  hasSubscription: boolean;
  seatsUsed: number;
  seatLimit: number | null;
  // A downgrade pending at renewal, if any — drives the "switching to X" badge.
  scheduledChange: ScheduledChange | null;
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

function fmtDate(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

const HEALTHY = new Set(["active", "trialing"]);

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
  jazzCashReady,
  currentPlanName,
  currentPlanFeatures,
  currentPlanPriceCents,
  currentPlanCurrency,
  currentPlanInterval,
  subscriptionStatus,
  currentPeriodEnd,
  hasSubscription,
  activePlanId,
  seatsUsed,
  seatLimit,
  scheduledChange,
}: {
  plans: PlanRow[];
  stripeReady: boolean;
  jazzCashReady: boolean;
  currentPlanName: string | null;
  currentPlanFeatures: string[];
  currentPlanPriceCents: number | null;
  currentPlanCurrency: string | null;
  currentPlanInterval: string | null;
  subscriptionStatus: string | null;
  currentPeriodEnd: string | null;
  hasSubscription: boolean;
  activePlanId: string | null;
  seatsUsed: number;
  seatLimit: number | null;
  scheduledChange: ScheduledChange | null;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const returned = params.get("status"); // "success" | "canceled" after Checkout
  const jazzcashReturned = params.get("jazzcash"); // "success" | "failed" after JazzCash

  const [busyId, setBusyId] = useState<string | null>(null);
  // The plan whose JazzCash payment is being started (kept separate from busyId so
  // the Stripe and JazzCash buttons on the same card spin independently).
  const [jazzBusyId, setJazzBusyId] = useState<string | null>(null);
  const [portalBusy, setPortalBusy] = useState(false);
  const [error, setError] = useState("");

  // Live snapshot, seeded from the server render. Polling keeps it current so the
  // plan activates in-place once Stripe confirms — see the effect below.
  const [snap, setSnap] = useState<BillingSnapshot>({
    planId: activePlanId,
    planName: currentPlanName,
    subscriptionStatus,
    currentPeriodEnd,
    hasSubscription,
    seatsUsed,
    seatLimit,
    scheduledChange,
  });

  // One-shot confirmation after the user schedules a downgrade in this session.
  // (The persistent badge below covers the across-reload case; this is the
  // immediate "got it" feedback right after they click.)
  const [downgradeNotice, setDowngradeNotice] = useState<ScheduledChange | null>(null);

  // True while we're waiting for the webhook to flip a fresh checkout to active.
  const healthy = HEALTHY.has(snap.subscriptionStatus ?? "");
  const [activating, setActivating] = useState(returned === "success" && !healthy);
  // The auto-poll ran its course without activation (webhook lag / misconfig).
  const [pollTimedOut, setPollTimedOut] = useState(false);
  const [rechecking, setRechecking] = useState(false);

  const badge = statusBadge(snap.subscriptionStatus);
  const periodEndLabel = fmtDate(snap.currentPeriodEnd);

  // Whether the workspace already has a live plan (anything but a clean slate).
  const isSubscribed = !!snap.planId && snap.subscriptionStatus !== "canceled";

  // Highlight the priciest active plan as "Most popular".
  const topPlanId = plans.reduce<{ id: string | null; cents: number }>(
    (acc, p) => (p.priceCents > acc.cents ? { id: p.id, cents: p.priceCents } : acc),
    { id: null, cents: -1 },
  ).id;

  // ── Poll for activation after a successful checkout ───────────────────────
  // Stripe redirects back before the webhook lands, so the plan looks unchanged.
  // Poll the status endpoint until it reports a healthy subscription (or we give
  // up), then refresh the server tree so seat caps / nav reflect the new plan.
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/billing/status", { cache: "no-store" });
      if (!res.ok) return null;
      const data = (await res.json()) as BillingSnapshot;
      setSnap(data);
      return data;
    } catch {
      return null;
    }
  }, []);

  // Authoritative check: ask the server to reconcile against Stripe directly
  // (not just re-read our DB). This is what actually recovers activation when the
  // webhook is delayed or misconfigured — see /api/billing/recheck.
  const reconcile = useCallback(async () => {
    try {
      const res = await fetch("/api/billing/recheck", { method: "POST" });
      if (!res.ok) return null;
      const data = (await res.json()) as BillingSnapshot;
      setSnap(data);
      return data;
    } catch {
      return null;
    }
  }, []);

  // After an UPGRADE confirmed on Stripe's portal (?status=upgraded), the
  // subscription was already active, so there's no "activation" to poll for — only
  // the new plan to pull in. The webhook updates planId, but it may not have landed
  // by the time Stripe redirects back, so reconcile once against Stripe directly
  // (which resolves the plan from the live price) and refresh the server tree.
  useEffect(() => {
    if (returned !== "upgraded") return;
    let cancelled = false;
    void (async () => {
      // The webhook is usually quick; a brief wait avoids a redundant Stripe call,
      // then reconcile is the authoritative pull if the DB hasn't caught up.
      const data = await reconcile();
      if (cancelled) return;
      if (data) router.refresh(); // pull fresh server data (plan, caps, nav)
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [returned]);

  // JazzCash already activated the plan server-side before redirecting here, so
  // there's nothing to poll — but the current snapshot/server tree may predate it.
  // Pull a fresh status once and refresh the server data (caps, nav, gate).
  useEffect(() => {
    if (jazzcashReturned !== "success") return;
    let cancelled = false;
    void (async () => {
      const data = await refresh();
      if (!cancelled && data) router.refresh();
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jazzcashReturned]);

  useEffect(() => {
    if (returned !== "success" || healthy) {
      setActivating(false);
      return;
    }
    setActivating(true);
    setPollTimedOut(false);
    let tries = 0;
    const tick = async () => {
      tries += 1;
      const data = await refresh();
      let nowHealthy = data && HEALTHY.has(data.subscriptionStatus ?? "");
      // Last attempt and still not active via the webhook → do one authoritative
      // reconcile straight against Stripe before giving up. Handles a delayed or
      // misconfigured webhook so most users never have to click "Check again".
      if (!nowHealthy && tries >= 20) {
        const rec = await reconcile();
        nowHealthy = !!rec && HEALTHY.has(rec.subscriptionStatus ?? "");
      }
      if (nowHealthy || tries >= 20) {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = null;
        setActivating(false);
        // Gave up without ever seeing a healthy status → the webhook is slow or
        // misconfigured. Surface a recheck path instead of silently stopping.
        if (!nowHealthy) setPollTimedOut(true);
        else router.refresh(); // activated — pull fresh server data (caps, nav)
      }
    };
    void tick();
    pollRef.current = setInterval(tick, 3000); // ~60s of polling at most
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [returned, healthy]);

  // Manual recheck when the auto-poll timed out (webhook lag / misconfig).
  // Reconciles directly against Stripe so it activates even if the webhook never
  // arrives.
  async function recheck() {
    setRechecking(true);
    const data = await reconcile();
    setRechecking(false);
    if (data && HEALTHY.has(data.subscriptionStatus ?? "")) {
      setPollTimedOut(false);
      router.refresh();
    }
  }

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

  // Change the plan on an existing subscription. The server decides direction:
  //   • UPGRADE  → responds with { redirectUrl } to Stripe's hosted confirm page,
  //     where the user OKs the prorated charge; we redirect there.
  //   • DOWNGRADE → applied in place (deferred to renewal); responds with the fresh
  //     snapshot, which we reflect without leaving the page.
  async function switchPlan(planId: string) {
    setBusyId(planId);
    setError("");
    try {
      const res = await fetch("/api/billing/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not switch plan");
        setBusyId(null);
        return;
      }
      if (data.redirectUrl) {
        window.location.href = data.redirectUrl; // Stripe portal confirm (upgrade)
        return; // keep busy state through the redirect
      }
      const next = data as BillingSnapshot;
      setSnap(next);
      // A downgrade was scheduled (deferred to renewal) — confirm it explicitly,
      // since the current-plan card deliberately still shows the plan they keep
      // until then.
      if (next.scheduledChange) setDowngradeNotice(next.scheduledChange);
      setBusyId(null);
      router.refresh(); // pull fresh server tree (seat caps, nav, features)
    } catch {
      setError("Could not switch plan");
      setBusyId(null);
    }
  }

  // Pay for one plan period with JazzCash. JazzCash needs a real cross-origin form
  // POST to its hosted page (a fetch can't render their payment UI), so we ask the
  // server for the signed pp_* fields, build a hidden form, and submit it — which
  // navigates the browser to JazzCash. On completion JazzCash POSTs the customer
  // back to our callback, which verifies + activates and redirects to ?jazzcash=…
  async function payWithJazzCash(planId: string) {
    setJazzBusyId(planId);
    setError("");
    try {
      const res = await fetch("/api/billing/jazzcash/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.endpoint || !data.fields) {
        setError(data.error || "Could not start JazzCash payment");
        setJazzBusyId(null);
        return;
      }
      const form = document.createElement("form");
      form.method = "POST";
      form.action = data.endpoint;
      for (const [name, value] of Object.entries(data.fields as Record<string, string>)) {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = name;
        input.value = value;
        form.appendChild(input);
      }
      document.body.appendChild(form);
      form.submit(); // navigates to JazzCash; keep the busy state through it
    } catch {
      setError("Could not start JazzCash payment");
      setJazzBusyId(null);
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

  const seatPct =
    snap.seatLimit && snap.seatLimit > 0
      ? Math.min(100, Math.round((snap.seatsUsed / snap.seatLimit) * 100))
      : null;

  return (
    <div className="space-y-8">
      {/* Status / config banners */}
      <div className="space-y-3">
        {returned === "success" && activating && (
          <div className="flex items-start gap-2.5 rounded-xl border border-accent/40 bg-accent-soft/60 px-3.5 py-2.5 text-sm text-accent-ink">
            <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" />
            <span>
              Payment received — activating your subscription. This usually takes a
              few seconds.
            </span>
          </div>
        )}
        {returned === "success" && !activating && healthy && (
          <div className="flex items-start gap-2.5 rounded-xl border border-success/40 bg-success/10 px-3.5 py-2.5 text-sm text-success">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <span>You’re all set — your subscription is active. Thanks for subscribing!</span>
          </div>
        )}
        {returned === "success" && !activating && !healthy && pollTimedOut && (
          <div className="flex flex-wrap items-start gap-2.5 rounded-xl border border-amber-400/40 bg-amber-400/10 px-3.5 py-2.5 text-sm text-amber-700 dark:text-amber-300">
            <Clock className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="flex-1">
              Your payment went through, but activation is taking longer than usual.
              It’ll update automatically — you can also check now.
            </span>
            <button
              onClick={recheck}
              disabled={rechecking}
              className="nm-button inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium text-ink-700 disabled:opacity-50"
            >
              {rechecking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Check again
            </button>
          </div>
        )}
        {returned === "canceled" && (
          <div className="flex items-start gap-2.5 rounded-xl border border-line bg-surface-2 px-3.5 py-2.5 text-sm text-ink-500">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>Checkout canceled — no charge was made.</span>
          </div>
        )}
        {jazzcashReturned === "success" && (
          <div className="flex items-start gap-2.5 rounded-xl border border-success/40 bg-success/10 px-3.5 py-2.5 text-sm text-success">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <span>JazzCash payment received — your plan is active. Thanks!</span>
          </div>
        )}
        {jazzcashReturned === "failed" && (
          <div className="flex items-start gap-2.5 rounded-xl border border-danger/40 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>JazzCash payment didn’t complete — no plan change was made. Please try again.</span>
          </div>
        )}
        {downgradeNotice && (
          <div className="flex items-start gap-2.5 rounded-xl border border-accent/40 bg-accent-soft/60 px-3.5 py-2.5 text-sm text-accent-ink">
            <CalendarClock className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="flex-1">
              Downgrade scheduled — you’ll move to{" "}
              <strong>{downgradeNotice.planName ?? "your new plan"}</strong> on{" "}
              <strong>{fmtDate(downgradeNotice.effectiveAt)}</strong>. You keep{" "}
              {snap.planName ?? "your current plan"} until then.
            </span>
            <button
              onClick={() => setDowngradeNotice(null)}
              className="shrink-0 rounded-md p-0.5 text-accent-ink/70 hover:bg-accent/10 hover:text-accent-ink"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        {!stripeReady && !jazzCashReady && (
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
      {(isSubscribed || activating) && (
        <div
          className={cn(
            "relative overflow-hidden rounded-2xl border p-6 transition-colors",
            healthy
              ? "border-success/40 bg-gradient-to-br from-success/10 via-surface to-surface"
              : "border-accent/30 bg-accent-soft/40",
          )}
        >
          {/* Soft glow accent */}
          <div
            aria-hidden
            className={cn(
              "pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full blur-3xl",
              healthy ? "bg-success/20" : "bg-accent/20",
            )}
          />
          <div className="relative flex flex-wrap items-start justify-between gap-5">
            <div className="flex items-start gap-3.5">
              <div
                className={cn(
                  "grid h-12 w-12 shrink-0 place-items-center rounded-xl text-white shadow-sm",
                  healthy ? "bg-success" : "bg-accent-grad",
                )}
              >
                {activating ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : healthy ? (
                  <ShieldCheck className="h-5 w-5" />
                ) : (
                  <CreditCard className="h-5 w-5" />
                )}
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-ink-400">
                  Current plan
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <p className="text-xl font-semibold text-ink">
                    {snap.planName ?? (activating ? "Activating…" : "No plan")}
                  </p>
                  {badge && (
                    <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${badge.tone}`}>
                      {badge.label}
                    </span>
                  )}
                  {activating && !badge && (
                    <span className="rounded-md bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent-ink">
                      Activating
                    </span>
                  )}
                </div>
                {currentPlanPriceCents != null && currentPlanCurrency && currentPlanInterval && (
                  <p className="mt-1.5 flex items-baseline gap-1">
                    <span className="text-2xl font-bold tracking-tight text-ink">
                      {money(currentPlanPriceCents, currentPlanCurrency)}
                    </span>
                    <span className="text-sm font-medium text-ink-400">/{currentPlanInterval}</span>
                  </p>
                )}
                {periodEndLabel && (
                  <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-ink-400">
                    <Clock className="h-3.5 w-3.5" />
                    {snap.subscriptionStatus === "canceled"
                      ? "Access until"
                      : snap.subscriptionStatus === "trialing"
                        ? "Trial ends"
                        : "Renews"}{" "}
                    {periodEndLabel}
                  </p>
                )}
                {/* Pending downgrade — persists across reloads (read from Stripe's
                    schedule). The tenant keeps THIS plan until the date shown. */}
                {snap.scheduledChange && (
                  <p className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-amber-400/15 px-2 py-1 text-xs font-medium text-amber-700 dark:text-amber-300">
                    <CalendarClock className="h-3.5 w-3.5 shrink-0" />
                    Switching to {snap.scheduledChange.planName ?? "your new plan"} on{" "}
                    {fmtDate(snap.scheduledChange.effectiveAt)}
                  </p>
                )}
              </div>
            </div>
            {snap.hasSubscription && (
              <Button variant="glass" onClick={openPortal} loading={portalBusy}>
                <ExternalLink className="h-4 w-4" /> Manage subscription
              </Button>
            )}
          </div>

          {/* Seat usage meter — only when a plan with a cap is active. */}
          {isSubscribed && seatPct != null && (
            <div className="relative mt-5 max-w-md">
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <span className="inline-flex items-center gap-1.5 font-medium text-ink-600">
                  <Users className="h-3.5 w-3.5 text-ink-400" /> Seats
                </span>
                <span className="text-ink-400">
                  {snap.seatsUsed} of {snap.seatLimit} used
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    seatPct >= 100 ? "bg-danger" : seatPct >= 80 ? "bg-amber-400" : "bg-accent-grad",
                  )}
                  style={{ width: `${seatPct}%` }}
                />
              </div>
              {seatPct >= 100 && (
                <p className="mt-1.5 text-xs text-danger">
                  You’ve reached your seat limit. Upgrade to add more users.
                </p>
              )}
            </div>
          )}
          {isSubscribed && seatPct == null && snap.seatLimit == null && (
            <p className="relative mt-4 inline-flex items-center gap-1.5 text-xs text-ink-400">
              <Users className="h-3.5 w-3.5" /> {snap.seatsUsed} users · unlimited seats
            </p>
          )}

          {/* What's included in the plan THIS workspace is subscribed to — the
              features the System Owner defined on that plan, nothing else. */}
          {isSubscribed && currentPlanFeatures.length > 0 && (
            <div className="relative mt-6 border-t border-line/70 pt-5">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-400">
                What’s included in your plan
              </p>
              <ul className="grid gap-x-6 gap-y-2.5 text-sm text-ink-600 sm:grid-cols-2">
                {currentPlanFeatures.map((f, i) => (
                  <li key={i} className="flex items-start gap-2.5">
                    <span
                      className={cn(
                        "mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full",
                        healthy ? "bg-success/15 text-success" : "bg-accent-soft text-accent-ink",
                      )}
                    >
                      <Check className="h-3 w-3" strokeWidth={3} />
                    </span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Pricing hero — shown when choosing/upgrading a plan. */}
      <div className="text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent-soft px-3 py-1 text-xs font-semibold text-accent-ink">
          <Sparkles className="h-3.5 w-3.5" />
          {isSubscribed ? "Change your plan" : "Pricing"}
        </span>
        <h2 className="mt-3 font-display text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
          {isSubscribed ? "Upgrade or downgrade anytime" : "Choose the plan that fits your team"}
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
            const isCurrent = p.id === snap.planId && isSubscribed;
            // This plan is the pending downgrade target (matched by name — that's
            // what the schedule resolves to). Show it as scheduled, not switchable.
            const isScheduled =
              !!snap.scheduledChange &&
              snap.scheduledChange.planName === p.name &&
              !isCurrent;
            // Spotlight the top tier, unless the user is already on another plan.
            const isFeatured = p.id === topPlanId && !isCurrent;
            // When already subscribed, a pricier plan is an upgrade and a cheaper
            // one a downgrade — relative to the plan they're currently on. Drives
            // the CTA label + arrow so "Switch" reads as up/down, not just sideways.
            const relation: "current" | "upgrade" | "downgrade" | "switch" | "new" =
              isCurrent
                ? "current"
                : !isSubscribed
                  ? "new"
                  : currentPlanPriceCents == null
                    ? "switch"
                    : p.priceCents > currentPlanPriceCents
                      ? "upgrade"
                      : p.priceCents < currentPlanPriceCents
                        ? "downgrade"
                        : "switch";
            const ctaLabel =
              relation === "current"
                ? "Current plan"
                : relation === "upgrade"
                  ? "Upgrade to this plan"
                  : relation === "downgrade"
                    ? "Downgrade to this plan"
                    : relation === "switch"
                      ? "Switch to this plan"
                      : p.trialDays > 0
                        ? "Start free trial"
                        : "Subscribe";

            return (
              <div
                key={p.id}
                className={cn(
                  "relative flex flex-col rounded-2xl border bg-surface p-6 transition-all duration-200",
                  isCurrent
                    ? "border-success ring-2 ring-success/60"
                    : isFeatured
                      ? "border-accent/50 shadow-[0_8px_40px_-12px_rgb(var(--c-accent)/0.35)] hover:shadow-[0_12px_48px_-12px_rgb(var(--c-accent)/0.45)] sm:-mt-2 sm:mb-2"
                      : "border-line hover:border-accent/40 hover:shadow-sm",
                )}
              >
                {/* Ribbon */}
                {(isFeatured || isCurrent) && (
                  <span
                    className={cn(
                      "absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-semibold shadow-sm",
                      isCurrent ? "bg-success text-white" : "bg-accent-grad text-white",
                    )}
                  >
                    {isCurrent ? (
                      <>
                        <Check className="h-3 w-3" strokeWidth={3} /> Your plan
                      </>
                    ) : (
                      "Most popular"
                    )}
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
                  <span className="bg-accent-grad bg-clip-text text-4xl font-bold tracking-tight text-transparent">
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
                  variant={
                    isCurrent
                      ? "glass"
                      : relation === "upgrade" || isFeatured
                        ? "primary"
                        : "glass"
                  }
                  disabled={!stripeReady || isCurrent || isScheduled || busyId !== null}
                  onClick={() => (isSubscribed ? switchPlan(p.id) : subscribe(p.id))}
                >
                  {busyId === p.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : isScheduled ? (
                    <>
                      <CalendarClock className="h-4 w-4" /> Scheduled
                    </>
                  ) : isCurrent ? (
                    <>
                      <Check className="h-4 w-4" strokeWidth={3} /> {ctaLabel}
                    </>
                  ) : relation === "upgrade" ? (
                    <>
                      <ArrowUp className="h-4 w-4" strokeWidth={2.5} /> {ctaLabel}
                    </>
                  ) : relation === "downgrade" ? (
                    <>
                      <ArrowDown className="h-4 w-4" strokeWidth={2.5} /> {ctaLabel}
                    </>
                  ) : (
                    ctaLabel
                  )}
                </Button>

                {/* JazzCash — pay one plan period via the local gateway (PKR). A
                    separate provider from Stripe; shown when configured and not the
                    current plan. Pay-per-period: it activates a fresh period for
                    this plan regardless of any existing subscription. */}
                {/* {jazzCashReady && !isCurrent && !isScheduled && (
                  <Button
                    className="mt-2.5 w-full justify-center"
                    variant="glass"
                    disabled={jazzBusyId !== null || busyId !== null}
                    onClick={() => payWithJazzCash(p.id)}
                  >
                    {jazzBusyId === p.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Wallet className="h-4 w-4" /> Pay with JazzCash
                      </>
                    )}
                  </Button>
                )} */}

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
