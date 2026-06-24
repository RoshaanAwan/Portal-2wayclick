import { LayoutGrid } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { isAdminTier, can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { getIntegrationStates } from "@/lib/integrationsServer";
import { PageHeader } from "@/components/ui/PageHeader";
import { AppsGrid } from "./AppsGrid";
import { QuickLinks } from "./QuickLinks";
import { FocusTimer } from "./FocusTimer";
import { TodayPanel } from "./TodayPanel";

export const metadata = {
  title: "Tools",
};

export default async function ToolsPage() {
  const user = await getCurrentUser();

  // Light-weight counts to make the launchpad feel alive.
  const [peopleCount, docCount, integrations] = await Promise.all([
    db.user.count(),
    db.document.count(),
    getIntegrationStates(),
  ]);

  const firstName = user?.name?.split(" ")[0] ?? "there";

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Tools"
        subtitle="Your launchpad"
        icon={LayoutGrid}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Main column — apps + quick links */}
        <div className="space-y-6 lg:col-span-2">
          <AppsGrid
            integrations={integrations}
            canManage={can.manageIntegrations(user?.role)}
          />
          <QuickLinks
            peopleCount={peopleCount}
            docCount={docCount}
            canSeeDirectory={isAdminTier(user?.role)}
          />
        </div>

        {/* Side column — focus timer + today */}
        <div className="space-y-6">
          <FocusTimer />
          <TodayPanel firstName={firstName} />
        </div>
      </div>
    </div>
  );
}
