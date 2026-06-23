import { ScrollText } from "lucide-react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { adminDb } from "@/lib/db";
import { pageTitle } from "@/lib/brand";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata = { title: "Platform Log" };

// System-Owner-only platform audit view: the cross-tenant trail of platform
// actions (tenant create/suspend/reactivate/impersonate), read via adminDb. A
// System Owner has no tenant context, so this deliberately does NOT use the
// scoped client.
const PLATFORM_ACTIONS = [
  "tenant.create",
  "tenant.suspend",
  "tenant.reactivate",
  "tenant.impersonate",
];

export default async function PlatformLogsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.isSystemOwner) redirect("/dashboard");

  const logs = await adminDb.auditLog.findMany({
    where: { action: { in: PLATFORM_ACTIONS } },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      action: true,
      actorName: true,
      summary: true,
      createdAt: true,
      tenant: { select: { name: true, subdomain: true } },
    },
  });

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Platform Log"
        subtitle="Cross-tenant trail of platform actions."
        icon={ScrollText}
      />
      <div className="glass overflow-hidden p-0">
        <div className="divide-y divide-line">
          {logs.length === 0 && (
            <p className="p-6 text-sm text-ink-400">No platform actions yet.</p>
          )}
          {logs.map((l) => (
            <div key={l.id} className="flex items-start gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-ink">
                  {l.summary ?? l.action}
                </p>
                <p className="mt-0.5 text-xs text-ink-400">
                  {l.actorName} · {l.tenant?.name ?? "—"} ·{" "}
                  {l.createdAt.toLocaleString()}
                </p>
              </div>
              <span className="shrink-0 rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px] font-mono text-ink-500">
                {l.action.replace("tenant.", "")}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
