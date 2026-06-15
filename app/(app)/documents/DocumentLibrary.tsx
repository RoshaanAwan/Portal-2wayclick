"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  LayoutGrid,
  List as ListIcon,
  HardDrive,
  Files,
  FolderSearch,
  Download,
} from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { CountUp } from "@/components/ui/CountUp";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { DOC_CATEGORIES } from "@/lib/constants";
import { cn, formatFileSize, timeAgo } from "@/lib/utils";
import { fileTypeMeta } from "./fileTypes";

export interface DocItem {
  id: string;
  title: string;
  description: string | null;
  category: string;
  fileType: string;
  sizeKb: number;
  url: string;
  createdAt: string;
  uploader: { id: string; name: string; avatarUrl: string | null };
}

type View = "grid" | "list";
type Filter = "All" | (typeof DOC_CATEGORIES)[number];

export function DocumentLibrary({ docs }: { docs: DocItem[] }) {
  const [view, setView] = useState<View>("grid");
  const [filter, setFilter] = useState<Filter>("All");
  const [query, setQuery] = useState("");

  const countByCategory = useMemo(() => {
    const map: Record<string, number> = {};
    for (const d of docs) map[d.category] = (map[d.category] ?? 0) + 1;
    return map;
  }, [docs]);

  const totalSize = useMemo(
    () => docs.reduce((sum, d) => sum + d.sizeKb, 0),
    [docs],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return docs.filter((d) => {
      if (filter !== "All" && d.category !== filter) return false;
      if (!q) return true;
      return (
        d.title.toLowerCase().includes(q) ||
        (d.description?.toLowerCase().includes(q) ?? false) ||
        d.uploader.name.toLowerCase().includes(q) ||
        d.category.toLowerCase().includes(q)
      );
    });
  }, [docs, filter, query]);

  return (
    <div className="space-y-6">
      <StatsRow
        total={docs.length}
        totalSize={totalSize}
        countByCategory={countByCategory}
      />

      {/* Controls */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-300" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search documents…"
              className="input py-2 pl-9"
            />
          </div>

          <ViewToggle view={view} onChange={setView} />
        </div>

        <FilterChips
          filter={filter}
          onChange={setFilter}
          countByCategory={countByCategory}
          total={docs.length}
        />
      </div>

      {/* Results */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={FolderSearch}
          title="No documents found"
          description={
            query || filter !== "All"
              ? "Try a different search or category filter."
              : "Add the first document to get the library started."
          }
        />
      ) : view === "grid" ? (
        <GridView docs={filtered} />
      ) : (
        <ListView docs={filtered} />
      )}
    </div>
  );
}

/* ------------------------------- Stats ------------------------------- */

function StatsRow({
  total,
  totalSize,
  countByCategory,
}: {
  total: number;
  totalSize: number;
  countByCategory: Record<string, number>;
}) {
  const present = DOC_CATEGORIES.filter((c) => countByCategory[c]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="grid grid-cols-1 gap-4 sm:grid-cols-3"
    >
      <GlassCard hover={false} className="flex items-center gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-xl bg-accent-soft">
          <Files className="h-5 w-5 text-accent" />
        </div>
        <div>
          <p className="font-display text-2xl font-semibold tracking-tight text-ink">
            <CountUp value={total} />
          </p>
          <p className="text-xs text-ink-400">Total documents</p>
        </div>
      </GlassCard>

      <GlassCard hover={false} className="flex items-center gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-xl bg-success-soft">
          <HardDrive className="h-5 w-5 text-success" />
        </div>
        <div>
          <p className="font-display text-2xl font-semibold tracking-tight text-ink">
            {formatFileSize(totalSize)}
          </p>
          <p className="text-xs text-ink-400">Total size</p>
        </div>
      </GlassCard>

      <GlassCard hover={false} className="sm:col-span-1">
        <p className="mb-2 text-xs font-medium text-ink-400">By category</p>
        {present.length === 0 ? (
          <p className="text-sm text-ink-300">No documents yet</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {present.map((c) => (
              <span
                key={c}
                className="inline-flex items-center gap-1 rounded-lg bg-surface-2 border border-line px-2 py-0.5 text-[11px] text-ink-500"
              >
                {c}
                <span className="font-semibold text-ink">
                  {countByCategory[c]}
                </span>
              </span>
            ))}
          </div>
        )}
      </GlassCard>
    </motion.div>
  );
}

