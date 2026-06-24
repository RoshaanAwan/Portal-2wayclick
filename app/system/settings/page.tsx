import { Settings } from "lucide-react";
import { redirect } from "next/navigation";
import { requireSystemOwner } from "@/lib/auth";
import { adminDb } from "@/lib/db";
import { PageHeader } from "@/components/ui/PageHeader";
import { SystemSettingsClient } from "./SystemSettingsClient";

export const metadata = { title: "Settings" };

export default async function SystemSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ drive_connected?: string; drive_error?: string }>;
}) {
  const actor = await requireSystemOwner().catch(() => null);
  if (!actor) redirect("/login");

  const sp = await searchParams;

  const driveConn = await adminDb.googleDriveConnection.findUnique({
    where: { userId: actor.id },
    select: { googleEmail: true },
  });

  return (
    <div>
      <PageHeader
        icon={Settings}
        title="Settings"
        subtitle="Update your System Owner account details."
      />
      <SystemSettingsClient
        initialName={actor.name}
        email={actor.email}
        initialAvatarUrl={actor.avatarUrl ?? null}
        driveEmail={driveConn?.googleEmail ?? null}
        driveJustConnected={sp.drive_connected === "1"}
        driveError={sp.drive_error ?? null}
      />
    </div>
  );
}
