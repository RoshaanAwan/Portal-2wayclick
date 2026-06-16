"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  FolderKanban,
  KanbanSquare,
  Plus,
  Users,
  UserCog,
  Pencil,
  Trash2,
} from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Pagination } from "@/components/ui/Pagination";
import { useListParams } from "@/lib/useListParams";
import { cn, timeAgo } from "@/lib/utils";
import { ProjectComposer } from "./ProjectComposer";
import { MemberManager } from "./MemberManager";
import { ProjectEditor } from "./ProjectEditor";

export interface MemberDTO {
  id: string;
  name: string;
  avatarUrl: string | null;
  title: string;
}

export interface ProjectDTO {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  owner: { id: string; name: string; avatarUrl: string | null };
  listCount: number;
  cardCount: number;
  members: MemberDTO[];
}

export function ProjectsClient({
  projects,
  roster,
  isAdmin,
  page,
  pageCount,
  total,
}: {
  projects: ProjectDTO[];
  roster: MemberDTO[];
  isAdmin: boolean;
  page: number;
  pageCount: number;
  total: number;
}) {
  const router = useRouter();
  const { setParams, isPending } = useListParams({ page });
  const [composing, setComposing] = useState(false);
  // Which project's member manager is open (admin only).
  const [managing, setManaging] = useState<ProjectDTO | null>(null);
  // Which project's edit modal is open (admin only).
  const [editing, setEditing] = useState<ProjectDTO | null>(null);
  // The project queued for deletion + whether the request is in flight.
  const [deleteTarget, setDeleteTarget] = useState<ProjectDTO | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function confirmDelete() {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    const res = await fetch(`/api/projects/${deleteTarget.id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setDeleteTarget(null);
      router.refresh();
    }
    setDeleting(false);
  }

  return (
    <>
      {isAdmin && (
        <div className="mb-5 flex items-center justify-between">
          <p className="text-sm text-ink-400">
            {total} {total === 1 ? "project" : "projects"}
          </p>
          {!composing && (
            <Button size="sm" onClick={() => setComposing(true)}>
              <Plus className="h-4 w-4" />
              New project
            </Button>
          )}
        </div>
      )}

      <AnimatePresence>
        {composing && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-6 overflow-hidden"
          >
            <ProjectComposer
              roster={roster}
              onDone={() => setComposing(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {projects.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title={isAdmin ? "No projects yet" : "You're not in any projects yet"}
          description={
            isAdmin
              ? "Create your first project to give a team its own Trello board."
              : "Once an admin adds you to a project, it will show up here."
          }
        />
      ) : (
        <>
          <div
            className={cn(
              "grid grid-cols-1 gap-4 transition-opacity sm:grid-cols-2 lg:grid-cols-3",
              isPending && "opacity-60",
            )}
          >
            {projects.map((p) => (
              <ProjectCard
                key={p.id}
                project={p}
                isAdmin={isAdmin}
                onManage={() => setManaging(p)}
                onEdit={() => setEditing(p)}
                onDelete={() => setDeleteTarget(p)}
              />
            ))}
          </div>

          <Pagination
            page={page}
            pageCount={pageCount}
            disabled={isPending}
            onPage={(p) => setParams({ page: p })}
            className="mt-6"
          />
        </>
      )}

      {isAdmin && (
        <>
          <MemberManager
            project={managing}
            roster={roster}
            onClose={() => setManaging(null)}
          />
          <ProjectEditor project={editing} onClose={() => setEditing(null)} />
          <ConfirmDialog
            open={!!deleteTarget}
            title="Delete project"
            message={
              <>
                Delete “{deleteTarget?.name}” and its board? All lists, cards, and
                the client share link are permanently removed. This can’t be
                undone.
              </>
            }
            loading={deleting}
            onConfirm={confirmDelete}
            onClose={() => !deleting && setDeleteTarget(null)}
          />
        </>
      )}
    </>
  );
}

function ProjectCard({
  project,
  isAdmin,
  onManage,
  onEdit,
  onDelete,
}: {
  project: ProjectDTO;
  isAdmin: boolean;
  onManage: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <GlassCard className="group flex flex-col p-5">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="grid h-10 w-10 place-items-center rounded-xl border border-line bg-accent-soft text-accent shadow-xs">
          <KanbanSquare className="h-5 w-5" />
        </div>
        {isAdmin && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onManage}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 text-[11px] font-medium text-ink-500 transition-colors hover:border-line-strong hover:text-ink"
            >
              <UserCog className="h-3.5 w-3.5" />
              Members
            </button>
            <button
              type="button"
              onClick={onEdit}
              aria-label="Edit project"
              className="grid h-7 w-7 place-items-center rounded-lg border border-line bg-surface-2 text-ink-500 transition-colors hover:border-line-strong hover:text-ink"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={onDelete}
              aria-label="Delete project"
              className="grid h-7 w-7 place-items-center rounded-lg border border-line bg-surface-2 text-ink-500 transition-colors hover:border-danger/40 hover:bg-danger-soft hover:text-danger-ink"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      <Link href={`/projects/${project.id}`} className="min-w-0">
        <h2 className="truncate text-[15px] font-semibold text-ink transition-colors group-hover:text-accent-ink">
          {project.name}
        </h2>
      </Link>
      <p className="mt-1 line-clamp-2 min-h-[2.5rem] text-xs leading-relaxed text-ink-400">
        {project.description || "No description."}
      </p>

      <div className="mt-3 flex items-center gap-3 text-[11px] text-ink-400">
        <span className="inline-flex items-center gap-1">
          <KanbanSquare className="h-3.5 w-3.5" />
          {project.cardCount} cards
        </span>
        <span className="inline-flex items-center gap-1">
          <Users className="h-3.5 w-3.5" />
          {project.members.length}
        </span>
        <span className="ml-auto">{timeAgo(project.createdAt)}</span>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-line pt-3.5">
        {/* Member avatar stack */}
        <div className="flex items-center">
          {project.members.slice(0, 4).map((m, i) => (
            <div
              key={m.id}
              className={cn("rounded-full ring-2 ring-surface", i > 0 && "-ml-2")}
            >
              <Avatar name={m.name} src={m.avatarUrl} size="xs" />
            </div>
          ))}
          {project.members.length > 4 && (
            <span className="-ml-2 grid h-6 w-6 place-items-center rounded-full bg-surface-2 text-[9px] font-semibold text-ink-400 ring-2 ring-surface">
              +{project.members.length - 4}
            </span>
          )}
        </div>

        <Link
          href={`/projects/${project.id}`}
          className="inline-flex items-center gap-1 text-xs font-medium text-accent-ink transition-colors hover:gap-1.5"
        >
          Open board
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </GlassCard>
  );
}
