import { redirect } from "next/navigation";
import { Gauge } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui/PageHeader";
import { buildPerformance, canViewPerformance } from "@/lib/performance";
import { PerformanceBoard } from "./PerformanceBoard";

export const metadata = { title: "Performance — 2WayClick" };

export default async function PerformancePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // Manager tier only — same gate as Team Pulse.
  if (!canViewPerformance(user.role)) redirect("/dashboard");

  const report = await buildPerformance(user);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Performance"
        subtitle={
          report.scope === "company"
            ? `Task output and attendance across the company — last ${report.windowDays} days.`
            : `Task output and attendance for your team — last ${report.windowDays} days.`
        }
        icon={Gauge}
      />
      <PerformanceBoard report={report} />
    </div>
  );
}
