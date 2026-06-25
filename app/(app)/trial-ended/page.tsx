import Link from "next/link";
import { redirect } from "next/navigation";
import { Lock, ArrowRight } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getTenantAccess } from "@/lib/billing";

export const metadata = { title: "Free trial ended" };

// Shown when a workspace's free trial has lapsed with no active subscription.
// The (app) layout redirects every other route here while access is gated; this
// page itself is gate-exempt so the Company Owner can reach the Subscribe CTA.
// If access has since been restored (they subscribed), bounce back to the app.
export default async function TrialEndedPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.isSystemOwner) redirect("/system/tenants");

  const access = await getTenantAccess(user.tenantId);
  // Trial active again / subscribed → nothing to gate; return to the workspace.
  if (access.hasAccess) redirect("/dashboard");

  const isOwner = can.manageBilling(user.role);

  return (
    <main className="grid min-h-[70vh] place-items-center px-6 py-16">
      <div className="glass w-full max-w-md p-8 text-center">
        <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl border border-line bg-surface-2 text-ink-400">
          <Lock className="h-6 w-6" />
        </div>

        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">
          Your free trial has ended
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-500">
          {isOwner
            ? "Subscribe to a plan to restore access to your workspace and keep your team working."
            : "Access is paused until your workspace owner subscribes to a plan. Please contact your administrator."}
        </p>

        {isOwner && (
          <Link
            href="/billing"
            className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-accent-grad px-5 py-2.5 text-sm font-semibold text-white hover:brightness-[1.05] active:brightness-95"
          >
            View plans &amp; subscribe
            <ArrowRight className="h-4 w-4" />
          </Link>
        )}
      </div>
    </main>
  );
}
