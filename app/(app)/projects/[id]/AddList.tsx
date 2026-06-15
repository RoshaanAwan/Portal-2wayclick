"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ListPlus, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/Button";

export function AddList({ boardId }: { boardId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  const canSubmit = name.trim().length > 0;

  function reset() {
    setName("");
    setOpen(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || loading) return;
    setLoading(true);

    const res = await fetch("/api/projects/list/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ boardId, name: name.trim() }),
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
        className="mt-2 inline-flex items-center gap-1.5 rounded-xl border border-dashed border-line-strong bg-surface-2 px-3.5 py-2 text-xs font-medium text-ink-400 transition-colors hover:border-accent/40 hover:text-accent-ink"
      >
        <Plus className="h-4 w-4" />
        Add a list
      </button>
    );
  }

  return (
    <AnimatePresence>
      <motion.form
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        onSubmit={submit}
        className="mt-2 flex w-[300px] items-center gap-2 rounded-xl border border-line bg-surface p-2.5 shadow-xs"
      >
        <ListPlus className="h-4 w-4 shrink-0 text-ink-400" />
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") reset();
          }}
          maxLength={80}
          placeholder="List name…"
          className="input h-8 text-sm"
        />
        <Button type="submit" size="sm" loading={loading} disabled={!canSubmit}>
          Add
        </Button>
        <button
          type="button"
          onClick={reset}
          aria-label="Cancel"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-ink-400 transition-colors hover:bg-white/[0.05] hover:text-ink"
        >
          <X className="h-4 w-4" />
        </button>
      </motion.form>
    </AnimatePresence>
  );
}
