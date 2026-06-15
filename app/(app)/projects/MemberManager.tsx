"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Crown, Search, UserCog, X } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/utils";
import type { MemberDTO, ProjectDTO } from "./ProjectsClient";

export function MemberManager({
  project,
  roster,
  onClose,
}: {
  project: ProjectDTO | null;
  roster: MemberDTO[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  // Optimistic set of member ids for the open project.
  const [memberIds, setMemberIds] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<string | null>(null);

  // Re-seed the optimistic set whenever a different project opens.
  useEffect(() => {
    if (project) setMemberIds(new Set(project.members.map((m) => m.id)));
    setQuery("");
  }, [project]);

  // Close on Escape.
  useEffect(() => {
    if (!project) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [project, onClose]);

  if (!project) return null;

  async function toggle(member: MemberDTO, add: boolean) {
    if (!project || pending) return;
    if (!add && member.id === project.owner.id) return; // owner is locked in

    setPending(member.id);
    setMemberIds((prev) => {
      const next = new Set(prev);
      add ? next.add(member.id) : next.delete(member.id);
      return next;
    });

    const res = await fetch("/api/projects/members", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: project.id, userId: member.id, add }),
    });

    if (res.ok) {
      router.refresh();
    } else {
      // Roll back on failure.
      setMemberIds((prev) => {
        const next = new Set(prev);
        add ? next.delete(member.id) : next.add(member.id);
        return next;
      });
    }
    setPending(null);
  }

  const q = query.trim().toLowerCase();
  const filtered = q
    ? roster.filter(
        (m) =>
          m.name.toLowerCase().includes(q) || m.title.toLowerCase().includes(q),
      )
    : roster;

  return (
    <AnimatePresence>
      {project && (
        <motion.div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div
            className="fixed inset-0 bg-black/55 backdrop-blur-sm"
            onClick={onClose}
          />

          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="glass-strong relative z-10 my-auto w-full max-w-md overflow-hidden rounded-2xl"
          >
            <div className="flex items-start justify-between gap-4 border-b border-line p-5">
              <div className="flex items-center gap-2.5">
                <div className="grid h-9 w-9 place-items-center rounded-xl border border-line bg-accent-soft text-accent">
                  <UserCog className="h-[18px] w-[18px]" />
                </div>
                <div className="min-w-0">
                  <h2 className="truncate text-base font-semibold text-ink">
                    Manage members
                  </h2>
                  <p className="truncate text-[11px] text-ink-400">
                    {project.name} · {memberIds.size} member
                    {memberIds.size === 1 ? "" : "s"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="hover-surface grid h-8 w-8 shrink-0 place-items-center rounded-lg text-ink-400 hover:text-ink"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-4">
              <div className="relative mb-2">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search teammates…"
                  className="input pl-9"
                />
              </div>

              <div className="max-h-[55vh] space-y-0.5 overflow-y-auto">
                {filtered.length === 0 ? (
                  <p className="px-2 py-6 text-center text-xs text-ink-400">
                    No matches
                  </p>
                ) : (
                  filtered.map((m) => {
                    const isMember = memberIds.has(m.id);
                    const isOwner = m.id === project.owner.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        disabled={isOwner || pending === m.id}
                        onClick={() => toggle(m, !isMember)}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors",
                          isOwner
                            ? "cursor-default"
                            : "hover-surface",
                          isMember && "bg-accent-soft/40",
                        )}
                      >
                        <Avatar name={m.name} src={m.avatarUrl} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="flex items-center gap-1.5 truncate text-sm font-medium text-ink">
                            {m.name}
                            {isOwner && (
                              <span className="inline-flex items-center gap-0.5 rounded-full bg-accent-soft px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-accent-ink">
                                <Crown className="h-2.5 w-2.5" />
                                Owner
                              </span>
                            )}
                          </p>
                          <p className="truncate text-[11px] text-ink-400">
                            {m.title}
                          </p>
                        </div>
                        <span
                          className={cn(
                            "grid h-6 w-6 shrink-0 place-items-center rounded-full border transition-colors",
                            isMember
                              ? "border-accent/40 bg-accent text-white"
                              : "border-line-strong text-transparent",
                          )}
                        >
                          <Check className="h-3.5 w-3.5" />
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
