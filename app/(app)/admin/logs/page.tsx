import { ScrollText } from "lucide-react";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui/PageHeader";
import { can } from "@/lib/permissions";
import { auditActorScope } from "@/lib/audit";
import { LogsClient, type AuditRow } from "./LogsClient";

export const metadata = { title: "Audit Log" };

const PAGE_SIZE = 50;

export default async function AdminLogsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string; action?: string }>;
}) {
  const actor = await getCurrentUser();
  if (!actor) redirect("/login");
  // Audit log: Super Admin, Admin, and Project Manager.
  if (!can.viewAuditLog(actor.role)) redirect("/dashboard");

  // Scope what they see: Super Admin → everything; Admin/PM → their own actions
  // plus those of anyone in their org subtree (by actor). null = not permitted.
  const scope = await auditActorScope(actor);
  if (scope === null) redirect("/dashboard");

  const sp = await searchParams;

  // ── Filters (server-side, applied across the whole dataset) ────────────────
  const query = (sp.q ?? "").trim();
  const action = sp.action && sp.action !== "ALL" ? sp.action : null;

  const where: Prisma.AuditLogWhereInput = { ...scope };
  if (action) where.action = action;
  if (query) {
    // Search across the denormalized text columns. SQLite (dev) is
    // case-sensitive on `contains`; Postgres (prod) honors `mode`. Listing the
    // columns explicitly keeps the index-friendly fields searchable.
    where.OR = [
      { actorName: { contains: query, mode: "insensitive" } },
      { summary: { contains: query, mode: "insensitive" } },
      { action: { contains: query, mode: "insensitive" } },
      { ip: { contains: query } },
    ];
  }

  // ── Pagination ─────────────────────────────────────────────────────────────
  const total = await db.auditLog.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  // Clamp the requested page into range; bad/empty input falls back to page 1.
  const requested = Number.parseInt(sp.page ?? "1", 10);
  const page = Number.isFinite(requested)
    ? Math.min(Math.max(requested, 1), pageCount)
    : 1;

  const logs = await db.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    include: {
      actor: { select: { avatarUrl: true } },
      targetUser: { select: { name: true } },
    },
  });

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

  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = (page - 1) * PAGE_SIZE + rows.length;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Audit Log"
        subtitle={
          total === 0
            ? `${scopeLabel}.`
            : `${scopeLabel}. Showing ${rangeStart}–${rangeEnd} of ${total}.`
        }
        icon={ScrollText}
      />
      <LogsClient
        logs={rows}
        page={page}
        pageCount={pageCount}
        query={query}
        action={action ?? "ALL"}
      />
    </div>
  );
}
