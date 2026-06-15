"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import { Search, MapPin, Users, LayoutGrid, Network, ChevronRight } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { DEPARTMENTS } from "@/lib/constants";
import { cn } from "@/lib/utils";

export interface DirectoryPerson {
  id: string;
  name: string;
  title: string;
  department: string;
  role: string;
  location: string | null;
  avatarUrl: string | null;
  managerId: string | null;
  managerName: string | null;
  reportCount: number;
}

type View = "grid" | "org";

// Stable per-department badge colors so the same dept always reads the same.
const deptVariant: Record<
  string,
  "accent" | "cyan" | "pink" | "emerald" | "amber" | "neutral"
> = {
  Executive: "accent",
  Engineering: "cyan",
  People: "emerald",
  Design: "pink",
  Marketing: "amber",
  Data: "cyan",
  Finance: "emerald",
  Sales: "accent",
};

function deptColor(dept: string) {
  return deptVariant[dept] ?? "neutral";
}

export function DirectoryClient({ people }: { people: DirectoryPerson[] }) {
  const [query, setQuery] = useState("");
  const [dept, setDept] = useState<string | null>(null);
  const [view, setView] = useState<View>("grid");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return people.filter((p) => {
      if (dept && p.department !== dept) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.title.toLowerCase().includes(q) ||
        p.department.toLowerCase().includes(q)
      );
    });
  }, [people, query, dept]);

  // Only show department chips that actually exist in the data.
  const activeDepts = useMemo(() => {
    const present = new Set(people.map((p) => p.department));
    return DEPARTMENTS.filter((d) => present.has(d));
  }, [people]);

  return (
    <div className="space-y-5">
      {/* Controls */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-300" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, title, or department…"
              className="input pl-10"
              aria-label="Search directory"
            />
          </div>

          {/* View toggle */}
          <div className="flex shrink-0 rounded-xl border border-line bg-surface p-1 shadow-xs">
            <LayoutGroup id="dir-view">
              {(
                [
                  { id: "grid", label: "Grid", icon: LayoutGrid },
                  { id: "org", label: "Org", icon: Network },
                ] as const
              ).map((opt) => {
                const active = view === opt.id;
                const Icon = opt.icon;
                return (
                  <button
                    key={opt.id}
                    onClick={() => setView(opt.id)}
                    className={cn(
                      "relative flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors",
                      active ? "text-accent-ink" : "text-ink-400 hover:text-ink-700",
                    )}
                  >
                    {active && (
                      <motion.div
                        layoutId="dir-view-pill"
                        className="absolute inset-0 rounded-lg bg-accent-soft ring-1 ring-inset ring-accent/15"
                        transition={{ type: "spring", stiffness: 380, damping: 30 }}
                      />
                    )}
                    <Icon className="relative z-10 h-4 w-4" />
                    <span className="relative z-10">{opt.label}</span>
                  </button>
                );
              })}
            </LayoutGroup>
          </div>
        </div>

        {/* Department filter chips */}
        <div className="flex flex-wrap gap-2">
          <FilterChip
            label="All"
            count={people.length}
            active={dept === null}
            onClick={() => setDept(null)}
          />
          {activeDepts.map((d) => (
            <FilterChip
              key={d}
              label={d}
              count={people.filter((p) => p.department === d).length}
              active={dept === d}
              onClick={() => setDept(dept === d ? null : d)}
            />
          ))}
        </div>
      </div>

      {/* Body */}
      {view === "grid" ? (
        filtered.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No people found"
            description="Try a different search term or clear the department filter."
          />
        ) : (
          <PeopleGrid people={filtered} />
        )
      ) : (
        <OrgView people={filtered} fullCount={people.length} />
      )}
    </div>
  );
}

function FilterChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all",
        active
          ? "border-accent/30 bg-accent-soft text-accent-ink"
          : "border-line bg-surface-2 text-ink-500 hover:border-line-strong hover:text-ink",
      )}
    >
      {label}
      <span
        className={cn(
          "rounded-full px-1.5 text-[10px] tabular-nums",
          active ? "bg-accent/20 text-accent-ink" : "bg-line text-ink-400",
        )}
      >
        {count}
      </span>
    </button>
  );
}

function PeopleGrid({ people }: { people: DirectoryPerson[] }) {
  return (
    <motion.div
      layout
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
    >
      <AnimatePresence mode="popLayout">
        {people.map((p, i) => (
          <PersonCard key={p.id} person={p} index={i} />
        ))}
      </AnimatePresence>
    </motion.div>
  );
}

