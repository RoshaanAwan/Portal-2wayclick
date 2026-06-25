import { redirect } from "next/navigation";
import { Gauge } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  buildPerformance,
  canViewPerformance,
  normalizeFilters,
} from "@/lib/performance";
import { PerformanceBoard } from "./PerformanceBoard";

export const metadata = { title: "Performance" };

export default async function PerformancePage({
  searchParams,
}: {
  searchParams: Promise<{
    period?: string;
    year?: string;
    month?: string;
    user?: string;
  }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // Manager tier only — same gate as Team Pulse.
  if (!canViewPerformance(user.role)) redirect("/dashboard");

  const filters = normalizeFilters(await searchParams);
  const report = await buildPerformance(user, filters);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Performance"
        subtitle={
          report.scope === "company"
            ? `Work across every team — ${report.periodLabel}.`
            : `Your team's work — ${report.periodLabel}.`
        }
        icon={Gauge}
      />
      <PerformanceBoard report={report} />
    </div>
  );
}
