import { ScrollText } from "lucide-react";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui/PageHeader";
import { can } from "@/lib/permissions";
import { LogsClient, type AuditRow } from "./LogsClient";

export const metadata = { title: "Audit Log — 2WayClick" };

const PAGE_SIZE = 100;

export default async function AdminLogsPage() {
  const actor = await getCurrentUser();
  if (!actor) redirect("/login");
  // Audit log is Super Admin only.
  if (!can.viewAuditLog(actor.role)) redirect("/dashboard");

  const [logs, total] = await Promise.all([
    db.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
      include: {
        actor: { select: { avatarUrl: true } },
        targetUser: { select: { name: true } },
      },
    }),
    db.auditLog.count(),
  ]);

  const rows: AuditRow[] = logs.map((l) => ({
    id: l.id,
    actorName: l.actorName,
    actorRole: l.actorRole,
    actorAvatar: l.actor?.avatarUrl ?? null,
    action: l.action,
    entity: l.entity,
    entityId: l.entityId,
    summary: l.summary,
    detail: l.detail,
    ip: l.ip,
    targetName: l.targetUser?.name ?? null,
    createdAt: l.createdAt.toISOString(),
  }));

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Audit Log"
        subtitle={`Every privileged action, tracked. Showing the latest ${rows.length} of ${total}.`}
        icon={ScrollText}
      />
      <LogsClient logs={rows} />
    </div>
  );
}
