import { CreditCard } from "lucide-react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { listSellablePlans, getPlan } from "@/lib/plans";
import { getTenantBilling, getSeatUsage } from "@/lib/billing";
import { isStripeConfigured } from "@/lib/stripe";
import { PageHeader } from "@/components/ui/PageHeader";
import { BillingClient } from "./BillingClient";

export const metadata = { title: "Billing" };

// Company Owner only: see the available packages and the workspace's current
// subscription, subscribe via Stripe Checkout, or manage it via the portal.
export default async function BillingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // System Owners have no tenant identity; bounce them to their own shell.
  if (user.isSystemOwner) redirect("/system/plans");
  // Only the Company Owner manages billing.
  if (!can.manageBilling(user.role)) redirect("/dashboard");

  const [plans, billing, seats] = await Promise.all([
    listSellablePlans(),
    getTenantBilling(user.tenantId),
    getSeatUsage(user.tenantId),
  ]);

  // Resolve the current plan even if it's been archived (not in sellable list).
  const currentPlan = billing.planId ? await getPlan(billing.planId) : null;

  return (
    <div>
      <PageHeader
        title="Billing"
        subtitle="Manage your workspace subscription."
        icon={CreditCard}
      />
      <BillingClient
        stripeReady={isStripeConfigured()}
        currentPlanName={currentPlan?.name ?? billing.planName ?? null}
        currentPlanFeatures={currentPlan?.features ?? []}
        currentPlanPriceCents={currentPlan?.priceCents ?? null}
        currentPlanCurrency={currentPlan?.currency ?? null}
        currentPlanInterval={currentPlan?.interval ?? null}
        subscriptionStatus={billing.subscriptionStatus}
        currentPeriodEnd={billing.currentPeriodEnd ? billing.currentPeriodEnd.toISOString() : null}
        hasSubscription={billing.hasStripeCustomer}
        activePlanId={billing.planId}
        seatsUsed={seats.used}
        seatLimit={seats.limit}
        plans={plans.map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description,
          priceCents: p.priceCents,
          currency: p.currency,
          interval: p.interval,
          trialDays: p.trialDays,
          maxUsers: p.maxUsers,
          features: p.features,
        }))}
      />
    </div>
  );
}
