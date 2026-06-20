import { FolderOpen } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import { AddDocumentButton } from "./AddDocumentButton";
import { DocumentLibrary } from "./DocumentLibrary";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 12;

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string; category?: string }>;
}) {
  const sp = await searchParams;
  const query = (sp.q ?? "").trim();
  const category = sp.category && sp.category !== "All" ? sp.category : null;

  // The result set is filtered by search + category; the stats + category
  // counts below are computed over the WHOLE library (unfiltered) so the
  // headline numbers and chip counts stay stable as you filter/paginate.
  const where: Prisma.DocumentWhereInput = {};
  if (category) where.category = category;
  if (query) {
    where.OR = [
      { title: { contains: query, mode: "insensitive" } },
      { description: { contains: query, mode: "insensitive" } },
      { category: { contains: query, mode: "insensitive" } },
      { uploader: { name: { contains: query, mode: "insensitive" } } },
    ];
  }

  const [user, total, libraryTotal, sizeAgg, byCategory] = await Promise.all([
    getCurrentUser(),
    db.document.count({ where }),
    db.document.count(),
    db.document.aggregate({ _sum: { sizeKb: true } }),
    db.document.groupBy({ by: ["category"], _count: { _all: true } }),
  ]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const requested = Number.parseInt(sp.page ?? "1", 10);
  const page = Number.isFinite(requested)
    ? Math.min(Math.max(requested, 1), pageCount)
    : 1;

  const documents = await db.document.findMany({
    where,
    include: { uploader: true },
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });

  const docs = documents.map((d) => ({
    id: d.id,
    title: d.title,
    description: d.description,
    category: d.category,
    fileType: d.fileType,
    sizeKb: d.sizeKb,
    url: d.url,
    createdAt: d.createdAt.toISOString(),
    uploader: {
      id: d.uploader.id,
      name: d.uploader.name,
      avatarUrl: d.uploader.avatarUrl,
    },
  }));

  const countByCategory: Record<string, number> = {};
  for (const g of byCategory) countByCategory[g.category] = g._count._all;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Document Library"
        subtitle="Handbooks, policies, decks, and everything the team shares."
        icon={FolderOpen}
        action={
          can.manageDocuments(user?.role) ? (
            <AddDocumentButton currentUserName={user?.name ?? null} />
          ) : null
        }
      />

      <DocumentLibrary
        docs={docs}
        canManage={can.manageDocuments(user?.role)}
        page={page}
        pageCount={pageCount}
        total={total}
        query={query}
        category={category ?? "All"}
        libraryTotal={libraryTotal}
        totalSize={sizeAgg._sum.sizeKb ?? 0}
        countByCategory={countByCategory}
      />
    </div>
  );
}
