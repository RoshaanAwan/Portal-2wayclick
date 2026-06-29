"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2, HardDrive, CheckCircle2, AlertCircle, Link2Off } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { ImageAdjustModal } from "@/components/ui/ImageAdjustModal";

export function SystemSettingsClient({
  initialName,
  email,
  initialAvatarUrl,
  driveEmail,
  driveJustConnected,
  driveError,
}: {
  initialName: string;
  email: string;
  initialAvatarUrl: string | null;
  driveEmail: string | null;
  driveJustConnected: boolean;
  driveError: string | null;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  // Drive
  const [connected, setConnected] = useState(!!driveEmail);
  const [connectedEmail, setConnectedEmail] = useState(driveEmail);
  const [disconnecting, setDisconnecting] = useState(false);
  const [driveMsg, setDriveMsg] = useState(
    driveJustConnected ? "Google Drive connected." : driveError ? driveError.replace(/_/g, " ") : "",
  );

  async function disconnectDrive() {
    if (disconnecting) return;
    setDisconnecting(true);
    const res = await fetch("/api/system/google/disconnect", { method: "POST" });
    setDisconnecting(false);
    if (res.ok) { setConnected(false); setConnectedEmail(null); setDriveMsg("Drive disconnected."); router.refresh(); }
    else setDriveMsg("Disconnect failed. Try again.");
  }

  // Avatar
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState("");
  // Picked file awaiting crop/zoom in the adjust modal (null = closed).
  const [avatarPending, setAvatarPending] = useState<File | null>(null);

  // Profile
  const [name, setName] = useState(initialName);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState("");

  // Password
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState("");

  // Picking a file opens the adjust modal; the cropped result is uploaded.
  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    setAvatarError("");
    setAvatarPending(file);
  }

  async function uploadAvatar(file: File) {
    setAvatarPending(null);
    setAvatarUploading(true);
    setAvatarError("");
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/system/avatar", { method: "POST", body: form });
    const json = await res.json();
    setAvatarUploading(false);
    if (res.ok) {
      setAvatarUrl(json.url);
      router.refresh();
    } else {
      setAvatarError(json.error ?? "Upload failed.");
    }
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (profileSaving) return;
    setProfileSaving(true);
    setProfileMsg("");
    const res = await fetch("/api/system/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const json = await res.json();
    setProfileSaving(false);
    if (res.ok) { setProfileMsg("Saved."); router.refresh(); }
    else setProfileMsg(json.error ?? "Failed to save.");
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (pwSaving) return;
    setPwSaving(true);
    setPwMsg("");
    const res = await fetch("/api/system/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
    });
    const json = await res.json();
    setPwSaving(false);
    if (res.ok) {
      setPwMsg("Password changed.");
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
    } else {
      setPwMsg(json.error ?? "Failed to change password.");
    }
  }

  return (
    <div className="max-w-xl space-y-6">
      {/* Profile */}
      <GlassCard id="profile" className="p-5">
        <p className="mb-4 text-sm font-semibold text-ink">Profile</p>

        {/* Avatar picker */}
        <div className="mb-5 flex items-center gap-4">
          <div className="relative">
            <Avatar name={name} src={avatarUrl} size="xl" ring />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={avatarUploading}
              aria-label="Change photo"
              className="absolute -bottom-1 -right-1 grid h-7 w-7 place-items-center rounded-full border-2 border-surface bg-accent text-white shadow-sm transition hover:bg-accent/90 disabled:opacity-60"
            >
              {avatarUploading
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <Camera className="h-3.5 w-3.5" />
              }
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={onFileChange}
            />
            <ImageAdjustModal
              open={avatarPending !== null}
              file={avatarPending}
              aspect={1}
              round
              output={512}
              title="Adjust profile photo"
              onCancel={() => setAvatarPending(null)}
              onConfirm={uploadAvatar}
            />
          </div>
          <div>
            <p className="text-sm font-medium text-ink">{name}</p>
            <p className="text-xs text-ink-400">System Owner</p>
            {avatarError && <p className="mt-1 text-xs text-danger-ink">{avatarError}</p>}
          </div>
        </div>

        <form onSubmit={saveProfile} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-500">Display name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required minLength={2} maxLength={120}
              className="input w-full"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-500">Email</label>
            <input value={email} readOnly disabled className="input w-full opacity-60" />
            <p className="mt-1 text-[11px] text-ink-400">Email is managed by the system administrator.</p>
          </div>
          {profileMsg && (
            <p className={`text-xs ${profileMsg === "Saved." ? "text-success-ink" : "text-danger-ink"}`}>
              {profileMsg}
            </p>
          )}
          <div className="flex justify-end">
            <Button type="submit" size="sm" loading={profileSaving}>Save</Button>
          </div>
        </form>
      </GlassCard>

      {/* Google Drive */}
      <GlassCard id="drive" className="p-5">
        <div className="mb-4 flex items-center gap-2">
          <HardDrive className="h-4 w-4 text-ink-400" />
          <p className="text-sm font-semibold text-ink">Google Drive</p>
          {connected && (
            <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-medium text-success-ink">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Connected
            </span>
          )}
        </div>

        {connected ? (
          <div className="space-y-3">
            <p className="text-sm text-ink-500">
              Files are stored in your Google Drive ({connectedEmail ?? "connected account"}).
              Avatars and documents will be uploaded there.
            </p>
            {driveMsg && (
              <p className={`text-xs ${driveMsg.includes("disconnected") ? "text-ink-400" : driveMsg.includes("failed") ? "text-danger-ink" : "text-success-ink"}`}>
                {driveMsg}
              </p>
            )}
            <div className="flex justify-end">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                loading={disconnecting}
                onClick={disconnectDrive}
                className="text-danger-ink hover:bg-danger-soft"
              >
                <Link2Off className="h-4 w-4" />
                Disconnect Drive
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-ink-500">
              Connect your Google Drive to store uploaded files and documents there instead of as inline data.
            </p>
            {driveMsg && (
              <p className={`text-xs ${driveMsg.includes("connected") ? "text-success-ink" : "text-danger-ink"}`}>
                {driveMsg}
              </p>
            )}
            <div className="flex flex-col items-center gap-2">
              {!process.env.NEXT_PUBLIC_GOOGLE_CONFIGURED && (
                <span className="flex items-center gap-1 text-[11px] text-ink-400">
                  <AlertCircle className="h-3.5 w-3.5" />
                  Requires GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET env vars
                </span>
              )}
              <div className="flex-1" />
              <a href="/api/system/google/connect">
                <Button type="button" size="sm" variant="glass">
                  <HardDrive className="h-4 w-4" />
                  Connect Google Drive
                </Button>
              </a>
            </div>
          </div>
        )}
      </GlassCard>

      {/* Change password */}
      <GlassCard id="security" className="p-5">
        <p className="mb-4 text-sm font-semibold text-ink">Change password</p>
        <form onSubmit={changePassword} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-500">Current password</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required autoComplete="current-password"
              className="input w-full"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-500">New password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required minLength={8} autoComplete="new-password"
              className="input w-full"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-500">Confirm new password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required autoComplete="new-password"
              className="input w-full"
            />
          </div>
          {pwMsg && (
            <p className={`text-xs ${pwMsg === "Password changed." ? "text-success-ink" : "text-danger-ink"}`}>
              {pwMsg}
            </p>
          )}
          <div className="flex justify-end">
            <Button type="submit" size="sm" loading={pwSaving}>Change password</Button>
          </div>
        </form>
      </GlassCard>
    </div>
  );
}
