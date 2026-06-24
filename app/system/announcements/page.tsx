import { Megaphone } from "lucide-react";
import { redirect } from "next/navigation";
import { requireSystemOwner } from "@/lib/auth";
import { adminDb } from "@/lib/db";
import { PageHeader } from "@/components/ui/PageHeader";
import { SystemAnnouncementsClient } from "./SystemAnnouncementsClient";

export const metadata = { title: "Platform Announcements" };

export default async function SystemAnnouncementsPage() {
  const actor = await requireSystemOwner().catch(() => null);
  if (!actor) redirect("/login");

  const announcements = await adminDb.announcement.findMany({
    where: { tenantId: null },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      body: true,
      category: true,
      coverColor: true,
      createdAt: true,
      authorName: true,
    },
  });

  return (
    <div>
      <PageHeader
        icon={Megaphone}
        title="Platform Announcements"
        subtitle="Post platform-wide notices that appear pinned in every tenant's feed."
      />
      <SystemAnnouncementsClient
        announcements={announcements.map((a) => ({
          ...a,
          createdAt: a.createdAt.toISOString(),
          authorName: a.authorName ?? actor.name,
        }))}
        actorName={actor.name}
      />
    </div>
  );
}
