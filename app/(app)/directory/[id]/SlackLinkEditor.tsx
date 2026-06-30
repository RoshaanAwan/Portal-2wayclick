"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Slack, Check, Loader2 } from "lucide-react";

// Admin-only editor (rendered inside the directory detail page) for linking a
// person's Slack user ID. The attendance webhook uses this to attribute Slack
// check-in/out events to the right portal account. See docs/slack-attendance.md.

export function SlackLinkEditor({
  userId,
  initial,
  canEdit,
}: {
  userId: string;
  initial: string | null;
  // Whether the current viewer may change this Slack ID. When false the field is
  // shown read-only rather than as a Save button that's guaranteed to 403.
  canEdit: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initial ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = (value.trim() || null) !== (initial || null);

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/admin/users/slack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, slackUserId: value.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Couldn't save");
        return;
      }
      setSaved(true);
      router.refresh();
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <Slack className="h-4 w-4 text-ink-400" />
        <h2 className="eyebrow">Slack identity</h2>
      </div>
      <p className="mt-2 text-xs text-ink-400">
        Slack user ID for attendance check-ins. Find it in Slack → profile → “Copy
        member ID” (looks like{" "}
        <code className="rounded bg-surface-2 px-1 text-ink-500">U012ABCDEF</code>
        ).
      </p>
      {!canEdit ? (
        <div className="mt-3 rounded-lg border border-line bg-surface-2 px-3 py-2 font-mono text-sm text-ink-500">
          {initial || (
            <span className="font-sans text-ink-400">No Slack ID linked.</span>
          )}
        </div>
      ) : (
      <>
      <div className="mt-3 flex items-center gap-2">
        <input
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          placeholder="U012ABCDEF"
          spellCheck={false}
          className="min-w-0 flex-1 rounded-lg border border-line bg-surface-2 px-3 py-2 font-mono text-sm text-ink outline-none transition focus:border-accent/50"
        />
        <button
          onClick={save}
          disabled={!dirty || saving}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : saved ? (
            <Check className="h-4 w-4" />
          ) : null}
          {saved ? "Saved" : "Save"}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-rose-400">{error}</p>}
      </>
      )}
    </div>
  );
}