function PersonCard({ person, index }: { person: DirectoryPerson; index: number }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.03, 0.3), ease: "easeOut" }}
    >
      <Link href={`/directory/${person.id}`} className="block h-full">
        <GlassCard
          glow
          hover={false}
          className="group flex h-full flex-col items-center p-6 text-center"
        >
          <div className="relative">
            <Avatar name={person.name} src={person.avatarUrl} size="xl" ring />
          </div>

          <h3 className="font-display mt-4 text-[17px] font-semibold tracking-tight text-ink">
            {person.name}
          </h3>
          <p className="mt-0.5 text-sm text-ink-500">{person.title}</p>

          <div className="mt-3">
            <Badge variant={deptColor(person.department)}>{person.department}</Badge>
          </div>

          <div className="mt-4 flex w-full flex-col items-center gap-1.5 border-t border-line pt-4 text-xs text-ink-400">
            {person.location && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-ink-300" />
                {person.location}
              </span>
            )}
            {person.reportCount > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 text-ink-300" />
                {person.reportCount} direct{" "}
                {person.reportCount === 1 ? "report" : "reports"}
              </span>
            )}
          </div>
        </GlassCard>
      </Link>
    </motion.div>
  );
}

/* ---------------- Org chart view ---------------- */

interface OrgNode extends DirectoryPerson {
  children: OrgNode[];
}

function buildTree(people: DirectoryPerson[]): OrgNode[] {
  const byId = new Map<string, OrgNode>();
  people.forEach((p) => byId.set(p.id, { ...p, children: [] }));

  const roots: OrgNode[] = [];
  for (const node of byId.values()) {
    const parent = node.managerId ? byId.get(node.managerId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  const sortNodes = (nodes: OrgNode[]) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name));
    nodes.forEach((n) => sortNodes(n.children));
  };
  sortNodes(roots);

  return roots;
}

function OrgView({
  people,
  fullCount,
}: {
  people: DirectoryPerson[];
  fullCount: number;
}) {
  const roots = useMemo(() => buildTree(people), [people]);
  const filtered = people.length !== fullCount;

  if (roots.length === 0) {
    return (
      <EmptyState
        icon={Network}
        title="Nothing to chart"
        description="No people match the current filters."
      />
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
    >
      <GlassCard hover={false} strong className="p-5 sm:p-7">
        {filtered && (
          <p className="mb-5 rounded-xl border border-line bg-surface-2 px-4 py-2.5 text-xs text-ink-500">
            Showing a filtered slice of the org. People whose manager is hidden
            appear at the top level.
          </p>
        )}
        <div className="space-y-1.5">
          {roots.map((node, i) => (
            <OrgRow key={node.id} node={node} depth={0} index={i} />
          ))}
        </div>
      </GlassCard>
    </motion.div>
  );
}

function OrgRow({
  node,
  depth,
  index,
}: {
  node: OrgNode;
  depth: number;
  index: number;
}) {
  const hasChildren = node.children.length > 0;

  return (
    <div>
      <motion.div
        initial={{ opacity: 0, x: -6 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.3, delay: Math.min(index * 0.02, 0.25) }}
        className="relative"
      >
        {/* connector elbow into the parent's vertical line */}
        {depth > 0 && (
          <span
            className="absolute top-1/2 -left-3 h-px w-3 -translate-y-1/2 bg-line-strong"
            aria-hidden
          />
        )}
        <Link
          href={`/directory/${node.id}`}
          className="group flex items-center gap-3 rounded-xl border border-line bg-surface-2 px-3 py-2.5 transition-all hover:border-accent/30 hover:bg-accent-soft"
        >
          <Avatar name={node.name} src={node.avatarUrl} size="sm" ring={depth === 0} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-ink">{node.name}</p>
            <p className="truncate text-xs text-ink-500">{node.title}</p>
          </div>
          <Badge variant={deptColor(node.department)}>{node.department}</Badge>
          {hasChildren && (
            <span className="hidden items-center gap-1 text-xs text-ink-400 sm:inline-flex">
              <Users className="h-3.5 w-3.5" />
              {node.children.length}
            </span>
          )}
          <ChevronRight className="h-4 w-4 shrink-0 text-ink-300 transition-colors group-hover:text-accent" />
        </Link>
      </motion.div>

      {hasChildren && (
        <div className="mt-1.5 ml-[19px] space-y-1.5 border-l border-line pl-[19px]">
          {node.children.map((child, i) => (
            <OrgRow key={child.id} node={child} depth={depth + 1} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}
