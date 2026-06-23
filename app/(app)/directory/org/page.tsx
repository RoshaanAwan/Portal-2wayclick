import { Network } from "lucide-react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isAdminTier } from "@/lib/permissions";
import { buildOrgChart } from "@/lib/orgChart";
import { PageHeader } from "@/components/ui/PageHeader";
import { OrgChart } from "./OrgChart";

export const metadata = {
  title: "Org Chart",
};

export default async function OrgChartPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Admin tier only (Super Admin + Admin). Hidden from HR, Lead, PM, Employee —
  // they reach the directory, but not the company-wide org/load view.
  if (!isAdminTier(user.role)) redirect("/directory");

  const roots = await buildOrgChart();

  return (
    <div className="mx-auto max-w-[100rem]">
      <PageHeader
        title="Org Chart"
        subtitle="The whole company at a glance — each ring shows how loaded that person is right now"
        icon={Network}
      />
      <OrgChart roots={roots} />
    </div>
  );
}