/* ----------------------------- Controls ----------------------------- */

function ViewToggle({
  view,
  onChange,
}: {
  view: View;
  onChange: (v: View) => void;
}) {
  const options: { key: View; label: string; icon: typeof LayoutGrid }[] = [
    { key: "grid", label: "Grid", icon: LayoutGrid },
    { key: "list", label: "List", icon: ListIcon },
  ];
  return (
    <div className="relative inline-flex shrink-0 self-start rounded-xl border border-line bg-surface p-1 shadow-xs">
      {options.map((o) => {
        const Icon = o.icon;
        const active = view === o.key;
        return (
          <button
            key={o.key}
            onClick={() => onChange(o.key)}
            className={cn(
              "relative inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
              active ? "text-accent-ink" : "text-ink-400 hover:text-ink",
            )}
            aria-pressed={active}
          >
            {active && (
              <motion.div
                layoutId="doc-view-toggle"
                className="absolute inset-0 rounded-lg bg-accent-soft ring-1 ring-inset ring-accent/15"
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
              />
            )}
            <Icon className="relative z-10 h-3.5 w-3.5" />
            <span className="relative z-10">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function FilterChips({
  filter,
  onChange,
  countByCategory,
  total,
}: {
  filter: Filter;
  onChange: (f: Filter) => void;
  countByCategory: Record<string, number>;
  total: number;
}) {
  const chips: { key: Filter; count: number }[] = [
    { key: "All", count: total },
    ...DOC_CATEGORIES.map((c) => ({ key: c as Filter, count: countByCategory[c] ?? 0 })),
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((chip) => {
        const active = filter === chip.key;
        return (
          <button
            key={chip.key}
            onClick={() => onChange(chip.key)}
            className={cn(
              "relative inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              active
                ? "border-transparent text-accent-ink"
                : "border-line bg-surface-2 text-ink-500 hover:text-ink hover:border-line-strong",
            )}
          >
            {active && (
              <motion.div
                layoutId="doc-filter-chip"
                className="absolute inset-0 rounded-full bg-accent-soft ring-1 ring-inset ring-accent/15"
                transition={{ type: "spring", stiffness: 400, damping: 32 }}
              />
            )}
            <span className="relative z-10">{chip.key}</span>
            <span
              className={cn(
                "relative z-10 rounded-full px-1.5 text-[10px]",
                active ? "bg-accent/20 text-accent-ink" : "bg-line text-ink-400",
              )}
            >
              {chip.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------ Views ------------------------------ */

function GridView({ docs }: { docs: DocItem[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <AnimatePresence mode="popLayout">
        {docs.map((doc, i) => (
          <FileCard key={doc.id} doc={doc} index={i} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function FileCard({ doc, index }: { doc: DocItem; index: number }) {
  const meta = fileTypeMeta(doc.fileType);
  const Icon = meta.icon;

  return (
    <GlassCard
      layout
      hover={false}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.35, delay: Math.min(index * 0.04, 0.3) }}
      className="flex flex-col"
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "grid h-12 w-12 shrink-0 place-items-center rounded-xl border",
            meta.tile,
          )}
        >
          <Icon className={cn("h-6 w-6", meta.icon_color)} />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-ink" title={doc.title}>
            {doc.title}
          </h3>
          <div className="mt-1.5">
            <Badge variant={meta.badge}>{doc.category}</Badge>
          </div>
        </div>
      </div>

      {doc.description && (
        <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-ink-500">
          {doc.description}
        </p>
      )}

      <div className="mt-4 flex items-center justify-between gap-2 border-t border-line pt-3">
        <div className="flex min-w-0 items-center gap-2">
          <Avatar
            name={doc.uploader.name}
            src={doc.uploader.avatarUrl}
            size="xs"
          />
          <div className="min-w-0">
            <p className="truncate text-[11px] font-medium text-ink-700">
              {doc.uploader.name}
            </p>
            <p className="text-[10px] text-ink-400">
              {formatFileSize(doc.sizeKb)} · {timeAgo(doc.createdAt)}
            </p>
          </div>
        </div>

        <a href={doc.url || "#"} download={doc.url !== "#"}>
          <Button variant="ghost" size="sm" type="button">
            <Download className="h-3.5 w-3.5" />
            Download
          </Button>
        </a>
      </div>
    </GlassCard>
  );
}

function ListView({ docs }: { docs: DocItem[] }) {
  return (
    <GlassCard hover={false} className="overflow-hidden p-0">
      {/* Header (md+) */}
      <div className="hidden grid-cols-[minmax(0,1fr)_120px_140px_120px_120px] gap-4 border-b border-line bg-surface-2 px-5 py-3 text-[11px] font-medium uppercase tracking-wide text-ink-400 md:grid">
        <span>Name</span>
        <span>Category</span>
        <span>Uploaded by</span>
        <span>Size</span>
        <span className="text-right">Added</span>
      </div>

      <AnimatePresence mode="popLayout">
        {docs.map((doc, i) => (
          <ListRow key={doc.id} doc={doc} index={i} />
        ))}
      </AnimatePresence>
    </GlassCard>
  );
}

function ListRow({ doc, index }: { doc: DocItem; index: number }) {
  const meta = fileTypeMeta(doc.fileType);
  const Icon = meta.icon;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.03, 0.25) }}
      className="group grid grid-cols-1 items-center gap-2 border-b border-line px-5 py-3 transition-colors last:border-b-0 hover:bg-surface-2 md:grid-cols-[minmax(0,1fr)_120px_140px_120px_120px] md:gap-4"
    >
      {/* Name */}
      <div className="flex min-w-0 items-center gap-3">
        <div
          className={cn(
            "grid h-9 w-9 shrink-0 place-items-center rounded-lg border",
            meta.tile,
          )}
        >
          <Icon className={cn("h-[18px] w-[18px]", meta.icon_color)} />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink" title={doc.title}>
            {doc.title}
          </p>
          {doc.description && (
            <p className="truncate text-xs text-ink-400">{doc.description}</p>
          )}
        </div>
      </div>

      {/* Category */}
      <div className="md:block">
        <Badge variant={meta.badge}>{doc.category}</Badge>
      </div>

      {/* Uploaded by */}
      <div className="flex items-center gap-2">
        <Avatar name={doc.uploader.name} src={doc.uploader.avatarUrl} size="xs" />
        <span className="truncate text-xs text-ink-500">
          {doc.uploader.name}
        </span>
      </div>

      {/* Size */}
      <div className="text-xs text-ink-500">
        <span className="text-ink-400 md:hidden">Size: </span>
        {formatFileSize(doc.sizeKb)}
      </div>

      {/* Added + download */}
      <div className="flex items-center justify-between gap-2 md:justify-end">
        <span className="text-xs text-ink-400 md:text-right">
          {timeAgo(doc.createdAt)}
        </span>
        <a
          href={doc.url || "#"}
          download={doc.url !== "#"}
          className="md:opacity-0 md:transition-opacity md:group-hover:opacity-100"
          aria-label={`Download ${doc.title}`}
        >
          <Button variant="ghost" size="sm" type="button" className="h-7 px-2">
            <Download className="h-3.5 w-3.5" />
          </Button>
        </a>
      </div>
    </motion.div>
  );
}
