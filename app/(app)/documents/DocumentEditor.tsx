"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Pencil, Save, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { DOC_CATEGORIES } from "@/lib/constants";
import type { DocItem } from "./DocumentLibrary";

// ── Edit document metadata modal ────────────────────────────────────────────
// Renamed/recategorized via PATCH /api/documents/[id]. The file itself isn't
// touched here — only its title, description, and category. Gated upstream
// (admins, or the document's own uploader).

export function DocumentEditor({
  doc,
  open,
  onClose,
}: {
  doc: DocItem;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(doc.title);
  const [description, setDescription] = useState(doc.description ?? "");
  const [category, setCategory] = useState<(typeof DOC_CATEGORIES)[number]>(
    (DOC_CATEGORIES as readonly string[]).includes(doc.category)
      ? (doc.category as (typeof DOC_CATEGORIES)[number])
      : "General",
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const canSubmit = title.trim().length > 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || loading) return;
    setLoading(true);
    setError("");

    const res = await fetch(`/api/documents/${doc.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim(),
        description: description.trim(),
        category,
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
            aria-label="Edit document"
            className="glass-strong relative z-10 my-auto w-full max-w-lg rounded-2xl p-6"
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-accent-soft">
                  <Pencil className="h-5 w-5 text-accent" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-ink">
                    Edit document
                  </h2>
                  <p className="text-xs text-ink-400">
                    Update the title, description, or category.
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
                  maxLength={120}
                  required
                  placeholder="e.g. Q4 Strategy Deck"
                  className="input"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-ink-500">
                  Description <span className="text-ink-300">(optional)</span>
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  maxLength={280}
                  placeholder="A short summary of what's inside."
                  className="input resize-none"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-ink-500">
                  Category
                </label>
                <select
                  value={category}
                  onChange={(e) =>
                    setCategory(e.target.value as (typeof DOC_CATEGORIES)[number])
                  }
                  className="input [&>option]:bg-surface"
                >
                  {DOC_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
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
