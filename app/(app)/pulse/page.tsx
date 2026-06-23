import { redirect } from "next/navigation";
import { Activity } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui/PageHeader";
import { buildTeamPulse, canViewTeamPulse } from "@/lib/teamPulse";
import { pageTitle } from "@/lib/brand";
import { PulseBoard } from "./PulseBoard";

export const metadata = { title: pageTitle("Team Pulse") };

export default async function PulsePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // Manager tier only — everyone below doesn't manage anyone.
  if (!canViewTeamPulse(user.role)) redirect("/dashboard");

  const pulse = await buildTeamPulse(user);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Team Pulse"
        subtitle={
          pulse.scope === "company"
            ? "Live capacity across the company — who's out, who's stretched, who's free."
            : "Live capacity for your team — who's out, who's stretched, who's free."
        }
        icon={Activity}
      />
      <PulseBoard pulse={pulse} />
    </div>
  );
}
