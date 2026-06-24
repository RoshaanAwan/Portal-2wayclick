"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { HardDrive, CheckCircle2, Link2Off, Loader2, AlertTriangle } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";

export function SystemDriveCard({
  initialEmail,
  redirectTo,
}: {
  initialEmail: string | null;
  redirectTo: string;
}) {
  const router = useRouter();
  const [connected, setConnected] = useState(!!initialEmail);
  const [googleEmail, setGoogleEmail] = useState(initialEmail);
  const [disconnecting, setDisconnecting] = useState(false);
  const [message, setMessage] = useState(connected ? "Google Drive is connected." : "Connect your Google Drive to upload files, avatars, and documents.");

  async function disconnectDrive() {
    if (disconnecting) return;
    setDisconnecting(true);
    const res = await fetch("/api/system/google/disconnect", { method: "POST" });
    setDisconnecting(false);
    if (res.ok) {
      setConnected(false);
      setGoogleEmail(null);
      setMessage("Google Drive disconnected.");
      router.refresh();
    } else {
      setMessage("Disconnect failed. Try again.");
    }
  }

  return (
    <GlassCard hover={false} className="p-6">
      <div className="flex items-start gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-[#1FA463] to-[#FFCF63] text-white">
          <HardDrive className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">Google Drive</p>
          <p className="mt-1 text-xs text-ink-400">
            Connect your Drive to save uploads, documents, and avatars in one place.
          </p>
        </div>
      </div>

      <div className="mt-5 space-y-4">
        <div className="rounded-3xl border border-line bg-surface-2 px-4 py-3 text-sm text-ink-600">
          {connected ? (
            <span className="inline-flex items-center gap-2 text-ink-700">
              <CheckCircle2 className="h-4 w-4 text-success" />
              Connected as {googleEmail}
            </span>
          ) : (
            <span className="inline-flex items-center gap-2 text-ink-500">
              <AlertTriangle className="h-4 w-4 text-ink-400" />
              Not connected yet
            </span>
          )}
        </div>

        <p className="text-sm leading-6 text-ink-600">{message}</p>

        <div className="flex flex-wrap gap-3">
          <a
            className="inline-flex items-center gap-2 rounded-full border border-line bg-surface-2 px-4 py-2 text-sm font-semibold text-ink transition hover:bg-surface-3"
            href={`/api/system/google/connect?redirectTo=${encodeURIComponent(redirectTo)}`}
          >
            <HardDrive className="h-4 w-4" />
            {connected ? "Reconnect Drive" : "Connect Google Drive"}
          </a>
          {connected && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              loading={disconnecting}
              onClick={disconnectDrive}
              className="text-danger-ink"
            >
              <Link2Off className="h-4 w-4" />
              Disconnect
            </Button>
          )}
        </div>
      </div>
    </GlassCard>
  );
}
