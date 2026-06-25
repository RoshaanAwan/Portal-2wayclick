"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Hash,
  Lock,
  Send,
  Bell,
  Unplug,
  AlertCircle,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import type { SlackChannel, SlackMessage } from "@/lib/integrations/slack";

const OAUTH_ERRORS: Record<string, string> = {
  not_configured: "Slack sign-in isn’t configured on the server yet.",
  disabled: "Slack isn’t enabled for this workspace.",
  admin_only: "Only an admin can connect Slack.",
  use_lvh_host:
    "Slack doesn’t allow “localhost” for sign-in. Open the portal on the lvh.me address (e.g. http://<your-subdomain>.lvh.me:3000) and connect from there.",
  missing_code: "Slack didn’t return an authorization code. Try again.",
  bad_state: "Security check failed. Please start the connection again.",
  connect_failed: "Couldn’t complete the Slack connection. Try again.",
  access_denied: "You declined the Slack permission request.",
  // Slack's own error codes (passed through from oauth.v2.access).
  bad_redirect_uri:
    "The redirect URL doesn’t match. Add this exact URL to your Slack app → OAuth & Permissions → Redirect URLs: " +
    "https://<this-host>/api/integrations/slack/callback (no trailing slash, https).",
  invalid_code: "That authorization code is invalid or expired. Try connecting again.",
  code_already_used: "That authorization was already used. Start the connection again.",
  invalid_client_id:
    "The Slack Client ID is wrong. Check Basic Information → App Credentials (it looks like 1234567890.1234567890).",
  invalid_grant: "Slack rejected the authorization. Check the app credentials and try again.",
};

