"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Users, ZoomIn, ZoomOut, Network } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { GlassCard } from "@/components/ui/GlassCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/utils";
import type { OrgNode } from "@/lib/orgChart";
import type { PulseStatus } from "@/lib/teamPulse";

// Status → ring + label styling. The ring is the headline: at a glance you see
// who's available (green), busy (amber), overloaded (red), or out (blue).
const STATUS: Record<
  PulseStatus,
  { ring: string; dot: string; label: string; text: string }
> = {
  available: { ring: "ring-success/60", dot: "bg-success", label: "Available", text: "text-success" },
  busy: { ring: "ring-warn/70", dot: "bg-warn", label: "Busy", text: "text-warn" },
  overloaded: { ring: "ring-danger/80", dot: "bg-danger", label: "Overloaded", text: "text-danger" },
  out: { ring: "ring-info/60", dot: "bg-info", label: "Out today", text: "text-info" },
};

export function OrgChart({ roots }: { roots: OrgNode[] }) {
  // Zoom is a simple CSS scale on the canvas — cheap and smooth.
  const [zoom, setZoom] = useState(1);
  const zoomBy = (d: number) =>
    setZoom((z) => Math.min(1.3, Math.max(0.6, +(z + d).toFixed(2))));

  if (roots.length === 0) {
    return (
      <GlassCard hover={false}>
        <EmptyState
          icon={Network}
          title="No one to chart yet"
          description="Once people have managers assigned, the org structure appears here."
        />
      </GlassCard>
    );
  }

  return (
    <div className="space-y-4">
      {/* Controls + legend */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {(Object.keys(STATUS) as PulseStatus[]).map((s) => (
            <span
              key={s}
              className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-ink-500"
            >
              <span className={cn("h-2 w-2 rounded-full", STATUS[s].dot)} />
              {STATUS[s].label}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-line bg-surface-2 p-1">
          <button
            onClick={() => zoomBy(-0.1)}
            className="grid h-7 w-7 place-items-center rounded-md text-ink-500 transition hover:bg-surface hover:text-ink"
            aria-label="Zoom out"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <span className="nums w-10 text-center text-[11px] font-medium text-ink-500">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={() => zoomBy(0.1)}
            className="grid h-7 w-7 place-items-center rounded-md text-ink-500 transition hover:bg-surface hover:text-ink"
            aria-label="Zoom in"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Canvas — horizontally scrollable, zoomable. */}
      <GlassCard hover={false} className="overflow-x-auto p-6 sm:p-8">
        <motion.div
          animate={{ scale: zoom }}
          transition={{ type: "spring", stiffness: 220, damping: 26 }}
          style={{ transformOrigin: "top center" }}
          className="flex min-w-max justify-center gap-10 pt-2"
        >
          {roots.map((node, i) => (
            <OrgBranch key={node.id} node={node} depth={0} index={i} />
          ))}
        </motion.div>
      </GlassCard>
    </div>
  );
}

function OrgBranch({
  node,
  depth,
  index,
}: {
  node: OrgNode;
  depth: number;
  index: number;
}) {
  // Roots and their first level start expanded; deeper levels collapse so the
  // chart opens tidy and the viewer drills in.
  const [open, setOpen] = useState(depth < 1);
  const hasReports = node.reports.length > 0;

  return (
    <div className="flex flex-col items-center">
      <PersonCard
        node={node}
        open={open}
        onToggle={() => setOpen((o) => !o)}
        depth={depth}
        index={index}
      />

      <AnimatePresence initial={false}>
        {hasReports && open && (
          <motion.div
            key="children"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-col items-center overflow-hidden"
          >
            {/* vertical stem from parent down to the row connector */}
            <span className="h-6 w-px bg-line-strong" />
            <div className="relative flex items-start gap-8">
              {/* horizontal rail across the children (hidden when only one) */}
              {node.reports.length > 1 && (
                <span className="absolute left-0 right-0 top-0 mx-auto h-px bg-line-strong" />
              )}
              {node.reports.map((child, i) => (
                <div key={child.id} className="flex flex-col items-center">
                  {/* short drop from the rail into each child */}
                  <span className="h-6 w-px bg-line-strong" />
                  <OrgBranch node={child} depth={depth + 1} index={i} />
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function PersonCard({
  node,
  open,
  onToggle,
  depth,
  index,
}: {
  node: OrgNode;
  open: boolean;
  onToggle: () => void;
  depth: number;
  index: number;
}) {
  const s = STATUS[node.status];
  const hasReports = node.reports.length > 0;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 14, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        delay: Math.min(0.04 * index + 0.05 * depth, 0.5),
        duration: 0.4,
        ease: [0.22, 1, 0.36, 1],
      }}
      className="group relative w-56 rounded-2xl border border-line bg-surface p-4 transition-colors hover:border-accent/40"
    >
      <div className="flex items-start gap-3">
        <div className="relative">
          <span
            className={cn(
              "block rounded-full ring-2 ring-offset-2 ring-offset-surface",
              s.ring,
            )}
          >
            <Avatar name={node.name} src={node.avatarUrl} size="md" />
          </span>
          <span
            className={cn(
              "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-surface",
              s.dot,
            )}
          />
        </div>
        <div className="min-w-0 flex-1">
          <Link
            href={`/directory/${node.id}`}
            className="block truncate font-display text-sm font-semibold text-ink transition hover:text-accent"
          >
            {node.name}
          </Link>
          <p className="truncate text-[11px] text-ink-400">{node.title}</p>
          <p className={cn("mt-0.5 text-[10px] font-medium", s.text)}>{s.label}</p>
        </div>
      </div>

      {/* load bar — same read as Team Pulse */}
      <div className="mt-3">
        <div className="flex items-center justify-between text-[10px] text-ink-400">
          <span>Load</span>
          <span className="nums">{node.load}</span>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${node.load}%` }}
            transition={{ delay: 0.2, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className={cn("h-full rounded-full", s.dot)}
          />
        </div>
      </div>

      {/* expand/collapse control — only when there are reports */}
      {hasReports && (
        <button
          onClick={onToggle}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-line bg-surface-2 py-1.5 text-[11px] font-medium text-ink-500 transition hover:border-accent/40 hover:text-ink"
          aria-expanded={open}
        >
          <Users className="h-3.5 w-3.5" />
          {node.teamSize} {node.teamSize === 1 ? "report" : "in team"}
          <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
            <ChevronDown className="h-3.5 w-3.5" />
          </motion.span>
        </button>
      )}
    </motion.div>
  );
}
