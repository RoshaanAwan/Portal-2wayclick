"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Pencil, Save, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { ProjectDTO, MemberDTO } from "./ProjectsClient";

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
  const [projectLeadId, setProjectLeadId] = useState("");
  const [techLeadId, setTechLeadId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // Eligible leads = the project's actual members (admin can pick from these).
  const [eligibleLeads, setEligibleLeads] = useState<MemberDTO[]>([]);

  // Re-seed the form whenever a different project opens.
  useEffect(() => {
    if (project) {
      setName(project.name);
      setDescription(project.description ?? "");
      setProjectLeadId(project.projectLead?.id ?? "");
      setTechLeadId(project.techLead?.id ?? "");
      setError("");
    }
  }, [project]);

  // Load the project's full member roster so leads can only be members. Mirrors
  // MemberManager: intersect the member-id list with the user roster.
  useEffect(() => {
    if (!project) return;
    let cancelled = false;
    Promise.all([
      fetch(`/api/projects/${project.id}/members`).then((r) => r.json()),
      fetch("/api/projects/roster").then((r) => r.json()),
    ])
      .then(([ids, roster]) => {
        if (cancelled || !Array.isArray(ids) || !Array.isArray(roster)) return;
        const memberSet = new Set<string>(ids);
        setEligibleLeads(roster.filter((u: MemberDTO) => memberSet.has(u.id)));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [project?.id]);

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
        projectLeadId: projectLeadId || null,
        techLeadId: techLeadId || null,
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
                    Rename, edit the description, or set leads.
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

              {/* Leads — pick from the project's members, or leave unassigned. */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-ink-500">
                    Project lead
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
                    Tech lead
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
