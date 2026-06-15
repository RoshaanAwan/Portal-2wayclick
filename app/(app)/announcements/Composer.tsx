"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Pin, Send } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { ANNOUNCEMENT_CATEGORIES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { CurrentUser } from "./AnnouncementsClient";

export function Composer({
  currentUser,
  onDone,
}: {
  currentUser: CurrentUser;
  onDone: () => void;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] =
    useState<(typeof ANNOUNCEMENT_CATEGORIES)[number]>("General");
  const [pinned, setPinned] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const canPin = currentUser.role === "ADMIN" || currentUser.role === "MANAGER";
  const canSubmit = title.trim().length >= 3 && body.trim().length > 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || loading) return;
    setLoading(true);
    setError("");

    const res = await fetch("/api/announcements/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim(),
        body: body.trim(),
        category,
        pinned: canPin ? pinned : false,
      }),
    });

    if (res.ok) {
      setTitle("");
      setBody("");
      setCategory("General");
      setPinned(false);
      onDone();
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Could not publish post.");
      setLoading(false);
    }
  }

  return (
    <GlassCard strong glow hover={false} className="mb-1 p-5">
      <form onSubmit={submit} className="space-y-4">
        <div className="flex items-center gap-3">
          <Avatar
            name={currentUser.name}
            src={currentUser.avatarUrl}
            size="sm"
          />
          <div>
            <p className="text-sm font-medium text-ink">{currentUser.name}</p>
            <p className="text-[11px] text-ink-400">Posting to the company</p>
          </div>
        </div>

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
            rows={4}
            placeholder="Share the details with the team…"
            className="input resize-y leading-relaxed"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[160px]">
            <label className="mb-1.5 block text-xs font-medium text-ink-500">
              Category
            </label>
            <div className="relative">
              <select
                value={category}
                onChange={(e) =>
                  setCategory(
                    e.target.value as (typeof ANNOUNCEMENT_CATEGORIES)[number],
                  )
                }
                className="input appearance-none"
              >
                {ANNOUNCEMENT_CATEGORIES.map((c) => (
                  <option key={c} value={c} className="bg-surface text-ink">
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {canPin && (
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
                <Pin
                  className={cn("h-4 w-4", pinned && "fill-accent")}
                />
                {pinned ? "Pinned" : "Pin post"}
              </button>
            </div>
          )}
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

        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" size="sm" loading={loading} disabled={!canSubmit}>
            {!loading && <Send className="h-4 w-4" />}
            Publish
          </Button>
        </div>
      </form>
    </GlassCard>
  );
}
