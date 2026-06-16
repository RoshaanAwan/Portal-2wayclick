"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import {
  priorityLabel,
  TASK_PRIORITIES,
  type TaskPriority,
} from "@/lib/constants";
import type { TaskDTO } from "./BoardClient";

// Inline editor shown in place of a card while it's being edited. Mirrors the
// AddTask form (title textarea + priority chips) so the two read the same.
export function EditTaskForm({
  task,
  onSave,
  onCancel,
}: {
  task: TaskDTO;
  onSave: (
    taskId: string,
    title: string,
    priority: TaskPriority,
  ) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [priority, setPriority] = useState<TaskPriority>(
    (task.priority as TaskPriority) ?? "MEDIUM",
  );
  const [loading, setLoading] = useState(false);

  const canSubmit = title.trim().length > 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || loading) return;
    setLoading(true);
    const ok = await onSave(task.id, title.trim(), priority);
    setLoading(false);
    if (ok) onCancel();
  }

  return (
    <motion.form
      layout
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
          if (e.key === "Escape") onCancel();
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

      <div className="mt-2.5 flex items-center gap-2">
        <Button type="submit" size="sm" loading={loading} disabled={!canSubmit}>
          Save
        </Button>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Cancel"
          className="hover-surface grid h-8 w-8 place-items-center rounded-lg text-ink-400 hover:text-ink"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </motion.form>
  );
}
