import { LayoutGrid } from "lucide-react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { adminDb } from "@/lib/db";
import { INTEGRATIONS, resolveLink, type IntegrationState } from "@/lib/integrations";
import { PageHeader } from "@/components/ui/PageHeader";
import { AppsGrid } from "@/app/(app)/tools/AppsGrid";
import { QuickLinks } from "@/app/(app)/tools/QuickLinks";
import { FocusTimer } from "@/app/(app)/tools/FocusTimer";
import { TodayPanel } from "@/app/(app)/tools/TodayPanel";

export const metadata = {
  title: "Tools",
};

export default async function SystemToolsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.isSystemOwner) redirect("/dashboard");

  const [peopleCount, docCount] = await Promise.all([
    adminDb.user.count(),
    adminDb.document.count(),
  ]);

  const integrations: IntegrationState[] = INTEGRATIONS.map((def) => ({
    ...def,
    enabled: false,
    workspaceUrl: null,
    connected: false,
    config: null,
    ...resolveLink(def, { workspaceUrl: null, connected: false }),
  }));

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Tools"
        subtitle="Platform launchpad"
        icon={LayoutGrid}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <AppsGrid integrations={integrations} canManage={false} />
          <QuickLinks
            peopleCount={peopleCount}
            docCount={docCount}
            canSeeDirectory={false}
          />
        </div>

        <div className="space-y-6">
          <FocusTimer />
          <TodayPanel firstName={user.name?.split(" ")[0] ?? "there"} />
        </div>
      </div>
    </div>
  );
}
