"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, Trash2, Pencil, Megaphone, ShieldCheck } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { timeAgo } from "@/lib/utils";
import { ANNOUNCEMENT_CATEGORIES } from "@/lib/constants";

interface SystemAnnouncement {
  id: string;
  title: string;
  body: string;
  category: string;
  coverColor: string;
  createdAt: string;
  authorName: string;
}

type BadgeVariant = "accent" | "cyan" | "pink" | "emerald" | "neutral" | "amber";
const COVER_VARIANT: Record<string, BadgeVariant> = {
  accent: "accent", cyan: "cyan", pink: "pink", emerald: "emerald",
};

export function SystemAnnouncementsClient({
  announcements: initial,
  actorName,
}: {
  announcements: SystemAnnouncement[];
  actorName: string;
}) {
  const router = useRouter();
  const [composerOpen, setComposerOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<SystemAnnouncement | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SystemAnnouncement | null>(null);
  const [deleting, setDeleting] = useState(false);

  // composer state
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState<typeof ANNOUNCEMENT_CATEGORIES[number]>("General");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function resetComposer() {
    setTitle(""); setBody(""); setCategory("General"); setError("");
    setEditTarget(null); setComposerOpen(false);
  }

  function openEdit(a: SystemAnnouncement) {
    setTitle(a.title); setBody(a.body);
    setCategory(a.category as typeof ANNOUNCEMENT_CATEGORIES[number]);
    setError(""); setEditTarget(a); setComposerOpen(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true); setError("");
    const url = editTarget
      ? `/api/system/announcements/${editTarget.id}`
      : "/api/system/announcements/create";
    const method = editTarget ? "PATCH" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, body, category }),
    });
    setSaving(false);
    if (res.ok) { resetComposer(); router.refresh(); }
    else setError("Failed to save. Try again.");
  }

  async function confirmDelete() {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    const res = await fetch(`/api/system/announcements/${deleteTarget.id}`, { method: "DELETE" });
    setDeleting(false);
    if (res.ok) { setDeleteTarget(null); router.refresh(); }
  }

  return (
    <div className="space-y-6">
      {/* Composer toggle */}
      <div className="flex justify-end">
        <Button size="sm" onClick={() => { if (composerOpen) resetComposer(); else setComposerOpen(true); }}>
          {composerOpen ? <><X className="h-4 w-4" /> Cancel</> : <><Plus className="h-4 w-4" /> New announcement</>}
        </Button>
      </div>

      {/* Composer / editor */}
      {composerOpen && (
        <GlassCard className="p-5">
          <p className="mb-4 text-sm font-semibold text-ink">
            {editTarget ? "Edit announcement" : "New platform announcement"}
          </p>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-500">Title</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required minLength={3} maxLength={160}
                placeholder="Announcement title"
                className="input w-full"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-500">Body</label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                required minLength={1} maxLength={4000} rows={4}
                placeholder="What do you want to communicate to all tenants?"
                className="input w-full resize-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-500">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as typeof ANNOUNCEMENT_CATEGORIES[number])}
                className="input w-full"
              >
                {ANNOUNCEMENT_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            {error && <p className="text-xs text-danger-ink">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={resetComposer}>Cancel</Button>
              <Button type="submit" size="sm" loading={saving}>
                {editTarget ? "Save changes" : "Post to all tenants"}
              </Button>
            </div>
          </form>
        </GlassCard>
      )}

      {/* List */}
      {initial.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="No platform announcements"
          description="Posts you create here will appear pinned in every tenant's feed."
        />
      ) : (
        <div className="space-y-4">
          {initial.map((a) => {
            const variant: BadgeVariant = COVER_VARIANT[a.coverColor] ?? "accent";
            return (
              <GlassCard key={a.id} className="relative overflow-hidden p-5">
                <div className={`pointer-events-none absolute inset-x-0 top-0 h-[3px] ${variant === "cyan" ? "bg-info/40" : variant === "emerald" ? "bg-success/40" : "bg-accent/40"}`} />
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Badge variant={variant}>{a.category}</Badge>
                    <span className="inline-flex items-center gap-1 rounded-md border border-line bg-paper px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-400">
                      <ShieldCheck className="h-3 w-3 text-accent" />
                      Platform · Pinned
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => openEdit(a)}
                      className="grid h-7 w-7 place-items-center rounded-lg text-ink-400 transition-colors hover:bg-surface-2 hover:text-ink"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(a)}
                      className="grid h-7 w-7 place-items-center rounded-lg text-ink-400 transition-colors hover:bg-danger-soft hover:text-danger-ink"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <h3 className="font-semibold text-ink">{a.title}</h3>
                <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-ink-700">{a.body}</p>
                <p className="mt-3 text-[11px] text-ink-400">
                  Posted by {a.authorName} · {timeAgo(a.createdAt)}
                </p>
              </GlassCard>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete platform announcement"
        message={
          deleteTarget
            ? <>Delete "{deleteTarget.title}"? This removes it from all tenant feeds and can't be undone.</>
            : null
        }
        loading={deleting}
        onConfirm={confirmDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
