"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Pencil, Pin, Save, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ANNOUNCEMENT_CATEGORIES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { AnnouncementDTO } from "./AnnouncementsClient";

// ── Edit announcement modal ─────────────────────────────────────────────────
// Admin-only editor (gated upstream by canManage). PATCHes the post and
// refreshes the server data on success.

export function AnnouncementEditor({
  announcement,
  open,
  onClose,
}: {
  announcement: AnnouncementDTO;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(announcement.title);
  const [body, setBody] = useState(announcement.body);
  const [category, setCategory] = useState<
    (typeof ANNOUNCEMENT_CATEGORIES)[number]
  >(
    (ANNOUNCEMENT_CATEGORIES as readonly string[]).includes(announcement.category)
      ? (announcement.category as (typeof ANNOUNCEMENT_CATEGORIES)[number])
      : "General",
  );
  const [pinned, setPinned] = useState(announcement.pinned);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const canSubmit = title.trim().length >= 3 && body.trim().length > 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || loading) return;
    setLoading(true);
    setError("");

    const res = await fetch(`/api/announcements/${announcement.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim(),
        body: body.trim(),
        category,
        pinned,
      }),
    });

    if (res.ok) {
      onClose();
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Could not save changes.");
      setLoading(false);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:items-center">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => !loading && onClose()}
          />

          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            role="dialog"
            aria-modal="true"
            aria-label="Edit announcement"
            className="glass-strong relative z-10 my-auto w-full max-w-lg rounded-2xl p-6"
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-accent-soft">
                  <Pencil className="h-5 w-5 text-accent" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-ink">
                    Edit announcement
                  </h2>
                  <p className="text-xs text-ink-400">
                    Changes are visible to everyone immediately.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => !loading && onClose()}
                className="grid h-8 w-8 place-items-center rounded-lg text-ink-400 transition hover:bg-surface-2 hover:text-ink"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={submit} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-ink-500">
                  Title
                </label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={160}
                  required
                  placeholder="What's the headline?"
                  className="input"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-ink-500">
                  Body
                </label>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  maxLength={4000}
                  required
                  rows={5}
                  placeholder="Share the details with the team…"
                  className="input resize-y leading-relaxed"
                />
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-[160px] flex-1">
                  <label className="mb-1.5 block text-xs font-medium text-ink-500">
                    Category
                  </label>
                  <select
                    value={category}
                    onChange={(e) =>
                      setCategory(
                        e.target.value as (typeof ANNOUNCEMENT_CATEGORIES)[number],
                      )
                    }
                    className="input appearance-none [&>option]:bg-surface"
                  >
                    {ANNOUNCEMENT_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="self-end">
                  <button
                    type="button"
                    onClick={() => setPinned((p) => !p)}
                    aria-pressed={pinned}
                    className={cn(
                      "inline-flex h-[42px] items-center gap-2 rounded-xl border px-3.5 text-xs font-medium transition-colors",
                      pinned
                        ? "border-accent/30 bg-accent-soft text-accent-ink"
                        : "border-line bg-surface-2 text-ink-500 hover:border-line-strong hover:text-ink",
                    )}
                  >
                    <Pin className={cn("h-4 w-4", pinned && "fill-accent")} />
                    {pinned ? "Pinned" : "Pin post"}
                  </button>
                </div>
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

              <div className="flex justify-end gap-2 pt-1">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={onClose}
                  disabled={loading}
                >
                  Cancel
                </Button>
                <Button type="submit" loading={loading} disabled={!canSubmit}>
                  {!loading && <Save className="h-4 w-4" />}
                  Save changes
                </Button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
