import { ScrollText } from "lucide-react";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui/PageHeader";
import { can } from "@/lib/permissions";
import { auditActorScope } from "@/lib/audit";
import { LogsClient, type AuditRow } from "./LogsClient";

export const metadata = { title: "Audit Log — 2WayClick" };

const PAGE_SIZE = 100;

export default async function AdminLogsPage() {
  const actor = await getCurrentUser();
  if (!actor) redirect("/login");
  // Audit log: Super Admin, Admin, and Project Manager.
  if (!can.viewAuditLog(actor.role)) redirect("/dashboard");

  // Scope what they see: Super Admin → everything; Admin/PM → their own actions
  // plus those of anyone in their org subtree (by actor). null = not permitted.
  const scope = await auditActorScope(actor);
  if (scope === null) redirect("/dashboard");

  const [logs, total] = await Promise.all([
    db.auditLog.findMany({
      where: scope,
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
      include: {
        actor: { select: { avatarUrl: true } },
        targetUser: { select: { name: true } },
      },
    }),
    db.auditLog.count({ where: scope }),
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

  // Super Admin sees the whole company; Admin/PM see their team's activity.
  const isGlobal = actor.role === "SUPER_ADMIN";
  const scopeLabel = isGlobal
    ? "Every privileged action across the company"
    : "Privileged actions by you and your team";

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Audit Log"
        subtitle={`${scopeLabel}. Showing the latest ${rows.length} of ${total}.`}
        icon={ScrollText}
      />
      <LogsClient logs={rows} />
    </div>
  );
}
