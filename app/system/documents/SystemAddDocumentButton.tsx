"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, X, UploadCloud, File as FileIcon } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { DOC_CATEGORIES } from "@/lib/constants";
import { cn, formatFileSize } from "@/lib/utils";
import { FILE_TYPE_META, type FileTypeKey } from "@/app/(app)/documents/fileTypes";

interface Uploaded {
  url: string;
  fileType: FileTypeKey;
  sizeKb: number;
  name: string;
}

export function SystemAddDocumentButton({
  currentUserName,
}: {
  currentUserName: string | null;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState("");

  const [uploaded, setUploaded] = useState<Uploaded | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<(typeof DOC_CATEGORIES)[number]>("General");

  const busy = uploading || saving;

  function reset() {
    setUploaded(null);
    setTitle("");
    setDescription("");
    setCategory("General");
    setError("");
    setDragOver(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function close() {
    if (busy) return;
    setOpen(false);
    reset();
  }

  function titleFromName(name: string) {
    return name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
  }

  async function handleFile(file: File) {
    setError("");
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/system/documents/upload", {
        method: "POST",
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Upload failed.");
        return;
      }
      setUploaded({
        url: data.url,
        fileType: data.fileType,
        sizeKb: data.sizeKb,
        name: data.name ?? file.name,
      });
      setTitle((t) => (t.trim() ? t : titleFromName(data.name ?? file.name)));
    } catch {
      setError("Couldn't upload the file. Check your connection.");
    } finally {
      setUploading(false);
    }
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (busy) return;
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!uploaded) {
      setError("Choose a file to upload first.");
      return;
    }
    if (!title.trim()) {
      setError("A title is required.");
      return;
    }
    setSaving(true);
    setError("");

    const res = await fetch("/api/system/documents/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim(),
        description: description.trim(),
        category,
        fileType: uploaded.fileType,
        sizeKb: uploaded.sizeKb,
        url: uploaded.url,
      }),
    });

    if (res.ok) {
      setOpen(false);
      reset();
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Could not save the document.");
      setSaving(false);
    }
  }

  const meta = uploaded ? FILE_TYPE_META[uploaded.fileType] : null;
  const TypeIcon = meta?.icon ?? FileIcon;

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
                        : "Share a file with the platform"}
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
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={onPick}
                />
                {!uploaded ? (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={onDrop}
                    disabled={uploading}
                    className={cn(
                      "flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition",
                      dragOver
                        ? "border-accent bg-accent-soft"
                        : "border-line bg-surface-2/50 hover:border-line-strong hover:bg-surface-2",
                    )}
                  >
                    <UploadCloud
                      className={cn(
                        "h-7 w-7",
                        uploading ? "animate-pulse text-accent" : "text-ink-400",
                      )}
                    />
                    <span className="text-sm font-medium text-ink-700">
                      {uploading ? "Uploading…" : "Click to choose a file, or drop it here"}
                    </span>
                    <span className="text-[11px] text-ink-400">
                      PDF, doc, sheet, slides, or image · up to 25 MB
                    </span>
                  </button>
                ) : (
                  <div className="flex items-center gap-3 rounded-xl border border-line bg-surface-2/60 px-3.5 py-3">
                    <div
                      className={cn(
                        "grid h-10 w-10 shrink-0 place-items-center rounded-lg border",
                        meta?.tile,
                      )}
                    >
                      <TypeIcon className={cn("h-5 w-5", meta?.icon_color)} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink" title={uploaded.name}>
                        {uploaded.name}
                      </p>
                      <p className="text-[11px] text-ink-400">
                        {meta?.label} · {formatFileSize(uploaded.sizeKb)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setUploaded(null);
                        if (fileInputRef.current) fileInputRef.current.value = "";
                      }}
                      className="text-[11px] font-medium text-ink-400 transition hover:text-danger-ink"
                    >
                      Replace
                    </button>
                  </div>
                )}

                <div>
                  <label className="mb-1.5 block text-xs font-medium text-ink-500">Title</label>
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    maxLength={120}
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
                  <label className="mb-1.5 block text-xs font-medium text-ink-500">Category</label>
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
                  <Button type="button" variant="ghost" onClick={close} disabled={busy}>
                    Cancel
                  </Button>
                  <Button type="submit" loading={saving} disabled={uploading || !uploaded}>
                    {!saving && <UploadCloud className="h-4 w-4" />}
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
