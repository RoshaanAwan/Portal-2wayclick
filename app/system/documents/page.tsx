import { FolderOpen } from "lucide-react";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { requireSystemOwner } from "@/lib/auth";
import { adminDb } from "@/lib/db";
import { PageHeader } from "@/components/ui/PageHeader";
import { DocumentLibrary } from "@/app/(app)/documents/DocumentLibrary";
import { SystemAddDocumentButton } from "./SystemAddDocumentButton";

export const metadata = { title: "Documents" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 12;

export default async function SystemDocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string; category?: string }>;
}) {
  const actor = await requireSystemOwner().catch(() => null);
  if (!actor) redirect("/login");

  const sp = await searchParams;
  const query = (sp.q ?? "").trim();
  const category = sp.category && sp.category !== "All" ? sp.category : null;

  const where: Prisma.DocumentWhereInput = { tenantId: actor.tenantId };
  if (category) where.category = category;
  if (query) {
    where.OR = [
      { title: { contains: query, mode: "insensitive" } },
      { description: { contains: query, mode: "insensitive" } },
      { category: { contains: query, mode: "insensitive" } },
      { uploader: { name: { contains: query, mode: "insensitive" } } },
    ];
  }

  const baseWhere: Prisma.DocumentWhereInput = { tenantId: actor.tenantId };

  const [total, libraryTotal, sizeAgg, byCategory] = await Promise.all([
    adminDb.document.count({ where }),
    adminDb.document.count({ where: baseWhere }),
    adminDb.document.aggregate({ where: baseWhere, _sum: { sizeKb: true } }),
    adminDb.document.groupBy({ by: ["category"], where: baseWhere, _count: { _all: true } }),
  ]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const requested = Number.parseInt(sp.page ?? "1", 10);
  const page = Number.isFinite(requested)
    ? Math.min(Math.max(requested, 1), pageCount)
    : 1;

  const documents = await adminDb.document.findMany({
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
        subtitle="Platform-level documents uploaded by the System Owner."
        icon={FolderOpen}
        action={<SystemAddDocumentButton currentUserName={actor.name} />}
      />

      <DocumentLibrary
        docs={docs}
        canManage={true}
        page={page}
        pageCount={pageCount}
        total={total}
        query={query}
        category={category ?? "All"}
        libraryTotal={libraryTotal}
        totalSize={sizeAgg._sum.sizeKb ?? 0}
        countByCategory={countByCategory}
        apiBase="/api/system/documents"
      />
    </div>
  );
}
