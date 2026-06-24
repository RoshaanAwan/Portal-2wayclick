"use client";

import { useEffect, useRef, useState } from "react";
import Link from "@/components/Link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  CheckCircle2,
  FolderKanban,
  KanbanSquare,
  LayoutGrid,
  List,
  MoreHorizontal,
  Plus,
  Power,
  RotateCcw,
  Search,
  Users,
  UserCog,
  Pencil,
  Trash2,
  X,
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
  completedAt: string | null;
  createdAt: string;
  owner: { id: string; name: string; avatarUrl: string | null };
  listCount: number;
  cardCount: number;
  memberCount: number;
  members: MemberDTO[]; // first 5 only, for avatar stack
}

export type StatusFilter = "ALL" | "ACTIVE" | "INACTIVE" | "COMPLETED";

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "ACTIVE", label: "Active" },
  { key: "INACTIVE", label: "Inactive" },
  { key: "COMPLETED", label: "Completed" },
];

type ViewMode = "grid" | "list";
// Remember the user's grid/list preference across visits. This is a pure UI
// preference (not server state), so it lives in localStorage rather than the URL.
const VIEW_STORAGE_KEY = "projects.view";

export function ProjectsClient({
  projects,
  isAdmin,
  status,
  statusCounts,
  query,
  page,
  pageCount,
}: {
  projects: ProjectDTO[];
  isAdmin: boolean;
  status: StatusFilter;
  statusCounts: Record<StatusFilter, number>;
  query: string;
  page: number;
  pageCount: number;
}) {
  const router = useRouter();
  const { setParams, isPending } = useListParams({ status, q: query, page });
  const [composing, setComposing] = useState(false);

  // Search box. Mirror the URL's `q` locally for a responsive input, then push
  // the change to the URL (which re-fetches server-side) after a short debounce.
  const [search, setSearch] = useState(query);
  // Keep the input in sync if the URL changes elsewhere (e.g. back/forward).
  useEffect(() => setSearch(query), [query]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function onSearchChange(value: string) {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setParams({ q: value.trim() || null, page: 1 });
    }, 300);
  }
  function clearSearch() {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSearch("");
    setParams({ q: null, page: 1 });
  }
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
  // The id of the project whose completed flag is mid-toggle.
  const [completingId, setCompletingId] = useState<string | null>(null);

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

  async function toggleComplete(project: ProjectDTO) {
    if (completingId) return;
    setCompletingId(project.id);
    const res = await fetch(`/api/projects/${project.id}/complete`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed: !project.completedAt }),
    });
    if (res.ok) router.refresh();
    setCompletingId(null);
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
          {/* Search by project name */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search projects…"
              aria-label="Search projects by name"
              className="h-8 w-40 rounded-lg border border-line bg-surface-2 pl-8 pr-7 text-xs text-ink placeholder:text-ink-400 transition-colors focus:border-line-strong focus:outline-none sm:w-52"
            />
            {search && (
              <button
                type="button"
                onClick={clearSearch}
                aria-label="Clear search"
                className="absolute right-1.5 top-1/2 grid h-5 w-5 -translate-y-1/2 place-items-center rounded text-ink-400 transition-colors hover:text-ink"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

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
              onDone={() => setComposing(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {projects.length === 0 ? (
        query ? (
          <EmptyState
            icon={Search}
            title="No projects match your search"
            description={`Nothing found for “${query}”. Try a different name or clear the search.`}
          />
        ) : status !== "ALL" ? (
          <EmptyState
            icon={FolderKanban}
            title={`No ${status.toLowerCase()} projects`}
            description="Nothing here right now — try another tab."
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
                  completing={completingId === p.id}
                  onManage={() => setManaging(p)}
                  onEdit={() => setEditing(p)}
                  onToggleActive={() => toggleActive(p)}
                  onToggleComplete={() => toggleComplete(p)}
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
                  completing={completingId === p.id}
                  onManage={() => setManaging(p)}
                  onEdit={() => setEditing(p)}
                  onToggleActive={() => toggleActive(p)}
                  onToggleComplete={() => toggleComplete(p)}
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
  completing,
  onManage,
  onEdit,
  onToggleActive,
  onToggleComplete,
  onDelete,
}: {
  project: ProjectDTO;
  isAdmin: boolean;
  toggling: boolean;
  completing: boolean;
  onManage: () => void;
  onEdit: () => void;
  onToggleActive: () => void;
  onToggleComplete: () => void;
  onDelete: () => void;
}) {
  return (
    <GlassCard
      className={cn(
        "group flex flex-col p-5",
        (!project.active || project.completedAt) && "opacity-70",
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
            completing={completing}
            onManage={onManage}
            onEdit={onEdit}
            onToggleActive={onToggleActive}
            onToggleComplete={onToggleComplete}
            onDelete={onDelete}
          />
        )}
      </div>

      <div className="flex min-w-0 items-center gap-2">
        <Link href={`/projects/${project.id}`} prefetch={false} className="min-w-0">
          <h2 className="truncate text-[15px] font-semibold text-ink transition-colors group-hover:text-accent-ink">
            {project.name}
          </h2>
        </Link>
        <ProjectStatusBadge project={project} />
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
          {project.memberCount}
        </span>
        <span className="ml-auto">{timeAgo(project.createdAt)}</span>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-line pt-3.5">
        <div className="flex items-center">
          {project.members.map((m, i) => (
            <div
              key={m.id}
              className={cn("rounded-full ring-2 ring-surface", i > 0 && "-ml-2")}
            >
              <Avatar name={m.name} src={m.avatarUrl} size="xs" />
            </div>
          ))}
          {project.memberCount > project.members.length && (
            <span className="-ml-2 grid h-6 w-6 place-items-center rounded-full bg-surface-2 text-[9px] font-semibold text-ink-400 ring-2 ring-surface">
              +{project.memberCount - project.members.length}
            </span>
          )}
        </div>

        <Link
          href={`/projects/${project.id}`}
          prefetch={false}
          className="inline-flex items-center gap-1 text-xs font-medium text-accent-ink transition-colors hover:gap-1.5"
        >
          Open board
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </GlassCard>
  );
}

// Status badge shown next to a project's name. Completed takes precedence over
// Inactive (a completed project is the same state regardless of its active flag).
function ProjectStatusBadge({ project }: { project: ProjectDTO }) {
  if (project.completedAt) {
    return (
      <Badge variant="emerald" className="shrink-0">
        Completed
      </Badge>
    );
  }
  if (!project.active) {
    return (
      <Badge variant="amber" className="shrink-0">
        Inactive
      </Badge>
    );
  }
  return null;
}

// Shared admin action buttons (Members / complete-toggle / activate-toggle /
// edit / delete) used by both the grid card and the list row so the two views
// stay in lockstep.
function ProjectActions({
  project,
  toggling,
  completing,
  onManage,
  onEdit,
  onToggleActive,
  onToggleComplete,
  onDelete,
}: {
  project: ProjectDTO;
  toggling: boolean;
  completing: boolean;
  onManage: () => void;
  onEdit: () => void;
  onToggleActive: () => void;
  onToggleComplete: () => void;
  onDelete: () => void;
}) {
  const completed = !!project.completedAt;
  // Collapse the four icon-actions (complete/reopen, activate/deactivate, edit,
  // delete) into a kebab menu; "Members" stays a visible button since it's the
  // common action. The menu is rendered FIXED (anchored to the button via its
  // bounding rect) rather than absolutely inside the card — the project cards
  // and list rows are `overflow-hidden` GlassCards, so an in-card dropdown would
  // be clipped (the known GlassCard overflow trap). Closes on outside click,
  // Escape, or scroll/resize (the anchor would otherwise drift).
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; right: number } | null>(
    null,
  );
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  function openMenu() {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setCoords({ top: r.bottom + 6, right: window.innerWidth - r.right });
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      const t = e.target as Node;
      if (
        !btnRef.current?.contains(t) &&
        !menuRef.current?.contains(t)
      ) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    // The menu is positioned from a one-time rect; if the page scrolls or
    // resizes the anchor moves, so just close rather than chase it.
    function onReflow() {
      setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onReflow, true);
    window.addEventListener("resize", onReflow);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onReflow, true);
      window.removeEventListener("resize", onReflow);
    };
  }, [open]);

  // Run a menu action then close the menu.
  const act = (fn: () => void) => () => {
    fn();
    setOpen(false);
  };

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
        ref={btnRef}
        type="button"
        onClick={() => (open ? setOpen(false) : openMenu())}
        aria-label="Project actions"
        aria-haspopup="menu"
        aria-expanded={open}
        className="grid h-7 w-7 place-items-center rounded-lg border border-line bg-surface-2 text-ink-500 transition-colors hover:border-line-strong hover:text-ink"
      >
        <MoreHorizontal className="h-3.5 w-3.5" />
      </button>

      <AnimatePresence>
        {open && coords && (
          <motion.div
            ref={menuRef}
            role="menu"
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            style={{ top: coords.top, right: coords.right }}
            className="glass-strong fixed z-50 w-44 overflow-hidden p-1"
          >
            <button
              type="button"
              role="menuitem"
              onClick={act(onToggleComplete)}
              disabled={completing}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-medium text-ink-500 transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-50"
            >
              {completed ? (
                <RotateCcw className="h-3.5 w-3.5" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" />
              )}
              {completed ? "Reopen project" : "Mark completed"}
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={act(onToggleActive)}
              disabled={toggling}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-medium text-ink-500 transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-50"
            >
              <Power className="h-3.5 w-3.5" />
              {project.active ? "Deactivate" : "Activate"}
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={act(onEdit)}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-medium text-ink-500 transition-colors hover:bg-surface-2 hover:text-ink"
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit project
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={act(onDelete)}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-medium text-ink-500 transition-colors hover:bg-danger-soft hover:text-danger-ink"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete project
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ProjectRow({
  project,
  isAdmin,
  toggling,
  completing,
  onManage,
  onEdit,
  onToggleActive,
  onToggleComplete,
  onDelete,
}: {
  project: ProjectDTO;
  isAdmin: boolean;
  toggling: boolean;
  completing: boolean;
  onManage: () => void;
  onEdit: () => void;
  onToggleActive: () => void;
  onToggleComplete: () => void;
  onDelete: () => void;
}) {
  return (
    <GlassCard
      className={cn(
        "group flex items-center gap-4 px-4 py-3",
        (!project.active || project.completedAt) && "opacity-70",
      )}
    >
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-line bg-accent-soft text-accent shadow-xs">
        <KanbanSquare className="h-4.5 w-4.5" />
      </div>

      {/* Name + description */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Link href={`/projects/${project.id}`} prefetch={false} className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-ink transition-colors group-hover:text-accent-ink">
              {project.name}
            </h2>
          </Link>
          <ProjectStatusBadge project={project} />
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
          {project.memberCount}
        </span>
        <span className="w-16 text-right">{timeAgo(project.createdAt)}</span>
      </div>

      {isAdmin ? (
        <div className="shrink-0">
          <ProjectActions
            project={project}
            toggling={toggling}
            completing={completing}
            onManage={onManage}
            onEdit={onEdit}
            onToggleActive={onToggleActive}
            onToggleComplete={onToggleComplete}
            onDelete={onDelete}
          />
        </div>
      ) : (
        <Link
          href={`/projects/${project.id}`}
          prefetch={false}
          className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-accent-ink transition-colors hover:gap-1.5"
        >
          Open
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      )}
    </GlassCard>
  );
}
