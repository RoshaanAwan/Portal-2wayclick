import { LayoutGrid } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/PageHeader";
import { AppsGrid } from "./AppsGrid";
import { QuickLinks } from "./QuickLinks";
import { FocusTimer } from "./FocusTimer";
import { TodayPanel } from "./TodayPanel";

export const metadata = {
  title: "Tools · 2WayClick",
};

export default async function ToolsPage() {
  const user = await getCurrentUser();

  // Light-weight counts to make the launchpad feel alive.
  const [peopleCount, docCount] = await Promise.all([
    db.user.count(),
    db.document.count(),
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
          <AppsGrid />
          <QuickLinks peopleCount={peopleCount} docCount={docCount} />
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
