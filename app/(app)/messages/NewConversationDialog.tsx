"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { X, Search, Check, Loader2, Users, User } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

// Pick a person (→ DM) or several + a title (→ group). Project channels are
// reached from the project page / list, not here. Searches the directory via
// /api/conversations/people (open to any user, since anyone can DM anyone).

interface Person {
  id: string;
  name: string;
  title: string;
  department: string;
  avatarUrl: string | null;
}

export function NewConversationDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (conversationId: string) => void;
}) {
  const [q, setQ] = useState("");
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Person[]>([]);
  const [title, setTitle] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isGroup = selected.length > 1;

  // Close on Escape.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !submitting) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, submitting]);

  // Debounced directory search.
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      setLoading(true);
      fetch(`/api/conversations/people?q=${encodeURIComponent(q)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (cancelled || !data) return;
          setPeople(data.people ?? []);
        })
        .catch(() => {})
        .finally(() => !cancelled && setLoading(false));
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q]);

  function toggle(p: Person) {
    setSelected((prev) =>
      prev.some((x) => x.id === p.id)
        ? prev.filter((x) => x.id !== p.id)
        : [...prev, p],
    );
  }

  async function create() {
    if (selected.length === 0 || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const body = isGroup
        ? {
            kind: "group",
            title: title.trim() || selected.map((s) => s.name).join(", "),
            userIds: selected.map((s) => s.id),
          }
        : { kind: "dm", userId: selected[0].id };
      const res = await fetch("/api/conversations/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Could not start conversation");
      onCreated(data.id);
    } catch (e: any) {
      setError(e?.message ?? "Something went wrong");
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 bg-black/70 backdrop-blur-sm"
        onClick={() => !submitting && onClose()}
      />
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.97 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        role="dialog"
        aria-modal="true"
        aria-label="New conversation"
        className="glass-strong relative z-10 flex max-h-[80vh] w-full max-w-md flex-col p-0"
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="font-display text-sm font-semibold text-ink">
            New conversation
          </h2>
          <button
            onClick={() => !submitting && onClose()}
            aria-label="Close"
            className="hover-surface grid h-8 w-8 place-items-center rounded-lg text-ink-400 hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Selected chips + optional group title */}
        {selected.length > 0 && (
          <div className="space-y-2 border-b border-line px-4 py-3">
            <div className="flex flex-wrap gap-1.5">
              {selected.map((p) => (
                <button
                  key={p.id}
                  onClick={() => toggle(p)}
                  className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-1 text-[12px] font-medium text-accent-ink"
                >
                  {p.name}
                  <X className="h-3 w-3" />
                </button>
              ))}
            </div>
            {isGroup && (
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Group name (optional)"
                maxLength={120}
                className="w-full rounded-lg border border-line bg-surface-2/70 px-3 py-2 text-[13px] text-ink outline-none focus:border-line-strong"
              />
            )}
          </div>
        )}

        {/* Search */}
        <div className="border-b border-line px-4 py-2.5">
          <div className="flex items-center gap-2 rounded-lg border border-line bg-surface-2/70 px-2.5 py-1.5">
            <Search className="h-4 w-4 text-ink-400" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search people…"
              className="flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-400"
            />
          </div>
        </div>

        {/* People list */}
        <div className="min-h-0 flex-1 overflow-y-auto py-1">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-ink-400" />
            </div>
          ) : people.length === 0 ? (
            <p className="px-4 py-10 text-center text-[13px] text-ink-400">
              No people found
            </p>
          ) : (
            people.map((p) => {
              const isSel = selected.some((x) => x.id === p.id);
              return (
                <button
                  key={p.id}
                  onClick={() => toggle(p)}
                  className="hover-surface flex w-full items-center gap-3 px-4 py-2 text-left"
                >
                  <Avatar name={p.name} src={p.avatarUrl} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-ink">
                      {p.name}
                    </p>
                    <p className="truncate text-[11px] text-ink-400">
                      {p.title} · {p.department}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "grid h-5 w-5 place-items-center rounded-md border",
                      isSel
                        ? "border-accent bg-accent text-white"
                        : "border-line text-transparent",
                    )}
                  >
                    <Check className="h-3.5 w-3.5" />
                  </span>
                </button>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3">
          <span className="inline-flex items-center gap-1.5 text-[12px] text-ink-400">
            {isGroup ? (
              <Users className="h-3.5 w-3.5" />
            ) : (
              <User className="h-3.5 w-3.5" />
            )}
            {selected.length === 0
              ? "Pick someone"
              : isGroup
                ? `Group · ${selected.length} people`
                : "Direct message"}
          </span>
          <div className="flex items-center gap-2">
            {error && <span className="text-[12px] text-danger">{error}</span>}
            <Button
              type="button"
              onClick={create}
              loading={submitting}
              disabled={selected.length === 0}
            >
              {isGroup ? "Create group" : "Start chat"}
            </Button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
