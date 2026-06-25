"use client";

import { useState } from "react";
import {
  Mail,
  MailOpen,
  Send,
  PenSquare,
  Loader2,
  AlertCircle,
  CheckCircle2,
  ArrowLeft,
} from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import type { InboxMessage, FullMessage } from "@/lib/integrations/gmail";

type View = { mode: "list" } | { mode: "read"; id: string } | { mode: "compose" };

export function GmailWorkspace({
  inbox,
  canRead,
  canSend,
  fromEmail,
}: {
  inbox: InboxMessage[];
  canRead: boolean;
  canSend: boolean;
  fromEmail: string | null;
}) {
  const [view, setView] = useState<View>(canRead ? { mode: "list" } : { mode: "compose" });
  const [open, setOpen] = useState<FullMessage | null>(null);
  const [loadingMsg, setLoadingMsg] = useState(false);
  const [banner, setBanner] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  // Compose state.
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  async function openMessage(id: string) {
    setView({ mode: "read", id });
    setOpen(null);
    setLoadingMsg(true);
    setBanner(null);
    try {
      const res = await fetch(`/api/integrations/gmail/message?id=${encodeURIComponent(id)}`);
      const data = await res.json();
      if (!res.ok) setBanner({ kind: "err", text: data.error ?? "Couldn’t load the message." });
      else setOpen(data.message);
    } catch {
      setBanner({ kind: "err", text: "Couldn’t load the message." });
    } finally {
      setLoadingMsg(false);
    }
  }

  async function send() {
    if (sending) return;
    setSending(true);
    setBanner(null);
    try {
      const res = await fetch("/api/integrations/gmail/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: to.trim(), subject: subject.trim(), body }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBanner({ kind: "err", text: data.error ?? "Couldn’t send the email." });
      } else {
        setBanner({ kind: "ok", text: `Email sent to ${to.trim()}.` });
        setTo("");
        setSubject("");
        setBody("");
        if (canRead) setView({ mode: "list" });
      }
    } catch {
      setBanner({ kind: "err", text: "Couldn’t send the email." });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-4">
      {banner && (
        <div
          className={cn(
            "flex items-start gap-2 rounded-xl border px-3.5 py-2.5 text-sm",
            banner.kind === "ok"
              ? "border-success/30 bg-success-soft text-success-ink"
              : "border-danger/30 bg-danger-soft text-danger-ink",
          )}
        >
          {banner.kind === "ok" ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <span>{banner.text}</span>
        </div>
      )}

      {/* Top bar: compose / back. */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-400">
          {view.mode === "compose"
            ? "New message"
            : canRead
              ? `Inbox · ${inbox.length} recent`
              : "Compose"}
        </p>
        {canSend && view.mode !== "compose" && (
          <Button size="sm" onClick={() => setView({ mode: "compose" })}>
            <PenSquare className="h-4 w-4" /> Compose
          </Button>
        )}
        {view.mode !== "list" && canRead && (
          <Button size="sm" variant="ghost" onClick={() => setView({ mode: "list" })}>
            <ArrowLeft className="h-4 w-4" /> Inbox
          </Button>
        )}
      </div>

      {view.mode === "compose" ? (
        <GlassCard hover={false} className="space-y-3 p-4">
          <p className="text-xs text-ink-400">
            From <b className="text-ink-600">{fromEmail ?? "the workspace mailbox"}</b>
          </p>
          <input
            className="input"
            placeholder="To (recipient@example.com)"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            type="email"
          />
          <input
            className="input"
            placeholder="Subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
          <textarea
            className="input min-h-[12rem] resize-y"
            placeholder="Write your message…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <div className="flex justify-end">
            <Button
              onClick={send}
              disabled={sending || !to.trim() || !subject.trim() || !body.trim()}
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Send
            </Button>
          </div>
        </GlassCard>
      ) : view.mode === "read" ? (
        <GlassCard hover={false} className="min-h-[20rem] p-4">
          {loadingMsg ? (
            <div className="flex items-center justify-center py-16 text-ink-400">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : open ? (
            <div className="space-y-3">
              <h2 className="text-base font-semibold text-ink">{open.subject}</h2>
              <div className="space-y-0.5 text-xs text-ink-400">
                <p>From: {open.from}</p>
                {open.to && <p>To: {open.to}</p>}
                {open.date && <p>{open.date}</p>}
              </div>
              <p className="whitespace-pre-wrap border-t border-line pt-3 text-sm text-ink-300">
                {open.body || open.snippet || "(no text content)"}
              </p>
            </div>
          ) : (
            <p className="py-16 text-center text-xs text-ink-400">Message unavailable.</p>
          )}
        </GlassCard>
      ) : (
        // Inbox list
        <GlassCard hover={false} className="p-2">
          {inbox.length === 0 ? (
            <p className="px-2 py-8 text-center text-xs text-ink-400">Inbox is empty.</p>
          ) : (
            <ul className="divide-y divide-line">
              {inbox.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => openMessage(m.id)}
                    className="flex w-full items-start gap-3 px-2 py-2.5 text-left transition-colors hover:bg-surface-2"
                  >
                    {m.unread ? (
                      <Mail className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                    ) : (
                      <MailOpen className="mt-0.5 h-4 w-4 shrink-0 text-ink-300" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span
                          className={cn(
                            "truncate text-sm",
                            m.unread ? "font-semibold text-ink" : "text-ink-600",
                          )}
                        >
                          {m.from}
                        </span>
                      </div>
                      <p
                        className={cn(
                          "truncate text-sm",
                          m.unread ? "font-medium text-ink" : "text-ink-500",
                        )}
                      >
                        {m.subject}
                      </p>
                      <p className="truncate text-xs text-ink-400">{m.snippet}</p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </GlassCard>
      )}
    </div>
  );
}
