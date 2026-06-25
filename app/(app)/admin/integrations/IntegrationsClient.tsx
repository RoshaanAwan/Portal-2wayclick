"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Check,
  Loader2,
  KeyRound,
  ExternalLink,
  Copy,
  CheckCheck,
  HelpCircle,
  ChevronDown,
  FolderOpen,
  ArrowRight,
  Lock,
  Link as LinkIcon,
} from "lucide-react";
import Link from "next/link";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { integrationIcon } from "../../tools/integrationIcons";

interface Row {
  provider: string;
  name: string;
  description: string;
  icon: string;
  from: string;
  to: string;
  href: string;
  enabled: boolean;
  workspaceUrl: string;
  needsCredential: boolean;
  dashboard: string | null;
  connected: boolean;
  config: Record<string, unknown>;
}

interface SavePayload {
  enabled: boolean;
  workspaceUrl?: string;
  token?: string;
  config?: Record<string, unknown>;
}

/** Live Google Drive connection status (from the GoogleDriveConnection table) —
 *  distinct from a row's `connected`, which only means the client secret is
 *  saved. Drives the inline connect + folder steps on the Google Drive card. */
interface DriveStatus {
  /** The owner has completed the Google OAuth handshake. */
  accountConnected: boolean;
  email: string | null;
  /** A destination folder has been chosen. */
  folderSet: boolean;
  folderName: string | null;
  /** Folder link-sharing: true = "anyone with the link can view", false =
   *  Restricted. Only meaningful once folderSet. */
  folderShared: boolean;
}

interface IntegrationsClientProps {
  initial: Row[];
  /** True when the current admin is the Company Owner (SUPER_ADMIN) — only the
   *  owner can connect the Drive account and set the folder. */
  isOwner?: boolean;
  driveStatus?: DriveStatus;
  /** Render the inline Drive connect + folder setup on the Google Drive card.
   *  Tenant admin page → true; the System Owner page has its own SystemDriveCard,
   *  so it passes false to keep the embedded card to credential config only. */
  showDriveSetup?: boolean;
  apiBase?: string;
  testApiBase?: string;
}

const NO_DRIVE_STATUS: DriveStatus = {
  accountConnected: false,
  email: null,
  folderSet: false,
  folderName: null,
  folderShared: true,
};

function Toggle({
  on,
  onChange,
  disabled,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={cn(
        "relative h-6 w-11 shrink-0 rounded-full border transition-colors disabled:opacity-50",
        on ? "border-accent bg-accent" : "border-line bg-surface-2",
      )}
    >
      <motion.span
        layout
        transition={{ type: "spring", stiffness: 500, damping: 32 }}
        className={cn(
          "absolute top-0.5 rounded-full bg-white shadow-sm",
          on ? "right-0.5" : "left-0.5",
        )}
        style={{ height: 18, width: 18 }}
      />
    </button>
  );
}

/** Shared header: icon + name + status + the enable toggle. */
function CardHead({
  row,
  enabled,
  busy,
  savedFlash,
  onToggle,
  statusNote,
}: {
  row: Row;
  enabled: boolean;
  busy: boolean;
  savedFlash: boolean;
  onToggle: (v: boolean) => void;
  statusNote?: React.ReactNode;
}) {
  const Icon = integrationIcon(row.icon);
  return (
    <div className="flex items-center gap-3.5">
      <div
        className={cn(
          "grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br transition-opacity",
          row.from,
          row.to,
          !enabled && "opacity-50 grayscale",
        )}
      >
        <Icon className="h-[22px] w-[22px] text-white" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink">{row.name}</p>
        <p className="truncate text-xs text-ink-400">
          {statusNote ?? row.description}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {busy && <Loader2 className="h-4 w-4 animate-spin text-ink-300" />}
        {!busy && savedFlash && <Check className="h-4 w-4 text-success" />}
        <Toggle on={enabled} onChange={onToggle} disabled={busy} />
      </div>
    </div>
  );
}