export function SlackWorkspace({
  channels,
  notifyChannelId,
  notifyChannelName,
  canManage,
}: {
  channels: SlackChannel[];
  notifyChannelId: string | null;
  notifyChannelName: string | null;
  canManage: boolean;
}) {
  const router = useRouter();
  const params = useSearchParams();

  const [active, setActive] = useState<string | null>(channels[0]?.id ?? null);
  const [messages, setMessages] = useState<SlackMessage[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [banner, setBanner] = useState<{ kind: "ok" | "err"; text: string } | null>(
    null,
  );
  const [notify, setNotify] = useState<{ id: string | null; name: string | null }>({
    id: notifyChannelId,
    name: notifyChannelName,
  });

  // Surface OAuth round-trip results (?connected=1 / ?error=…) once on mount.
  useEffect(() => {
    if (params.get("connected")) {
      setBanner({ kind: "ok", text: "Slack connected." });
    } else {
      const err = params.get("error");
      if (err) setBanner({ kind: "err", text: OAUTH_ERRORS[err] ?? "Slack error." });
    }
  }, [params]);

  const activeChannel = channels.find((c) => c.id === active) ?? null;

  // Load the active channel's history whenever the selection changes.
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    setLoadingMsgs(true);
    setMessages([]);
    fetch(`/api/integrations/slack/history?channel=${encodeURIComponent(active)}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d.error) setBanner({ kind: "err", text: d.error });
        else setMessages(d.messages ?? []);
      })
      .catch(() => {
        if (!cancelled) setBanner({ kind: "err", text: "Couldn’t load messages." });
      })
      .finally(() => !cancelled && setLoadingMsgs(false));
    return () => {
      cancelled = true;
    };
  }, [active]);

  async function send() {
    if (!active || !draft.trim() || posting) return;
    setPosting(true);
    setBanner(null);
    try {
      const res = await fetch("/api/integrations/slack/post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId: active, text: draft.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBanner({ kind: "err", text: data.error ?? "Couldn’t send the message." });
      } else {
        setDraft("");
        setBanner({ kind: "ok", text: "Message sent to Slack." });
        // Optimistically show it at the top (newest-first), matching the API author.
        setMessages((m) => [
          { ts: data.ts ?? String(Date.now() / 1000), user: "you", text: draft.trim() },
          ...m,
        ]);
      }
    } catch {
      setBanner({ kind: "err", text: "Couldn’t send the message." });
    } finally {
      setPosting(false);
    }
  }

  async function setNotifyChannel(channelId: string | null) {
    setBanner(null);
    try {
      const res = await fetch("/api/integrations/slack/channel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBanner({ kind: "err", text: data.error ?? "Couldn’t update routing." });
      } else {
        setNotify({ id: data.channelId, name: data.channelName });
        setBanner({
          kind: "ok",
          text: data.channelId
            ? `Portal notifications now post to #${data.channelName}.`
            : "Slack notification routing turned off.",
        });
      }
    } catch {
      setBanner({ kind: "err", text: "Couldn’t update routing." });
    }
  }

  async function disconnect() {
    if (!confirm("Disconnect Slack from this workspace?")) return;
    try {
      const res = await fetch("/api/integrations/slack/disconnect", { method: "POST" });
      if (res.ok) router.refresh();
      else setBanner({ kind: "err", text: "Disconnect failed." });
    } catch {
      setBanner({ kind: "err", text: "Disconnect failed." });
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

      {/* Admin controls: notification routing + disconnect. */}
      {canManage && (
        <GlassCard hover={false} className="flex flex-wrap items-center justify-between gap-3 p-3.5">
          <label className="flex items-center gap-2 text-sm text-ink-400">
            <Bell className="h-4 w-4 text-ink-300" />
            Route portal notifications to
            <select
              className="input h-9 w-auto py-0 text-sm"
              value={notify.id ?? ""}
              onChange={(e) => setNotifyChannel(e.target.value || null)}
            >
              <option value="">— Off —</option>
              {channels.map((c) => (
                <option key={c.id} value={c.id}>
                  #{c.name}
                </option>
              ))}
            </select>
          </label>
          <Button size="sm" variant="ghost" onClick={disconnect}>
            <Unplug className="h-4 w-4" /> Disconnect
          </Button>
        </GlassCard>
      )}

      <div className="grid gap-4 md:grid-cols-[14rem_1fr]">
        {/* Channel list */}
        <GlassCard hover={false} className="h-fit p-2">
          <p className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-ink-400">
            Channels
          </p>
          {channels.length === 0 ? (
            <p className="px-2 py-2 text-xs text-ink-400">No channels found.</p>
          ) : (
            <ul className="space-y-0.5">
              {channels.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setActive(c.id)}
                    className={cn(
                      "flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-sm transition-colors",
                      active === c.id
                        ? "bg-accent-soft text-accent-ink"
                        : "text-ink-500 hover:bg-surface-2 hover:text-ink",
                    )}
                  >
                    {c.isPrivate ? (
                      <Lock className="h-3.5 w-3.5 shrink-0" />
                    ) : (
                      <Hash className="h-3.5 w-3.5 shrink-0" />
                    )}
                    <span className="truncate">{c.name}</span>
                    {notify.id === c.id && (
                      <Bell className="ml-auto h-3 w-3 shrink-0 text-accent" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </GlassCard>

        {/* Message pane + composer */}
        <GlassCard hover={false} className="flex min-h-[24rem] flex-col p-0">
          <div className="flex items-center gap-1.5 border-b border-line px-4 py-3">
            {activeChannel?.isPrivate ? (
              <Lock className="h-4 w-4 text-ink-300" />
            ) : (
              <Hash className="h-4 w-4 text-ink-300" />
            )}
            <span className="text-sm font-semibold text-ink">
              {activeChannel?.name ?? "Select a channel"}
            </span>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {loadingMsgs ? (
              <div className="flex items-center justify-center py-10 text-ink-400">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : messages.length === 0 ? (
              <p className="py-10 text-center text-xs text-ink-400">
                {activeChannel
                  ? "No recent messages, or the bot isn’t a member of this channel."
                  : "Pick a channel to see its recent messages."}
              </p>
            ) : (
              messages.map((m) => (
                <div key={m.ts} className="text-sm">
                  <span className="font-medium text-ink-500">
                    {m.user ?? "unknown"}
                  </span>
                  <p className="whitespace-pre-wrap text-ink-300">{m.text}</p>
                </div>
              ))
            )}
          </div>

          {activeChannel && (
            <div className="flex items-center gap-2 border-t border-line p-3">
              <input
                className="input h-10 flex-1"
                placeholder={`Message #${activeChannel.name}`}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                maxLength={3000}
              />
              <Button size="sm" onClick={send} disabled={posting || !draft.trim()}>
                {posting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Send
              </Button>
            </div>
          )}
        </GlassCard>
      </div>
    </div>
  );
}
