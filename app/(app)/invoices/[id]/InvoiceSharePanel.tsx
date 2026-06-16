"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Copy, Link2, RefreshCw, Trash2 } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";

// Admin control for an invoice's public client link. The client opens it to view
// the invoice (read-only) without a portal login. Regenerate rotates the token
// (old link dies); revoke drops it entirely. Mirrors the project ShareLinkPanel.
export function InvoiceSharePanel({
  invoiceId,
  initialUrl,
}: {
  invoiceId: string;
  initialUrl: string | null;
}) {
  const router = useRouter();
  const [url, setUrl] = useState(initialUrl);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState<"regen" | "revoke" | null>(null);
  const [error, setError] = useState("");

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setError("Couldn't copy — select the link and copy manually.");
    }
  }

  async function act(action: "regenerate" | "revoke") {
    setBusy(action === "regenerate" ? "regen" : "revoke");
    setError("");
    const res = await fetch(`/api/invoices/${invoiceId}/share`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      setUrl(data.shareUrl ?? null);
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Something went wrong.");
    }
    setBusy(null);
  }

  return (
    <GlassCard hover={false} className="p-4">
      <div className="flex items-center gap-2.5">
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent-ink">
          <Link2 className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">Client link</p>
          <p className="text-[11px] text-ink-400">
            Share with your client so they can view this invoice online — no
            login needed.
          </p>
        </div>
      </div>

      <div className="mt-3">
        {url ? (
          <div className="flex flex-wrap items-center gap-2">
            <input
              readOnly
              value={url}
              onFocus={(e) => e.currentTarget.select()}
              className="input min-w-0 flex-1 font-mono text-xs"
            />
            <Button size="sm" variant="glass" onClick={copy}>
              {copied ? (
                <>
                  <Check className="h-4 w-4 text-success-ink" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" />
                  Copy
                </>
              )}
            </Button>
            <Button
              size="sm"
              variant="glass"
              onClick={() => act("regenerate")}
              loading={busy === "regen"}
              title="Issue a new link; the current one stops working"
            >
              {busy !== "regen" && <RefreshCw className="h-4 w-4" />}
              Regenerate
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={() => act("revoke")}
              loading={busy === "revoke"}
            >
              {busy !== "revoke" && <Trash2 className="h-4 w-4" />}
              Revoke
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-line bg-surface-2 px-3 py-2.5">
            <p className="text-xs text-ink-400">
              No client link yet. Create one to share this invoice online.
            </p>
            <Button
              size="sm"
              onClick={() => act("regenerate")}
              loading={busy === "regen"}
            >
              {busy !== "regen" && <Link2 className="h-4 w-4" />}
              Create link
            </Button>
          </div>
        )}
      </div>

      <AnimatePresence>
        {error && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-2 text-xs text-danger-ink"
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>
    </GlassCard>
  );
}