/** Hook with the shared save logic — POSTs to the integrations endpoint. */
function useSave(provider: string, apiBase: string) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [savedFlash, setSavedFlash] = useState(false);

  async function save(payload: SavePayload): Promise<any | null> {
    setBusy(true);
    setError("");
    setSavedFlash(false);
    try {
      const res = await fetch(apiBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, ...payload }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Save failed");
        return null;
      }
      setSavedFlash(true);
      router.refresh();
      return data;
    } catch {
      setError("Save failed");
      return null;
    } finally {
      setBusy(false);
    }
  }

  return { busy, error, setError, savedFlash, setSavedFlash, save };
}

// ── Simple URL-only integration (Slack, Jira, …) ──────────────────────────────
function UrlCard({ row, apiBase }: { row: Row; apiBase: string }) {
  const { busy, error, setError, savedFlash, setSavedFlash, save } = useSave(
    row.provider,
    apiBase,
  );
  const [enabled, setEnabled] = useState(row.enabled);
  const [url, setUrl] = useState(row.workspaceUrl);
  const [savedUrl, setSavedUrl] = useState(row.workspaceUrl);
  const urlDirty = url.trim() !== savedUrl;

  async function onToggle(next: boolean) {
    const prev = enabled;
    setEnabled(next);
    const data = await save({ enabled: next, workspaceUrl: savedUrl });
    if (!data) setEnabled(prev);
  }

  async function onSaveUrl() {
    const data = await save({ enabled, workspaceUrl: url.trim() });
    if (data) {
      setSavedUrl(data.workspaceUrl ?? "");
      setUrl(data.workspaceUrl ?? "");
    }
  }

  return (
    <GlassCard hover={false}>
      <CardHead
        row={row}
        enabled={enabled}
        busy={busy}
        savedFlash={savedFlash}
        onToggle={onToggle}
      />
      {enabled && (
        <div className="mt-4 border-t border-line pt-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-ink-700">
              Workspace URL
            </span>
            <div className="flex items-center gap-2">
              <input
                type="url"
                className="input flex-1"
                value={url}
                placeholder={row.href}
                onChange={(e) => {
                  setUrl(e.target.value);
                  setSavedFlash(false);
                  setError("");
                }}
              />
              <Button
                type="button"
                variant="glass"
                size="sm"
                loading={busy}
                disabled={!urlDirty}
                onClick={onSaveUrl}
              >
                Save
              </Button>
            </div>
            <span className="mt-1 block text-xs text-ink-400">
              Where the tile links to. Leave blank to use {row.href}.
            </span>
          </label>
        </div>
      )}
      {error && <CardError text={error} />}
    </GlassCard>
  );
}

