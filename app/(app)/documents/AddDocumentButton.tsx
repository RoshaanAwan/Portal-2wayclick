"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, X, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { DOC_CATEGORIES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { FILE_TYPES, FILE_TYPE_META } from "./fileTypes";

export function AddDocumentButton({
  currentUserName,
}: {
  currentUserName: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<(typeof DOC_CATEGORIES)[number]>("General");
  const [fileType, setFileType] = useState<(typeof FILE_TYPES)[number]>("pdf");
  const [sizeKb, setSizeKb] = useState("");

  function reset() {
    setTitle("");
    setDescription("");
    setCategory("General");
    setFileType("pdf");
    setSizeKb("");
    setError("");
  }

  function close() {
    if (loading) return;
    setOpen(false);
    reset();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError("A title is required.");
      return;
    }
    setLoading(true);
    setError("");

    const res = await fetch("/api/documents/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim(),
        description: description.trim(),
        category,
        fileType,
        sizeKb: sizeKb.trim() === "" ? undefined : Number(sizeKb),
      }),
    });

    if (res.ok) {
      setOpen(false);
      reset();
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Could not add the document.");
      setLoading(false);
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} size="md">
        <Plus className="h-4 w-4" />
        Add document
      </Button>

      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:items-center">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-black/70 backdrop-blur-sm"
              onClick={close}
            />

            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.97 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              role="dialog"
              aria-modal="true"
              aria-label="Add document"
              className="glass-strong relative z-10 my-auto w-full max-w-lg rounded-2xl p-6"
            >
              <div className="mb-5 flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="grid h-11 w-11 place-items-center rounded-xl bg-accent-soft">
                    <UploadCloud className="h-5 w-5 text-accent" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-ink">Add a document</h2>
                    <p className="text-xs text-ink-400">
                      {currentUserName
                        ? `Uploading as ${currentUserName}`
                        : "Share a file with the team"}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={close}
                  className="grid h-8 w-8 place-items-center rounded-lg text-ink-400 transition hover:bg-surface-2 hover:text-ink"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-ink-500">
                    Title
                  </label>
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    autoFocus
                    maxLength={120}
                    placeholder="e.g. Q4 Strategy Deck"
                    className="input"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-medium text-ink-500">
                    Description{" "}
                    <span className="text-ink-300">(optional)</span>
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

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-ink-500">
                      Category
                    </label>
                    <select
                      value={category}
                      onChange={(e) =>
                        setCategory(
                          e.target.value as (typeof DOC_CATEGORIES)[number],
                        )
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

                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-ink-500">
                      Size{" "}
                      <span className="text-ink-300">(KB, optional)</span>
                    </label>
                    <input
                      value={sizeKb}
                      onChange={(e) =>
                        setSizeKb(e.target.value.replace(/[^0-9]/g, ""))
                      }
                      inputMode="numeric"
                      placeholder="0"
                      className="input"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-medium text-ink-500">
                    File type
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {FILE_TYPES.map((ft) => {
                      const meta = FILE_TYPE_META[ft];
                      const Icon = meta.icon;
                      const active = fileType === ft;
                      return (
                        <button
                          key={ft}
                          type="button"
                          onClick={() => setFileType(ft)}
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition",
                            active
                              ? "border-accent/30 bg-accent-soft text-accent-ink"
                              : "border-line bg-surface-2 text-ink-500 hover:text-ink hover:border-line-strong",
                          )}
                        >
                          <Icon
                            className={cn(
                              "h-3.5 w-3.5",
                              active ? meta.icon_color : "text-ink-400",
                            )}
                          />
                          {meta.label}
                        </button>
                      );
                    })}
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
                    onClick={close}
                    disabled={loading}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" loading={loading}>
                    {!loading && <UploadCloud className="h-4 w-4" />}
                    Add document
                  </Button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
