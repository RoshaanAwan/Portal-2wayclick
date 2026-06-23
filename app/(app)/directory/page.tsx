import Link from "@/components/Link";
import { redirect } from "next/navigation";
import { Users, Network } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdminTier } from "@/lib/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import { BRAND, pageTitle } from "@/lib/brand";
import { DirectoryClient, type DirectoryPerson } from "./DirectoryClient";

export const metadata = {
  title: pageTitle("Directory"),
};

const PAGE_SIZE = 12;

export default async function DirectoryPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string; dept?: string; view?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // Directory is admin tier only (Super Admin + Admin). Everyone else is sent
  // back to their dashboard — they can't reach it via URL either.
  if (!isAdminTier(user.role)) redirect("/dashboard");

  const sp = await searchParams;
  const query = (sp.q ?? "").trim();
  const dept = sp.dept ?? null;
  // The org view needs the complete tree to draw manager→report links, so it
  // skips pagination entirely; the grid view pages through the filtered set.
  const view = sp.view === "org" ? "org" : "grid";

  const where: Prisma.UserWhereInput = {};
  if (dept) where.department = dept;
  if (query) {
    where.OR = [
      { name: { contains: query, mode: "insensitive" } },
      { title: { contains: query, mode: "insensitive" } },
      { department: { contains: query, mode: "insensitive" } },
    ];
  }

  // Total head-count of the whole company — drives the "All" chip + subtitle,
  // independent of the active filters.
  const headcount = await db.user.count();
  // Matching count, for the grid's pagination.
  const total = await db.user.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const requested = Number.parseInt(sp.page ?? "1", 10);
  const page = Number.isFinite(requested)
    ? Math.min(Math.max(requested, 1), pageCount)
    : 1;

  const users = await db.user.findMany({
    where,
    orderBy: [{ name: "asc" }],
    // Org view loads the full filtered set; grid loads one page.
    ...(view === "grid" ? { skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE } : {}),
    include: {
      manager: { select: { id: true, name: true } },
      _count: { select: { reports: true } },
    },
  });

  // Per-department counts across the whole company, for the filter chips.
  const byDept = await db.user.groupBy({
    by: ["department"],
    _count: { _all: true },
  });
  const countByDept: Record<string, number> = {};
  for (const g of byDept) countByDept[g.department] = g._count._all;

  const people: DirectoryPerson[] = users.map((u) => ({
    id: u.id,
    name: u.name,
    title: u.title,
    department: u.department,
    role: u.role,
    location: u.location,
    avatarUrl: u.avatarUrl,
    managerId: u.managerId,
    managerName: u.manager?.name ?? null,
    reportCount: u._count.reports,
  }));

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="People Directory"
        subtitle={`${headcount} people across the ${BRAND.name} team`}
        icon={Users}
        action={
          <Link
            href="/directory/org"
            className="inline-flex items-center gap-2 rounded-xl border border-line bg-surface-2 px-3.5 py-2 text-sm font-medium text-ink-700 transition hover:border-accent/40 hover:bg-accent-soft hover:text-accent"
          >
            <Network className="h-4 w-4" />
            Org Chart
          </Link>
        }
      />
      <DirectoryClient
        people={people}
        view={view}
        page={page}
        pageCount={pageCount}
        total={total}
        query={query}
        dept={dept}
        headcount={headcount}
        countByDept={countByDept}
      />
    </div>
  );
}
