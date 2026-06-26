import { Lock, Sparkles, ArrowRight } from "lucide-react";
import { redirect } from "next/navigation";
import Link from "@/components/Link";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { PLAN_FEATURES } from "@/lib/planFeatures";
import { GlassCard } from "@/components/ui/GlassCard";

export const metadata = { title: "Upgrade required" };

// Where blocked routes land when the tenant's plan doesn't include the feature.
// Explains what's missing and points the Company Owner to billing. Anyone may see
// this page (it's exempt from the entitlement gate in the app layout).
export default async function UpgradePage({
  searchParams,
}: {
  searchParams: Promise<{ feature?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { feature } = await searchParams;
  // Resolve the friendly label for the blocked feature, if we recognise the key.
  const label = feature
    ? (PLAN_FEATURES.find((f) => f.key === feature)?.label ?? null)
    : null;
  const canManageBilling = can.manageBilling(user.role);

  return (
    <div className="mx-auto max-w-lg py-12">
      <GlassCard hover={false} className="text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-accent-soft text-accent-ink">
          <Lock className="h-6 w-6" />
        </div>
        <h1 className="mt-5 font-display text-2xl font-semibold tracking-tight text-ink">
          {label ? `${label} isn’t in your plan` : "This feature isn’t in your plan"}
        </h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-ink-500">
          {canManageBilling
            ? "Upgrade your workspace plan to unlock this feature for your whole team."
            : "Your workspace plan doesn’t include this feature. Ask your workspace owner to upgrade."}
        </p>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {canManageBilling ? (
            <Link
              href="/billing"
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-accent-grad px-5 text-sm font-medium text-white transition hover:brightness-[1.05]"
            >
              <Sparkles className="h-4 w-4" /> View plans
            </Link>
          ) : null}
          <Link
            href="/dashboard"
            className="nm-button inline-flex h-10 items-center gap-2 rounded-xl px-5 text-sm font-medium text-ink-700 transition hover:text-ink"
          >
            Back to dashboard <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </GlassCard>
    </div>
  );
}
