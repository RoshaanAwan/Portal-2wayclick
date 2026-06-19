"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Search, UserPlus } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/utils";
import type { MemberDTO } from "./BoardClient";

// Controlled picker: the parent owns assignment state (so the card avatar stack
// and this list stay in sync). We just report toggles via onToggle.
export function AssigneePicker({
  assigned,
  members,
  currentUserId,
  onToggle,
}: {
  assigned: MemberDTO[];
  members: MemberDTO[];
  currentUserId: string | null;
  onToggle: (member: MemberDTO, shouldAssign: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  const assignedIds = new Set(assigned.map((a) => a.id));

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? members.filter(
        (m) =>
          m.name.toLowerCase().includes(q) || m.title.toLowerCase().includes(q),
      )
    : members;

  const me = currentUserId ? members.find((m) => m.id === currentUserId) : null;
  const meAssigned = currentUserId ? assignedIds.has(currentUserId) : false;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Add member"
        aria-expanded={open}
        className={cn(
          "inline-flex h-7 items-center gap-1.5 rounded-full border border-dashed border-line-strong px-2.5 text-xs font-medium text-ink-400 transition-colors hover:border-accent/40 hover:bg-accent-soft hover:text-accent-ink",
          open && "border-accent/40 bg-accent-soft text-accent-ink",
        )}
      >
        <UserPlus className="h-3.5 w-3.5" />
        Add
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="glass-strong absolute left-0 z-30 mt-2 w-[min(16rem,calc(100vw-2.5rem))] overflow-hidden rounded-xl p-2 shadow-pop"
          >
            <p className="px-2 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
              Assign members
            </p>

            {/* Search */}
            <div className="relative mb-1.5">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search teammates…"
                className="input h-8 pl-8 text-xs"
              />
            </div>

            {/* Assign to me */}
            {me && !meAssigned && (
              <button
                type="button"
                onClick={() => onToggle(me, true)}
                className="mb-1 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium text-accent-ink transition-colors hover:bg-accent-soft"
              >
                <UserPlus className="h-3.5 w-3.5" />
                Assign to me
              </button>
            )}

            {/* Member list */}
            <div className="max-h-56 space-y-0.5 overflow-y-auto">
              {filtered.length === 0 ? (
                <p className="px-2 py-3 text-center text-xs text-ink-400">
                  No matches
                </p>
              ) : (
                filtered.map((m) => {
                  const isAssigned = assignedIds.has(m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => onToggle(m, !isAssigned)}
                      className={cn(
                        "hover-surface flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left",
                        isAssigned && "bg-accent-soft/50",
                      )}
                    >
                      <Avatar name={m.name} src={m.avatarUrl} size="xs" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-ink">
                          {m.name}
                          {m.id === currentUserId && (
                            <span className="ml-1 text-[10px] text-ink-400">
                              (you)
                            </span>
                          )}
                        </p>
                        <p className="truncate text-[10px] text-ink-400">
                          {m.title}
                        </p>
                      </div>
                      {isAssigned && (
                        <Check className="h-3.5 w-3.5 shrink-0 text-accent" />
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
