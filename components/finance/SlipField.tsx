"use client";

import { useRef, useState } from "react";
import { Paperclip, X, FileText, Loader2 } from "lucide-react";
import { formatFileSize } from "@/lib/utils";
import type { SlipMeta } from "@/lib/finance";

// A receipt/slip picker used by the expense form. Uploads the chosen file to
// POST /api/finance/upload immediately and reports the resulting
// { url, name, sizeKb } up via onChange. The parent stores that on submit.
export function SlipField({
  value,
  onChange,
  required,
}: {
  value: SlipMeta | null;
  onChange: (slip: SlipMeta | null) => void;
  required?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // reset so the same file can be re-picked
    if (!file) return;

    setUploading(true);
    setError("");
    const body = new FormData();
    body.append("file", file);
    const res = await fetch("/api/finance/upload", { method: "POST", body });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "Upload failed.");
    } else {
      onChange({ url: data.url, name: data.name, sizeKb: data.sizeKb });
    }
    setUploading(false);
  }

  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-ink-500">
        Receipt / slip{" "}
        {required ? (
          <span className="font-normal text-danger-ink">(required)</span>
        ) : (
          <span className="font-normal text-ink-400">(optional)</span>
        )}
      </label>

      {value ? (
        <div className="flex items-center gap-2.5 rounded-xl border border-line bg-surface-2 p-2.5">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line bg-surface text-accent">
            <FileText className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <a
              href={value.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block truncate text-sm font-medium text-ink hover:text-accent-ink"
            >
              {value.name}
            </a>
            <p className="text-[11px] text-ink-400">
              {formatFileSize(value.sizeKb)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onChange(null)}
            aria-label="Remove slip"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-line bg-surface text-ink-400 transition-colors hover:border-danger/40 hover:bg-danger-soft hover:text-danger-ink"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong bg-surface-2 px-3 py-3 text-sm text-ink-500 transition-colors hover:border-accent/40 hover:text-ink disabled:opacity-60"
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Paperclip className="h-4 w-4" />
          )}
          {uploading ? "Uploading…" : "Attach a PDF or image receipt"}
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,image/*"
        onChange={onPick}
        className="hidden"
      />

      {error && <p className="mt-1.5 text-xs text-danger-ink">{error}</p>}
    </div>
  );
}
