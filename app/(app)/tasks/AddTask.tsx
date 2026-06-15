"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import {
  priorityLabel,
  TASK_PRIORITIES,
  type TaskPriority,
} from "@/lib/constants";

export function AddTask({
  listId,
  currentUserId,
}: {
  listId: string;
  currentUserId: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("MEDIUM");
  const [assignSelf, setAssignSelf] = useState(false);
  const [loading, setLoading] = useState(false);

  const canSubmit = title.trim().length > 0;

  function reset() {
    setTitle("");
    setPriority("MEDIUM");
    setAssignSelf(false);
    setOpen(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || loading) return;
    setLoading(true);

    const res = await fetch("/api/tasks/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        listId,
        title: title.trim(),
        priority,
        assigneeId: assignSelf && currentUserId ? currentUserId : undefined,
      }),
    });

    setLoading(false);
    if (res.ok) {
      reset();
      router.refresh();
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-xl px-2 py-2 text-xs font-medium text-ink-400 transition-colors hover:bg-white/[0.04] hover:text-ink"
      >
        <Plus className="h-4 w-4" />
        Add a card
      </button>
    );
  }

  return (
    <AnimatePresence>
      <motion.form
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        onSubmit={submit}
        className="rounded-xl border border-line bg-surface p-2.5 shadow-xs"
      >
        <textarea
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void submit(e);
            }
            if (e.key === "Escape") reset();
          }}
          rows={2}
          maxLength={200}
          placeholder="Enter a title for this card…"
          className="input resize-none text-sm"
        />

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {TASK_PRIORITIES.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPriority(p)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                priority === p
                  ? "border-accent/30 bg-accent-soft text-accent-ink"
                  : "border-line bg-surface-2 text-ink-500 hover:text-ink",
              )}
            >
              {priorityLabel[p]}
            </button>
          ))}
        </div>

        {currentUserId && (
          <label className="mt-2 flex cursor-pointer select-none items-center gap-2 text-[11px] text-ink-500">
            <input
              type="checkbox"
              checked={assignSelf}
              onChange={(e) => setAssignSelf(e.target.checked)}
              className="h-3.5 w-3.5 accent-accent"
            />
            Assign to me
          </label>
        )}

        <div className="mt-2.5 flex items-center gap-2">
          <Button type="submit" size="sm" loading={loading} disabled={!canSubmit}>
            Add card
          </Button>
          <button
            type="button"
            onClick={reset}
            aria-label="Cancel"
            className="grid h-8 w-8 place-items-center rounded-lg text-ink-400 transition-colors hover:bg-white/[0.05] hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </motion.form>
    </AnimatePresence>
  );
}