// ── Credential integration with an in-app dashboard (GitHub) ──────────────────
function GitHubCard({ row, apiBase, testApiBase }: { row: Row; apiBase: string; testApiBase: string }) {
  const { busy, error, setError, savedFlash, setSavedFlash, save } = useSave(
    row.provider,
    apiBase,
  );
  const [enabled, setEnabled] = useState(row.enabled);
  const [connected, setConnected] = useState(row.connected);
  const [token, setToken] = useState(""); // write-only; blank = keep existing
  const [org, setOrg] = useState((row.config.org as string) ?? "");
  const [repos, setRepos] = useState(
    Array.isArray(row.config.repos)
      ? (row.config.repos as string[]).join("\n")
      : "",
  );
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  function buildConfig() {
    return {
      org: org.trim(),
      repos: repos
        .split(/[\n,]/)
        .map((r) => r.trim())
        .filter(Boolean),
    };
  }

  async function onToggle(next: boolean) {
    const prev = enabled;
    setEnabled(next);
    setTestResult(null);
    const data = await save({
      enabled: next,
      token: token.trim() || undefined,
      config: buildConfig(),
    });
    if (!data) setEnabled(prev);
    else {
      setConnected(data.connected);
      setToken("");
    }
  }

  async function onSave() {
    setTestResult(null);
    const data = await save({
      enabled,
      token: token.trim() || undefined,
      config: buildConfig(),
    });
    if (data) {
      setConnected(data.connected);
      setToken("");
    }
  }

  async function onTest(testApiBase: string) {
    setTesting(true);
    setError("");
    setTestResult(null);
    try {
      const res = await fetch(testApiBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "github",
          token: token.trim() || undefined,
          config: buildConfig(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setError(data.error || "Test failed");
      else
        setTestResult(
          `✓ Connected as ${data.login} — ${data.repoCount} repo(s), ${data.prCount} open PR(s)` +
            (data.skipped?.length ? `, ${data.skipped.length} skipped` : ""),
        );
    } catch {
      setError("Test failed");
    } finally {
      setTesting(false);
    }
  }

  const statusNote = connected ? (
    <span className="inline-flex items-center gap-1 text-success">
      <KeyRound className="h-3 w-3" /> Token saved · {row.description}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-warn-ink">
      <KeyRound className="h-3 w-3" /> Needs a token · {row.description}
    </span>
  );

  return (
    <GlassCard hover={false}>
      <CardHead
        row={row}
        enabled={enabled}
        busy={busy}
        savedFlash={savedFlash}
        onToggle={onToggle}
        statusNote={statusNote}
      />

      <div className="mt-4 space-y-4 border-t border-line pt-4">
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-ink-700">
            Personal access token{" "}
            <span className="text-ink-400">(repo read scope)</span>
          </span>
          <input
            type="password"
            autoComplete="off"
            className="input"
            value={token}
            placeholder={connected ? "•••••••• (saved — leave blank to keep)" : "ghp_…"}
            onChange={(e) => {
              setToken(e.target.value);
              setSavedFlash(false);
              setError("");
              setTestResult(null);
            }}
          />
          <span className="mt-1 block text-xs text-ink-400">
            Create one at github.com → Settings → Developer settings → Personal
            access tokens. Stored encrypted; never shown again.
          </span>
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-ink-700">
              Organization / user{" "}
              <span className="text-ink-400">(optional)</span>
            </span>
            <input
              type="text"
              className="input"
              value={org}
              placeholder="acme-inc"
              onChange={(e) => {
                setOrg(e.target.value);
                setTestResult(null);
              }}
            />
            <span className="mt-1 block text-xs text-ink-400">
              Scans all its repos when no explicit list below.
            </span>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-ink-700">
              Repositories{" "}
              <span className="text-ink-400">(one per line, owner/repo)</span>
            </span>
            <textarea
              className="input min-h-[64px] resize-y"
              value={repos}
              placeholder={"acme-inc/web\nacme-inc/api"}
              onChange={(e) => {
                setRepos(e.target.value);
                setTestResult(null);
              }}
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" loading={busy} onClick={onSave}>
            Save
          </Button>
          <Button
            type="button"
            size="sm"
            variant="glass"
            loading={testing}
            onClick={() => onTest(testApiBase)}
          >
            Test connection
          </Button>
          {connected && row.dashboard && (
            <Link
              href={row.dashboard}
              className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Open dashboard
            </Link>
          )}
        </div>

        {testResult && (
          <p className="rounded-lg border border-success/40 bg-success-soft px-3 py-2 text-xs text-success-ink">
            {testResult}
          </p>
        )}
      </div>

      {error && <CardError text={error} />}
    </GlassCard>
  );
}

// ── Google Drive (per-USER OAuth) — admin sets the tenant's OWN Google app ─────
function GoogleDriveCard({
  row,
  apiBase,
  isOwner,
  driveStatus,
  showDriveSetup,
}: {
  row: Row;
  apiBase: string;
  isOwner: boolean;
  driveStatus: DriveStatus;
  showDriveSetup: boolean;
}) {
  const router = useRouter();
  const { busy, error, setError, savedFlash, setSavedFlash, save } = useSave(
    row.provider,
    apiBase,
  );
  const [enabled, setEnabled] = useState(row.enabled);
  const [connected, setConnected] = useState(row.connected); // = client secret saved
  const [clientId, setClientId] = useState(
    (row.config.googleClientId as string) ?? "",
  );
  const [clientSecret, setClientSecret] = useState(""); // write-only
  const [redirect, setRedirect] = useState("");
  const [copied, setCopied] = useState(false);

  // Folder step (owner only, after the account is OAuth-connected): paste a Drive
  // folder URL → POST /api/integrations/google/folder validates + stores it.
  const [folderUrl, setFolderUrl] = useState("");
  const [savingFolder, setSavingFolder] = useState(false);
  const [folderMsg, setFolderMsg] = useState<string | null>(null);

  // Link-sharing on the destination folder (owner only). Optimistic toggle;
  // reverts on failure.
  const [shared, setShared] = useState(driveStatus.folderShared);
  const [savingShare, setSavingShare] = useState(false);

  async function onChangeSharing(next: boolean) {
    if (savingShare || next === shared) return;
    const prev = shared;
    setShared(next); // optimistic
    setSavingShare(true);
    setError("");
    setFolderMsg(null);
    try {
      const res = await fetch("/api/integrations/google/folder/sharing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shared: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setShared(prev); // revert
        setError(data.error || "Couldn’t update the folder sharing.");
      } else {
        setFolderMsg(
          next
            ? "Anyone with the link can now view files in this folder."
            : "Folder is now restricted — only people you add can open it.",
        );
        router.refresh();
      }
    } catch {
      setShared(prev);
      setError("Couldn’t update the folder sharing.");
    } finally {
      setSavingShare(false);
    }
  }

  async function onSaveFolder(e: React.FormEvent) {
    e.preventDefault();
    if (!folderUrl.trim() || savingFolder) return;
    setSavingFolder(true);
    setError("");
    setFolderMsg(null);
    try {
      const res = await fetch("/api/integrations/google/folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderUrl }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setError(data.error || "Couldn’t set the folder.");
      else {
        setFolderMsg(
          `Files will now be saved to “${data.folder?.folderName ?? "your folder"}”.`,
        );
        setFolderUrl("");
        router.refresh();
      }
    } catch {
      setError("Couldn’t set the folder.");
    } finally {
      setSavingFolder(false);
    }
  }

  // The exact redirect URI this tenant must whitelist in their Google OAuth
  // client — derived from the current origin (subdomain-correct).
  useEffect(() => {
    setRedirect(`${window.location.origin}/api/integrations/google/callback`);
  }, []);

  function payload(nextEnabled: boolean): SavePayload {
    return {
      enabled: nextEnabled,
      token: clientSecret.trim() || undefined, // stored as the encrypted `secret`
      config: { googleClientId: clientId.trim() },
    };
  }

  async function onToggle(next: boolean) {
    const prev = enabled;
    setEnabled(next);
    const data = await save(payload(next));
    if (!data) setEnabled(prev);
    else {
      setConnected(data.connected);
      setClientSecret("");
    }
  }

  async function onSave() {
    const data = await save(payload(enabled));
    if (data) {
      setConnected(data.connected);
      setClientSecret("");
    }
  }

  async function copyRedirect() {
    try {
      await navigator.clipboard.writeText(redirect);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — the field is selectable anyway */
    }
  }

  const statusNote = connected ? (
    <span className="inline-flex items-center gap-1 text-success">
      <KeyRound className="h-3 w-3" /> Google app configured · users connect their
      own Drive
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-warn-ink">
      <KeyRound className="h-3 w-3" /> Add your Google app credentials
    </span>
  );

  return (
    <GlassCard hover={false}>
      <CardHead
        row={row}
        enabled={enabled}
        busy={busy}
        savedFlash={savedFlash}
        onToggle={onToggle}
        statusNote={statusNote}
      />

      <div className="mt-4 space-y-4 border-t border-line pt-4">
        <p className="text-xs text-ink-400">
          Connect your own Google app so files members upload land in the
          workspace Drive. A one-time, two-step setup:{" "}
          <b className="text-ink-600">1)</b> paste the Client ID and Secret here,
          then <b className="text-ink-600">2)</b> open the Drive dashboard to
          connect your Google account and choose the destination folder.
        </p>

        {/* Step-by-step guide to obtaining the credentials. */}
        <details className="group rounded-xl border border-line bg-surface-2/50">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-3.5 py-2.5 text-xs font-medium text-ink-700">
            <HelpCircle className="h-4 w-4 text-accent" />
            Full setup guide — credentials, connect &amp; folder
            <ChevronDown className="ml-auto h-4 w-4 text-ink-400 transition-transform group-open:rotate-180" />
          </summary>
          <ol className="space-y-2.5 border-t border-line px-4 py-3 text-xs text-ink-500">
            <li>
              <b className="text-ink-700">1.</b> Go to the{" "}
              <a
                href="https://console.cloud.google.com/projectcreate"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-accent hover:underline"
              >
                Google Cloud Console
              </a>{" "}
              and create a project (or pick an existing one).
            </li>
            <li>
              <b className="text-ink-700">2.</b> Open{" "}
              <a
                href="https://console.cloud.google.com/apis/library/drive.googleapis.com"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-accent hover:underline"
              >
                APIs &amp; Services → Library
              </a>
              , search <b>Google Drive API</b>, and click <b>Enable</b>.
            </li>
            <li>
              <b className="text-ink-700">3.</b> Under{" "}
              <a
                href="https://console.cloud.google.com/apis/credentials/consent"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-accent hover:underline"
              >
                OAuth consent screen
              </a>
              , pick <b>External</b>, fill the app name &amp; support email, and
              add your members as <b>Test users</b> (or publish the app).
            </li>
            <li>
              <b className="text-ink-700">4.</b> Go to{" "}
              <a
                href="https://console.cloud.google.com/apis/credentials"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-accent hover:underline"
              >
                Credentials → Create credentials → OAuth client ID
              </a>
              , and choose application type <b>Web application</b>.
            </li>
            <li>
              <b className="text-ink-700">5.</b> Under{" "}
              <b>Authorized redirect URIs</b>, click <b>Add URI</b> and paste the
              redirect URI shown below — it must match exactly.
            </li>
            <li>
              <b className="text-ink-700">6.</b> Click <b>Create</b>. Google shows
              your <b>Client ID</b> and <b>Client Secret</b> — copy them into the
              fields below and Save.
            </li>
            <li>
              <b className="text-ink-700">7.</b> Click <b>Connect Google Drive</b>{" "}
              below and sign in with the Google account that owns your storage —
              this links the workspace to that account.
            </li>
            <li>
              <b className="text-ink-700">8.</b> Open the Drive folder you want
              uploads saved to, copy its link from the browser address bar (it
              looks like{" "}
              <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[11px]">
                drive.google.com/drive/folders/1AbC…
              </code>
              ), and paste it in the <b>Destination folder</b> field below. The
              portal creates its own subfolder inside it and stores every upload
              there.
            </li>
          </ol>
        </details>

        {/* Redirect URI to copy into the Google OAuth client */}
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-ink-700">
            Authorized redirect URI{" "}
            <span className="text-ink-400">(add this in Google Cloud)</span>
          </span>
          <div className="flex items-center gap-2">
            <input
              readOnly
              className="input flex-1 font-mono text-xs"
              value={redirect}
              onFocus={(e) => e.currentTarget.select()}
            />
            <Button type="button" variant="glass" size="sm" onClick={copyRedirect}>
              {copied ? (
                <CheckCheck className="h-4 w-4" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-ink-700">
              Client ID
            </span>
            <input
              type="text"
              className="input"
              value={clientId}
              placeholder="xxxx.apps.googleusercontent.com"
              onChange={(e) => {
                setClientId(e.target.value);
                setSavedFlash(false);
                setError("");
              }}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-ink-700">
              Client Secret
            </span>
            <input
              type="password"
              autoComplete="off"
              className="input"
              value={clientSecret}
              placeholder={
                connected ? "•••••••• (saved — leave blank to keep)" : "GOCSPX-…"
              }
              onChange={(e) => {
                setClientSecret(e.target.value);
                setSavedFlash(false);
                setError("");
              }}
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" loading={busy} onClick={onSave}>
            Save
          </Button>
        </div>

        {/* Steps 7–8, inline. Once the credentials are saved the rest of the
            setup happens right here on this card:
              • not OAuth-connected → "Connect Google Drive" (owner) / wait note
              • connected, no folder → the Destination folder URL field (owner)
              • folder set          → confirmation + "Change folder"
            Connect + folder are owner-only (SUPER_ADMIN); a non-owner admin can
            save credentials but is told the owner must finish. */}
        {connected && showDriveSetup && (
          <div className="space-y-3 border-t border-line pt-4">
            {!driveStatus.accountConnected ? (
              isOwner ? (
                <div className="flex flex-wrap items-center gap-3 rounded-xl border border-accent/30 bg-accent-soft/40 px-3.5 py-3">
                  <div className="min-w-0 flex-1 text-xs text-ink-600">
                    <p className="font-medium text-ink-700">
                      Step 7 — connect your Google account
                    </p>
                    <p className="mt-0.5">
                      Sign in with the Google account that owns your storage. A
                      one-time consent; you can disconnect anytime.
                    </p>
                  </div>
                  {/* Plain link → full-page redirect to Google's consent screen. */}
                  <a href="/api/integrations/google/connect">
                    <Button type="button" size="sm">
                      <KeyRound className="h-4 w-4" /> Connect Google Drive
                    </Button>
                  </a>
                </div>
              ) : (
                <p className="rounded-xl border border-line bg-surface-2/60 px-3.5 py-3 text-xs text-ink-500">
                  Credentials saved. Your company owner now needs to connect the
                  Google account and choose a destination folder before uploads
                  work.
                </p>
              )
            ) : (
              <>
                {/* Connected — show the account + folder status. */}
                <div className="flex items-center gap-2 text-xs text-ink-500">
                  <Check className="h-3.5 w-3.5 shrink-0 text-success" />
                  <span className="truncate">
                    Connected as{" "}
                    <b className="text-ink-700">
                      {driveStatus.email ?? "your Google account"}
                    </b>
                    {driveStatus.folderSet && (
                      <>
                        {" "}
                        · saving to{" "}
                        <b className="text-ink-700">
                          {driveStatus.folderName ?? "your folder"}
                        </b>
                      </>
                    )}
                  </span>
                </div>

                {/* Folder field — owner only. Shown to set the folder when none
                    is chosen yet, and (collapsed under a label) to change it. */}
                {isOwner && (
                  <div>
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-medium text-ink-700">
                        {driveStatus.folderSet
                          ? "Change destination folder"
                          : "Step 8 — Destination folder"}{" "}
                        <span className="text-ink-400">
                          (paste a Google Drive folder link)
                        </span>
                      </span>
                      <form
                        onSubmit={onSaveFolder}
                        className="flex flex-col gap-2 sm:flex-row"
                      >
                        <input
                          type="url"
                          inputMode="url"
                          value={folderUrl}
                          onChange={(e) => {
                            setFolderUrl(e.target.value);
                            setFolderMsg(null);
                            setError("");
                          }}
                          placeholder="https://drive.google.com/drive/folders/…"
                          className="input flex-1 font-mono text-xs"
                          disabled={savingFolder}
                        />
                        <Button
                          type="submit"
                          size="sm"
                          loading={savingFolder}
                          disabled={!folderUrl.trim()}
                        >
                          <FolderOpen className="h-4 w-4" />{" "}
                          {driveStatus.folderSet ? "Update" : "Save folder"}
                        </Button>
                      </form>
                    </label>
                    <p className="mt-1.5 text-[11px] text-ink-400">
                      Open the folder in Google Drive and copy the link from your
                      browser’s address bar. The portal creates its own subfolder
                      inside it and keeps every upload there.
                    </p>
                    {folderMsg && (
                      <p className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-success-ink">
                        <Check className="h-3 w-3" /> {folderMsg}
                      </p>
                    )}
                  </div>
                )}

                {/* Folder link-sharing (owner only, once a folder is set). Pick
                    Restricted vs. "anyone with the link can view". */}
                {isOwner && driveStatus.folderSet && (
                  <div>
                    <span className="mb-1.5 block text-xs font-medium text-ink-700">
                      Folder access{" "}
                      {savingShare && (
                        <Loader2 className="ml-1 inline h-3 w-3 animate-spin text-ink-300" />
                      )}
                    </span>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <SharingChoice
                        active={!shared}
                        disabled={savingShare}
                        onClick={() => onChangeSharing(false)}
                        icon={<Lock className="h-4 w-4" />}
                        title="Restricted"
                        desc="Only people you add in Drive can open the files."
                      />
                      <SharingChoice
                        active={shared}
                        disabled={savingShare}
                        onClick={() => onChangeSharing(true)}
                        icon={<LinkIcon className="h-4 w-4" />}
                        title="Anyone with the link"
                        desc="Anyone holding a file's link can view it — no sign-in."
                      />
                    </div>
                    {shared && (
                      <p className="mt-1.5 text-[11px] text-warn-ink">
                        Files in this folder are viewable by anyone with the link.
                      </p>
                    )}
                  </div>
                )}

                {/* Live dashboard link once everything's wired up. */}
                {driveStatus.folderSet && row.dashboard && (
                  <Link
                    href={row.dashboard}
                    className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
                  >
                    Open Drive dashboard
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {error && <CardError text={error} />}
    </GlassCard>
  );
}

function CardError({ text }: { text: string }) {
  return (
    <p className="mt-3 rounded-lg border border-danger/40 bg-danger-soft px-3 py-2 text-xs text-danger">
      {text}
    </p>
  );
}

/** One selectable card in the folder-access (Restricted / Anyone-with-link)
 *  picker. Highlights when active. */
function SharingChoice({
  active,
  disabled,
  onClick,
  icon,
  title,
  desc,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={cn(
        "flex items-start gap-2.5 rounded-xl border p-3 text-left transition-colors disabled:opacity-60",
        active
          ? "border-accent/40 bg-accent-soft"
          : "border-line bg-surface-2 hover:border-line-strong",
      )}
    >
      <span
        className={cn(
          "mt-0.5 shrink-0",
          active ? "text-accent" : "text-ink-400",
        )}
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span
          className={cn(
            "block text-xs font-semibold",
            active ? "text-accent-ink" : "text-ink-700",
          )}
        >
          {title}
        </span>
        <span className="mt-0.5 block text-[11px] text-ink-400">{desc}</span>
      </span>
    </button>
  );
}

export function IntegrationsClient({
  initial,
  isOwner = false,
  driveStatus = NO_DRIVE_STATUS,
  showDriveSetup = true,
  apiBase = "/api/admin/integrations",
  testApiBase,
}: IntegrationsClientProps) {
  const connected = initial.filter((r) => r.enabled).length;
  const resolvedTestApiBase = testApiBase ?? `${apiBase}/test`;

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-400">
        {connected} of {initial.length} connected. Toggling an app on adds it to
        the Tools launchpad for everyone in your workspace.
      </p>
      <div className="grid grid-cols-1 gap-3">
        {initial.map((row) =>
          row.provider === "github" ? (
            <GitHubCard
              key={row.provider}
              row={row}
              apiBase={apiBase}
              testApiBase={resolvedTestApiBase}
            />
          ) : row.provider === "google-drive" ? (
            <GoogleDriveCard
              key={row.provider}
              row={row}
              apiBase={apiBase}
              isOwner={isOwner}
              driveStatus={driveStatus}
              showDriveSetup={showDriveSetup}
            />
          ) : (
            <UrlCard key={row.provider} row={row} apiBase={apiBase} />
          ),
        )}
      </div>
    </div>
  );
}
