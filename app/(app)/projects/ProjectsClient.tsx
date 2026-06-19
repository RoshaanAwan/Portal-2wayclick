"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  FolderKanban,
  KanbanSquare,
  LayoutGrid,
  List,
  Plus,
  Power,
  Users,
  UserCog,
  Pencil,
  Trash2,
} from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
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
  active: boolean;
  createdAt: string;
  owner: { id: string; name: string; avatarUrl: string | null };
  listCount: number;
  cardCount: number;
  members: MemberDTO[];
}

export type StatusFilter = "ALL" | "ACTIVE" | "INACTIVE";

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "ACTIVE", label: "Active" },
  { key: "INACTIVE", label: "Inactive" },
];

type ViewMode = "grid" | "list";
// Remember the user's grid/list preference across visits. This is a pure UI
// preference (not server state), so it lives in localStorage rather than the URL.
const VIEW_STORAGE_KEY = "projects.view";

export function ProjectsClient({
  projects,
  roster,
  isAdmin,
  status,
  statusCounts,
  page,
  pageCount,
}: {
  projects: ProjectDTO[];
  roster: MemberDTO[];
  isAdmin: boolean;
  status: StatusFilter;
  statusCounts: Record<StatusFilter, number>;
  page: number;
  pageCount: number;
}) {
  const router = useRouter();
  const { setParams, isPending } = useListParams({ status, page });
  const [composing, setComposing] = useState(false);
  // Grid (default) vs list layout. Hydrate from localStorage after mount so SSR
  // and the first client render agree (avoids a hydration mismatch).
  const [view, setView] = useState<ViewMode>("grid");
  useEffect(() => {
    const saved = localStorage.getItem(VIEW_STORAGE_KEY);
    if (saved === "grid" || saved === "list") setView(saved);
  }, []);
  function chooseView(next: ViewMode) {
    setView(next);
    localStorage.setItem(VIEW_STORAGE_KEY, next);
  }
  // Which project's member manager is open (admin only).
  const [managing, setManaging] = useState<ProjectDTO | null>(null);
  // Which project's edit modal is open (admin only).
  const [editing, setEditing] = useState<ProjectDTO | null>(null);
  // The project queued for deletion + whether the request is in flight.
  const [deleteTarget, setDeleteTarget] = useState<ProjectDTO | null>(null);
  const [deleting, setDeleting] = useState(false);
  // The id of the project whose active flag is mid-toggle (disables its button).
  const [togglingId, setTogglingId] = useState<string | null>(null);

  async function toggleActive(project: ProjectDTO) {
    if (togglingId) return;
    setTogglingId(project.id);
    const res = await fetch(`/api/projects/${project.id}/active`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !project.active }),
    });
    if (res.ok) router.refresh();
    setTogglingId(null);
  }

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
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {STATUS_FILTERS.map((f) => {
            const active = status === f.key;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setParams({ status: f.key, page: 1 })}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                  active
                    ? "border-accent/30 bg-accent-soft text-accent-ink"
                    : "border-line bg-surface-2 text-ink-500 hover:border-line-strong hover:text-ink",
                )}
              >
                {f.label}
                <span className={cn(active ? "text-accent-ink/70" : "text-ink-400")}>
                  {statusCounts[f.key]}
                </span>
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          {/* Grid / list view switcher */}
          <div className="flex items-center rounded-lg border border-line bg-surface-2 p-0.5">
            <button
              type="button"
              onClick={() => chooseView("grid")}
              aria-label="Grid view"
              aria-pressed={view === "grid"}
              title="Grid view"
              className={cn(
                "grid h-7 w-7 place-items-center rounded-md transition-colors",
                view === "grid"
                  ? "bg-surface text-ink shadow-xs"
                  : "text-ink-400 hover:text-ink",
              )}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => chooseView("list")}
              aria-label="List view"
              aria-pressed={view === "list"}
              title="List view"
              className={cn(
                "grid h-7 w-7 place-items-center rounded-md transition-colors",
                view === "list"
                  ? "bg-surface text-ink shadow-xs"
                  : "text-ink-400 hover:text-ink",
              )}
            >
              <List className="h-4 w-4" />
            </button>
          </div>

          {isAdmin && !composing && (
            <Button size="sm" onClick={() => setComposing(true)}>
              <Plus className="h-4 w-4" />
              New project
            </Button>
          )}
        </div>
      </div>

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
        status !== "ALL" ? (
          <EmptyState
            icon={FolderKanban}
            title={`No ${status === "ACTIVE" ? "active" : "inactive"} projects`}
            description={
              status === "ACTIVE"
                ? "Nothing here right now — try the Inactive or All filter."
                : "Nothing here right now — try the Active or All filter."
            }
          />
        ) : (
          <EmptyState
            icon={FolderKanban}
            title={isAdmin ? "No projects yet" : "You're not in any projects yet"}
            description={
              isAdmin
                ? "Create your first project to give a team its own Trello board."
                : "Once an admin adds you to a project, it will show up here."
            }
          />
        )
      ) : (
        <>
          {view === "grid" ? (
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
                  toggling={togglingId === p.id}
                  onManage={() => setManaging(p)}
                  onEdit={() => setEditing(p)}
                  onToggleActive={() => toggleActive(p)}
                  onDelete={() => setDeleteTarget(p)}
                />
              ))}
            </div>
          ) : (
            <div
              className={cn(
                "flex flex-col gap-2 transition-opacity",
                isPending && "opacity-60",
              )}
            >
              {projects.map((p) => (
                <ProjectRow
                  key={p.id}
                  project={p}
                  isAdmin={isAdmin}
                  toggling={togglingId === p.id}
                  onManage={() => setManaging(p)}
                  onEdit={() => setEditing(p)}
                  onToggleActive={() => toggleActive(p)}
                  onDelete={() => setDeleteTarget(p)}
                />
              ))}
            </div>
          )}

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
  toggling,
  onManage,
  onEdit,
  onToggleActive,
  onDelete,
}: {
  project: ProjectDTO;
  isAdmin: boolean;
  toggling: boolean;
  onManage: () => void;
  onEdit: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
}) {
  return (
    <GlassCard
      className={cn(
        "group flex flex-col p-5",
        !project.active && "opacity-70",
      )}
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="grid h-10 w-10 place-items-center rounded-xl border border-line bg-accent-soft text-accent shadow-xs">
          <KanbanSquare className="h-5 w-5" />
        </div>
        {isAdmin && (
          <ProjectActions
            project={project}
            toggling={toggling}
            onManage={onManage}
            onEdit={onEdit}
            onToggleActive={onToggleActive}
            onDelete={onDelete}
          />
        )}
      </div>

      <div className="flex min-w-0 items-center gap-2">
        <Link href={`/projects/${project.id}`} className="min-w-0">
          <h2 className="truncate text-[15px] font-semibold text-ink transition-colors group-hover:text-accent-ink">
            {project.name}
          </h2>
        </Link>
        {!project.active && (
          <Badge variant="amber" className="shrink-0">
            Inactive
          </Badge>
        )}
      </div>
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

// Shared admin action buttons (Members / activate-toggle / edit / delete) used
// by both the grid card and the list row so the two views stay in lockstep.
function ProjectActions({
  project,
  toggling,
  onManage,
  onEdit,
  onToggleActive,
  onDelete,
}: {
  project: ProjectDTO;
  toggling: boolean;
  onManage: () => void;
  onEdit: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
}) {
  return (
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
        onClick={onToggleActive}
        disabled={toggling}
        aria-label={project.active ? "Deactivate project" : "Activate project"}
        title={project.active ? "Deactivate project" : "Activate project"}
        className={cn(
          "grid h-7 w-7 place-items-center rounded-lg border border-line bg-surface-2 text-ink-500 transition-colors disabled:opacity-50",
          project.active
            ? "hover:border-warn/40 hover:bg-warn-soft hover:text-warn-ink"
            : "hover:border-success/40 hover:bg-success-soft hover:text-success-ink",
        )}
      >
        <Power className="h-3.5 w-3.5" />
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
  );
}

function ProjectRow({
  project,
  isAdmin,
  toggling,
  onManage,
  onEdit,
  onToggleActive,
  onDelete,
}: {
  project: ProjectDTO;
  isAdmin: boolean;
  toggling: boolean;
  onManage: () => void;
  onEdit: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
}) {
  return (
    <GlassCard
      className={cn(
        "group flex items-center gap-4 px-4 py-3",
        !project.active && "opacity-70",
      )}
    >
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-line bg-accent-soft text-accent shadow-xs">
        <KanbanSquare className="h-4.5 w-4.5" />
      </div>

      {/* Name + description */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Link href={`/projects/${project.id}`} className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-ink transition-colors group-hover:text-accent-ink">
              {project.name}
            </h2>
          </Link>
          {!project.active && (
            <Badge variant="amber" className="shrink-0">
              Inactive
            </Badge>
          )}
        </div>
        <p className="truncate text-xs text-ink-400">
          {project.description || "No description."}
        </p>
      </div>

      {/* Meta — hidden on the narrowest screens to keep the row tidy */}
      <div className="hidden shrink-0 items-center gap-4 text-[11px] text-ink-400 sm:flex">
        <span className="inline-flex items-center gap-1">
          <KanbanSquare className="h-3.5 w-3.5" />
          {project.cardCount}
        </span>
        <span className="inline-flex items-center gap-1">
          <Users className="h-3.5 w-3.5" />
          {project.members.length}
        </span>
        <span className="w-16 text-right">{timeAgo(project.createdAt)}</span>
      </div>

      {isAdmin ? (
        <div className="shrink-0">
          <ProjectActions
            project={project}
            toggling={toggling}
            onManage={onManage}
            onEdit={onEdit}
            onToggleActive={onToggleActive}
            onDelete={onDelete}
          />
        </div>
      ) : (
        <Link
          href={`/projects/${project.id}`}
          className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-accent-ink transition-colors hover:gap-1.5"
        >
          Open
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      )}
    </GlassCard>
  );
}
