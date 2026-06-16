import { FolderOpen } from "lucide-react";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui/PageHeader";
import { AddDocumentButton } from "./AddDocumentButton";
import { DocumentLibrary } from "./DocumentLibrary";

export const dynamic = "force-dynamic";

export default async function DocumentsPage() {
  const [user, documents] = await Promise.all([
    getCurrentUser(),
    db.document.findMany({
      include: { uploader: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

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

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Document Library"
        subtitle="Handbooks, policies, decks, and everything the team shares."
        icon={FolderOpen}
        action={<AddDocumentButton currentUserName={user?.name ?? null} />}
      />

      <DocumentLibrary docs={docs} canManage={!!user} />
    </div>
  );
}
