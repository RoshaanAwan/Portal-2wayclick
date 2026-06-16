"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Pencil, Save, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { ProjectDTO } from "./ProjectsClient";

// ── Edit project modal ──────────────────────────────────────────────────────
// Admin-only (gated upstream). PATCHes the project's name/description; the board
// name is kept in sync server-side.

export function ProjectEditor({
  project,
  onClose,
}: {
  project: ProjectDTO | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Re-seed the form whenever a different project opens.
  useEffect(() => {
    if (project) {
      setName(project.name);
      setDescription(project.description ?? "");
      setError("");
    }
  }, [project]);

  // Close on Escape (ignored while saving).
  useEffect(() => {
    if (!project) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !loading) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [project, loading, onClose]);

  const canSubmit = name.trim().length >= 2;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!project || !canSubmit || loading) return;
    setLoading(true);
    setError("");

    const res = await fetch(`/api/projects/${project.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        description: description.trim(),
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
      {project && (
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
            aria-label="Edit project"
            className="glass-strong relative z-10 my-auto w-full max-w-md rounded-2xl p-6"
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-accent-soft">
                  <Pencil className="h-5 w-5 text-accent" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-ink">
                    Edit project
                  </h2>
                  <p className="text-xs text-ink-400">
                    Rename or update the description.
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
                  rows={3}
                  placeholder="What is this project about?"
                  className="input resize-y leading-relaxed"
                />
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
