"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Check, FolderPlus } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/utils";
import {
  PROJECT_TEMPLATES,
  DEFAULT_PROJECT_TEMPLATE_ID,
} from "@/lib/constants";
import type { MemberDTO } from "./ProjectsClient";

export function ProjectComposer({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [memberIds, setMemberIds] = useState<Set<string>>(new Set());
  const [projectLeadId, setProjectLeadId] = useState("");
  const [techLeadId, setTechLeadId] = useState("");
  const [template, setTemplate] = useState(DEFAULT_PROJECT_TEMPLATE_ID);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [roster, setRoster] = useState<MemberDTO[]>([]);

  // Leads are chosen from the selected members. Keep the option list in sync.
  const eligibleLeads = roster.filter((m) => memberIds.has(m.id));

  // Fetch roster once when the composer mounts (admin clicked "New project").
  useEffect(() => {
    fetch("/api/projects/roster")
      .then((r) => r.json())
      .then((data) => Array.isArray(data) && setRoster(data))
      .catch(() => {});
  }, []);

  const canSubmit = name.trim().length >= 2;

  function toggleMember(id: string) {
    setMemberIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        // Removing a member who was a lead empties that seat.
        setProjectLeadId((cur) => (cur === id ? "" : cur));
        setTechLeadId((cur) => (cur === id ? "" : cur));
      } else {
        next.add(id);
      }
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
        projectLeadId: projectLeadId || null,
        techLeadId: techLeadId || null,
        template,
      }),
    });

    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      setName("");
      setDescription("");
      setMemberIds(new Set());
      setProjectLeadId("");
      setTechLeadId("");
      setTemplate(DEFAULT_PROJECT_TEMPLATE_ID);
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
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-accent-grad text-white">
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

        {/* Board template — Trello-style starting columns. */}
        <div>
          <label className="mb-1.5 block text-xs font-medium text-ink-500">
            Board template
          </label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {PROJECT_TEMPLATES.map((t) => {
              const selected = template === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTemplate(t.id)}
                  aria-pressed={selected}
                  className={cn(
                    "flex flex-col gap-1.5 rounded-xl border p-2.5 text-left transition-colors",
                    selected
                      ? "border-accent/50 bg-accent-soft/40"
                      : "border-line bg-surface-2 hover:border-line/80",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-ink">
                      {t.label}
                    </span>
                    {selected && (
                      <Check className="h-3.5 w-3.5 shrink-0 text-accent" />
                    )}
                  </div>
                  <span className="text-[10px] leading-snug text-ink-400">
                    {t.description}
                  </span>
                  <div className="flex flex-wrap gap-1 pt-0.5">
                    {t.columns.map((c) => (
                      <span
                        key={c}
                        className="rounded bg-surface px-1.5 py-0.5 text-[9px] font-medium text-ink-500"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-ink-500">
            Add members{" "}
            <span className="font-normal text-ink-400">
              (you're added automatically)
            </span>
          </label>
          <div className="max-h-56 space-y-0.5 overflow-y-auto rounded-xl border border-line bg-surface-2 p-1.5">
            {roster.length === 0 ? (
              <p className="px-2 py-4 text-center text-xs text-ink-400">
                Loading…
              </p>
            ) : (
              roster.map((m) => {
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
              })
            )}
          </div>
          <p className="mt-1.5 text-[11px] text-ink-400">
            {memberIds.size} selected
          </p>
        </div>

        {/* Leads — optional, chosen from the selected members. Assign now or
            later from the project page. */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-ink-500">
              Project lead{" "}
              <span className="font-normal text-ink-400">(optional)</span>
            </label>
            <select
              value={projectLeadId}
              onChange={(e) => setProjectLeadId(e.target.value)}
              disabled={eligibleLeads.length === 0}
              className="input"
            >
              <option value="">Unassigned</option>
              {eligibleLeads.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-ink-500">
              Tech lead{" "}
              <span className="font-normal text-ink-400">(optional)</span>
            </label>
            <select
              value={techLeadId}
              onChange={(e) => setTechLeadId(e.target.value)}
              disabled={eligibleLeads.length === 0}
              className="input"
            >
              <option value="">Unassigned</option>
              {eligibleLeads.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        {eligibleLeads.length === 0 && (
          <p className="-mt-1 text-[11px] text-ink-400">
            Add members above to pick leads (or assign them later).
          </p>
        )}

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
