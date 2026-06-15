"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Check, FolderPlus } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/utils";
import type { MemberDTO } from "./ProjectsClient";

export function ProjectComposer({
  roster,
  onDone,
}: {
  roster: MemberDTO[];
  onDone: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [memberIds, setMemberIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const canSubmit = name.trim().length >= 2;

  function toggleMember(id: string) {
    setMemberIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || loading) return;
    setLoading(true);
    setError("");

    const res = await fetch("/api/projects/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        description: description.trim() || undefined,
        memberIds: Array.from(memberIds),
      }),
    });

    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      setName("");
      setDescription("");
      setMemberIds(new Set());
      onDone();
      router.refresh();
      if (data.id) router.push(`/projects/${data.id}`);
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Could not create project.");
      setLoading(false);
    }
  }

  return (
    <GlassCard strong glow hover={false} className="p-5">
      <form onSubmit={submit} className="space-y-4">
        <div className="flex items-center gap-2.5">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-accent-grad text-white shadow-accent-glow">
            <FolderPlus className="h-[18px] w-[18px]" />
          </div>
          <div>
            <p className="text-sm font-semibold text-ink">New project</p>
            <p className="text-[11px] text-ink-400">
              Creates a dedicated Trello board for the team.
            </p>
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-ink-500">
            Name
          </label>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
            required
            placeholder="e.g. Mobile App Redesign"
            className="input"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-ink-500">
            Description{" "}
            <span className="font-normal text-ink-400">(optional)</span>
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={500}
            rows={2}
            placeholder="What is this project about?"
            className="input resize-y leading-relaxed"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-ink-500">
            Add members{" "}
            <span className="font-normal text-ink-400">
              (you're added automatically)
            </span>
          </label>
          <div className="max-h-56 space-y-0.5 overflow-y-auto rounded-xl border border-line bg-surface-2 p-1.5">
            {roster.map((m) => {
              const selected = memberIds.has(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => toggleMember(m.id)}
                  className={cn(
                    "hover-surface flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left",
                    selected && "bg-accent-soft/50",
                  )}
                >
                  <Avatar name={m.name} src={m.avatarUrl} size="xs" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-ink">
                      {m.name}
                    </p>
                    <p className="truncate text-[10px] text-ink-400">
                      {m.title}
                    </p>
                  </div>
                  {selected && (
                    <Check className="h-3.5 w-3.5 shrink-0 text-accent" />
                  )}
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-[11px] text-ink-400">
            {memberIds.size} selected
          </p>
        </div>

        {error && (
          <motion.p
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            className="text-sm text-danger-ink"
          >
            {error}
          </motion.p>
        )}

        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" size="sm" loading={loading} disabled={!canSubmit}>
            {!loading && <FolderPlus className="h-4 w-4" />}
            Create project
          </Button>
        </div>
      </form>
    </GlassCard>
  );
}
