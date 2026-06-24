import { Package } from "lucide-react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listPlans } from "@/lib/plans";
import { isStripeConfigured } from "@/lib/stripe";
import { PageHeader } from "@/components/ui/PageHeader";
import { PlansClient } from "./PlansClient";

export const metadata = { title: "Plans" };

// System Owner only: define the subscription packages tenants can buy. Each plan
// mirrors a Stripe Product + recurring Price.
export default async function SystemPlansPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.isSystemOwner) redirect("/dashboard");

  const plans = await listPlans();
  const stripeReady = isStripeConfigured();

  return (
    <div>
      <PageHeader
        title="Plans"
        subtitle="Create the subscription packages your tenants can subscribe to."
        icon={Package}
      />
      <PlansClient
        stripeReady={stripeReady}
        plans={plans.map((p) => ({
          ...p,
          createdAt: p.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
