"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import {
  HardDrive,
  Upload,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Unplug,
  AlertCircle,
  CheckCircle2,
  FolderOpen,
  FolderCog,
} from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { timeAgo } from "@/lib/utils";
import type { DriveFile } from "@/lib/integrations/googleDrive";

function humanSize(n: number | null): string {
  if (n == null) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

const OAUTH_ERRORS: Record<string, string> = {
  not_configured: "Google sign-in isn’t configured on the server yet.",
  disabled: "Google Drive isn’t enabled for this workspace.",
  owner_only: "Only the company owner can connect the workspace Drive.",
  use_lvh_host:
    "Google doesn’t allow “localhost” for sign-in. Open the portal on the lvh.me address instead (e.g. http://<your-subdomain>.lvh.me:3000) and connect from there.",
  missing_code: "Google didn’t return an authorization code. Try again.",
  bad_state: "Security check failed. Please start the connection again.",
  no_refresh_token:
    "Google didn’t return a refresh token. Remove this app at myaccount.google.com → Security → Third-party access, then reconnect.",
  connect_failed: "Couldn’t complete the Google connection. Try again.",
  access_denied: "You declined the Google permission request.",
};

export function GoogleDriveClient({
  connected,
  isOwner,
  email,
  folderId,
  folderName,
  files,
  loadError,
  oauthError,
  justConnected,
}: {
  connected: boolean;
  isOwner: boolean;
  email: string | null;
  folderId: string | null;
  folderName: string | null;
  files: DriveFile[];
  loadError: string | null;
  oauthError: string | null;
  justConnected: boolean;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [msg, setMsg] = useState<string | null>(
    justConnected ? "Google Drive connected. Now choose a folder for your files." : null,
  );
  const [error, setError] = useState<string | null>(
    oauthError ? (OAUTH_ERRORS[oauthError] ?? "Couldn’t connect Google Drive.") : null,
  );

  // Folder picker (owner only): paste a Drive folder URL → portal creates its
  // subfolder there and stores it as the upload destination.
  const [folderUrl, setFolderUrl] = useState("");
  const [savingFolder, setSavingFolder] = useState(false);
  const [changingFolder, setChangingFolder] = useState(false);

  async function onSaveFolder(e: React.FormEvent) {
    e.preventDefault();
    if (!folderUrl.trim()) return;
    setSavingFolder(true);
    setError(null);
    setMsg(null);
    try {
      const res = await fetch("/api/integrations/google/folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderUrl }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setError(data.error || "Couldn’t set the folder.");
      else {
        setMsg(`Files will now be saved to “${data.folder?.folderName ?? "your folder"}”.`);
        setFolderUrl("");
        setChangingFolder(false);
        router.refresh();
      }
    } catch {
      setError("Couldn’t set the folder.");
    } finally {
      setSavingFolder(false);
    }
  }

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    setError(null);
    setMsg(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/integrations/google/upload", {
        method: "POST",
        body,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setError(data.error || "Upload failed");
      else {
        setMsg(`Uploaded “${data.file?.name ?? file.name}” to the workspace Drive.`);
        router.refresh();
      }
    } catch {
      setError("Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function onDisconnect() {
    setDisconnecting(true);
    setError(null);
    try {
      const res = await fetch("/api/integrations/google/disconnect", {
        method: "POST",
      });
      if (!res.ok) setError("Disconnect failed");
      else router.refresh();
    } catch {
      setError("Disconnect failed");
    } finally {
      setDisconnecting(false);
    }
  }

  // ── Not connected ───────────────────────────────────────────────────────────
  // Owner sees the connect CTA; everyone else is told to ask the owner.
  if (!connected) {
    return (
      <div className="space-y-4">
        {error && <Banner kind="error" text={error} />}
        <GlassCard hover={false} className="flex flex-col items-center gap-3 py-12 text-center">
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-br from-[#1FA463] to-[#FFCF63]">
            <HardDrive className="h-6 w-6 text-white" />
          </div>
          {isOwner ? (
            <>
              <p className="text-sm font-medium text-ink">
                Connect the workspace Google Drive
              </p>
              <p className="max-w-md text-xs text-ink-400">
                As the company owner, connect your Google account once — every
                file your team uploads in the portal (documents, photos,
                receipts) will be stored in your Drive.
              </p>
              <p className="max-w-md text-xs text-ink-400">
                After connecting you’ll paste the link to a Drive folder you’ve
                given the account edit access to. The portal creates its own
                folder inside it and keeps all uploads there.
              </p>
              {/* A plain link so the browser does a full-page redirect to Google. */}
              <a href="/api/integrations/google/connect" className="mt-1">
                <Button size="sm">
                  <HardDrive className="h-4 w-4" /> Connect Google Drive
                </Button>
              </a>
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-ink">
                Workspace Drive isn’t connected
              </p>
              <p className="max-w-md text-xs text-ink-400">
                Your company owner needs to connect the workspace’s Google Drive
                before files can be uploaded. Please ask them to set it up.
              </p>
            </>
          )}
        </GlassCard>
      </div>
    );
  }

  // ── Connected: account row + upload + file list ─────────────────────────────
  return (
    <div className="space-y-4">
      {msg && <Banner kind="ok" text={msg} />}
      {error && <Banner kind="error" text={error} />}

      <GlassCard hover={false} className="flex flex-wrap items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-[#1FA463] to-[#FFCF63]">
          <HardDrive className="h-5 w-5 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">
            Workspace Drive connected
          </p>
          <p className="truncate text-xs text-ink-400">
            {email ?? "Google account"}
            {!isOwner && " · managed by your company owner"}
          </p>
          {folderId && (
            <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-ink-400">
              <FolderOpen className="h-3.5 w-3.5 shrink-0 text-ink-300" />
              Saving to “{folderName ?? "your folder"}”
            </p>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          onChange={onPick}
          disabled={uploading}
        />
        <Button
          size="sm"
          loading={uploading}
          disabled={!folderId}
          onClick={() => fileRef.current?.click()}
        >
          {uploading ? (
            "Uploading…"
          ) : (
            <>
              <Upload className="h-4 w-4" /> Upload to Drive
            </>
          )}
        </Button>
        {isOwner && folderId && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setChangingFolder((v) => !v);
              setError(null);
            }}
          >
            <FolderCog className="h-4 w-4" /> Change folder
          </Button>
        )}
        {isOwner && (
        <Button
          size="sm"
          variant="ghost"
          loading={disconnecting}
          onClick={onDisconnect}
        >
          <Unplug className="h-4 w-4" /> Disconnect
        </Button>
        )}
      </GlassCard>

      {/* Folder step. Owner sees the picker when no folder is set yet, or when
          they tap "Change folder". Non-owners just see a wait notice. */}
      {!folderId && isOwner && (
        <FolderPicker
          folderUrl={folderUrl}
          setFolderUrl={setFolderUrl}
          saving={savingFolder}
          onSubmit={onSaveFolder}
          heading="Choose where your files are saved"
          intro="Paste the link to a Google Drive folder your connected account can edit. The portal will create its own folder inside it and store every upload there."
        />
      )}
      {!folderId && !isOwner && (
        <GlassCard hover={false} className="flex flex-col items-center gap-2 py-8 text-center">
          <FolderOpen className="h-6 w-6 text-ink-300" />
          <p className="text-sm font-medium text-ink">
            Drive folder not set up yet
          </p>
          <p className="max-w-md text-xs text-ink-400">
            Your company owner still needs to choose a destination folder before
            files can be uploaded.
          </p>
        </GlassCard>
      )}
      {folderId && isOwner && changingFolder && (
        <FolderPicker
          folderUrl={folderUrl}
          setFolderUrl={setFolderUrl}
          saving={savingFolder}
          onSubmit={onSaveFolder}
          heading="Change the destination folder"
          intro="Paste a new Drive folder link. A fresh portal folder is created inside it; existing files stay where they are."
        />
      )}

      {folderId && (loadError ? (
        <Banner kind="error" text={loadError} />
      ) : files.length === 0 ? (
        <GlassCard hover={false} className="flex flex-col items-center gap-2 py-10 text-center">
          <HardDrive className="h-6 w-6 text-ink-300" />
          <p className="text-sm font-medium text-ink">No files yet</p>
          <p className="text-xs text-ink-400">
            Files you upload here will appear in this list and in your Google
            Drive.
          </p>
        </GlassCard>
      ) : (
        <div className="space-y-2.5">
          <p className="text-xs text-ink-400">
            {files.length} file{files.length === 1 ? "" : "s"} uploaded from the
            portal
          </p>
          {files.map((f) => {
            const isImage = f.mimeType.startsWith("image/");
            return (
              <a
                key={f.id}
                href={f.webViewLink ?? "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="group block"
              >
                <GlassCard hover className="flex items-center gap-3.5 p-3.5">
                  <div className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-lg bg-surface-2">
                    {isImage && f.thumbnailLink ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={f.thumbnailLink}
                        alt={f.name}
                        className="h-full w-full object-cover"
                      />
                    ) : isImage ? (
                      <ImageIcon className="h-5 w-5 text-ink-400" />
                    ) : (
                      <FileText className="h-5 w-5 text-ink-400" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">
                      {f.name}
                    </p>
                    <p className="text-xs text-ink-400">
                      {humanSize(f.size)}
                      {f.size != null ? " · " : ""}updated {timeAgo(f.modifiedTime)}
                    </p>
                  </div>
                  <ExternalLink className="h-4 w-4 shrink-0 text-ink-300 transition-colors group-hover:text-accent" />
                </GlassCard>
              </a>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function FolderPicker({
  folderUrl,
  setFolderUrl,
  saving,
  onSubmit,
  heading,
  intro,
}: {
  folderUrl: string;
  setFolderUrl: (v: string) => void;
  saving: boolean;
  onSubmit: (e: React.FormEvent) => void;
  heading: string;
  intro: string;
}) {
  return (
    <GlassCard hover={false} className="space-y-3">
      <div className="flex items-start gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-surface-2">
          <FolderOpen className="h-5 w-5 text-ink-400" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">{heading}</p>
          <p className="mt-0.5 text-xs text-ink-400">{intro}</p>
        </div>
      </div>
      <form onSubmit={onSubmit} className="flex flex-col gap-2 sm:flex-row">
        <input
          type="url"
          inputMode="url"
          value={folderUrl}
          onChange={(e) => setFolderUrl(e.target.value)}
          placeholder="https://drive.google.com/drive/folders/…"
          className="flex-1 rounded-xl border border-border bg-surface-1 px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-300 focus:border-accent focus:outline-none"
          disabled={saving}
        />
        <Button size="sm" type="submit" loading={saving} disabled={!folderUrl.trim()}>
          <FolderOpen className="h-4 w-4" /> {saving ? "Saving…" : "Save folder"}
        </Button>
      </form>
      {/* How to get the folder URL — the field above expects the link from a
          folder's address bar, not a shared link or the My Drive root. */}
      <ol className="space-y-1 text-xs text-ink-400">
        <li>
          <b className="text-ink-600">1.</b> Open{" "}
          <a
            href="https://drive.google.com/drive/my-drive"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-accent hover:underline"
          >
            Google Drive
          </a>{" "}
          in the account you just connected and open (or create) the folder you
          want uploads saved to.
        </li>
        <li>
          <b className="text-ink-600">2.</b> Copy the link from your browser’s
          address bar — it looks like{" "}
          <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[11px] text-ink-600">
            https://drive.google.com/drive/folders/1AbC…
          </code>
          .
        </li>
        <li>
          <b className="text-ink-600">3.</b> Paste it above and Save. The portal
          creates its own subfolder inside it and keeps every upload there.
        </li>
      </ol>
    </GlassCard>
  );
}

function Banner({ kind, text }: { kind: "ok" | "error"; text: string }) {
  return (
    <p
      className={
        kind === "ok"
          ? "flex items-center gap-2 rounded-xl border border-success/40 bg-success-soft px-3.5 py-2.5 text-sm text-success-ink"
          : "flex items-center gap-2 rounded-xl border border-danger/40 bg-danger-soft px-3.5 py-2.5 text-sm text-danger"
      }
    >
      {kind === "ok" ? (
        <CheckCircle2 className="h-4 w-4 shrink-0" />
      ) : (
        <AlertCircle className="h-4 w-4 shrink-0" />
      )}
      {text}
    </p>
  );
}
