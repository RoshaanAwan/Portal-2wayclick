"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Settings as SettingsIcon,
  User,
  Palette,
  Bell,
  ShieldCheck,
  LogOut,
  Check,
  ExternalLink,
  Moon,
  Sun,
  Camera,
  Loader2,
  KeyRound,
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { Reveal, RevealItem } from "@/components/ui/Reveal";
import { useTheme, type Theme } from "@/components/ThemeProvider";
import { cn } from "@/lib/utils";

const THEMES: { key: Theme; label: string; desc: string; Icon: typeof Moon }[] = [
  { key: "dark", label: "Dark", desc: "Deep canvas, flat surfaces", Icon: Moon },
  { key: "light", label: "Light", desc: "Bright canvas, flat surfaces", Icon: Sun },
];

interface SettingsUser {
  id: string;
  name: string;
  email: string;
  title: string;
  department: string;
  avatarUrl: string | null;
  bio: string | null;
  phone: string | null;
  location: string | null;
}

const SECTIONS = [
  { id: "profile", label: "Profile", Icon: User },
  { id: "appearance", label: "Appearance", Icon: Palette },
  { id: "notifications", label: "Notifications", Icon: Bell },
  { id: "account", label: "Account", Icon: ShieldCheck },
] as const;

const ACCENTS = [
  { key: "orange", label: "Coral", color: "#f5683f" },
  { key: "violet", label: "Violet", color: "#8b5cf6" },
  { key: "blue", label: "Azure", color: "#3b82f6" },
  { key: "emerald", label: "Emerald", color: "#10b981" },
];

function Toggle({
  on,
  onChange,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={cn(
        "relative h-6 w-11 shrink-0 rounded-full border transition-colors",
        on ? "border-accent bg-accent" : "border-line bg-surface-2",
      )}
    >
      <motion.span
        layout
        transition={{ type: "spring", stiffness: 500, damping: 32 }}
        className={cn(
          "absolute top-0.5 h-4.5 w-4.5 rounded-full bg-white shadow-sm",
          on ? "right-0.5" : "left-0.5",
        )}
        style={{ height: 18, width: 18 }}
      />
    </button>
  );
}

function Row({
  title,
  desc,
  children,
}: {
  title: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3.5">
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink">{title}</p>
        <p className="mt-0.5 text-xs text-ink-400">{desc}</p>
      </div>
      {children}
    </div>
  );
}

export function SettingsClient({
  user,
  canViewProfile = true,
}: {
  user: SettingsUser;
  /** Public profile is under the admin-tier-only directory. */
  canViewProfile?: boolean;
}) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [active, setActive] = useState<(typeof SECTIONS)[number]["id"]>("profile");

  // Local preference state. There's no preferences model yet, so these persist
  // for the session only — clearly a UI-level demo of the controls.
  const [accent, setAccent] = useState("orange");
  const [prefs, setPrefs] = useState({
    announcements: true,
    mentions: true,
    approvals: true,
    weeklyDigest: false,
    reducedMotion: false,
  });

  // ── Profile editing ───────────────────────────────────────────────────────
  const fileInput = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    name: user.name,
    bio: user.bio ?? "",
    phone: user.phone ?? "",
    location: user.location ?? "",
  });
  // The current (possibly just-uploaded) avatar URL we'd save. null = cleared.
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user.avatarUrl);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [saved, setSaved] = useState(false);

  const dirty =
    form.name !== user.name ||
    form.bio !== (user.bio ?? "") ||
    form.phone !== (user.phone ?? "") ||
    form.location !== (user.location ?? "") ||
    avatarUrl !== user.avatarUrl;

  function setField(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
    setProfileError("");
  }

  async function onPickAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;

    setUploading(true);
    setProfileError("");
    setSaved(false);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/user/avatar/upload", { method: "POST", body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setProfileError(data.error || "Upload failed");
      } else {
        setAvatarUrl(data.url);
      }
    } catch {
      setProfileError("Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setProfileError("");
    setSaved(false);
    try {
      const res = await fetch("/api/user/profile/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, avatarUrl: avatarUrl ?? "" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setProfileError(data.error || "Could not save changes");
      } else {
        setSaved(true);
        // Re-fetch server data so the Topbar avatar/name update everywhere.
        router.refresh();
      }
    } catch {
      setProfileError("Could not save changes");
    } finally {
      setSaving(false);
    }
  }

  // ── Password change ───────────────────────────────────────────────────────
  const [pw, setPw] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState("");
  const [pwSaved, setPwSaved] = useState(false);

  const pwValid =
    pw.currentPassword.length > 0 &&
    pw.newPassword.length >= 8 &&
    pw.confirmPassword.length > 0 &&
    pw.newPassword === pw.confirmPassword &&
    pw.newPassword !== pw.currentPassword;

  function setPwField(key: keyof typeof pw, value: string) {
    setPw((p) => ({ ...p, [key]: value }));
    setPwError("");
    setPwSaved(false);
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (!pwValid) return;
    setPwSaving(true);
    setPwError("");
    setPwSaved(false);
    try {
      const res = await fetch("/api/user/password/change", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pw),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPwError(data.error || "Could not update password");
      } else {
        setPwSaved(true);
        setPw({ currentPassword: "", newPassword: "", confirmPassword: "" });
      }
    } catch {
      setPwError("Could not update password");
    } finally {
      setPwSaving(false);
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Settings"
        subtitle="Manage your profile, appearance, and notifications"
        icon={SettingsIcon}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[200px_1fr]">
        {/* Section nav */}
        <nav className="flex gap-2 overflow-x-auto lg:flex-col lg:gap-1 lg:overflow-visible">
          {SECTIONS.map((s) => {
            const on = active === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setActive(s.id)}
                className={cn(
                  "relative flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                  on
                    ? "text-white"
                    : "hover-surface text-ink-500 hover:text-ink",
                )}
              >
                {on && (
                  <motion.span
                    layoutId="settings-nav"
                    className="absolute inset-0 rounded-xl bg-accent-grad"
                    transition={{ type: "spring", stiffness: 380, damping: 32 }}
                  />
                )}
                <s.Icon className="relative z-10 h-4 w-4" />
                <span className="relative z-10">{s.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Section content */}
        <div className="min-w-0">
          {active === "profile" && (
            <form onSubmit={saveProfile}>
              <Reveal className="space-y-5">
                <RevealItem>
                  <GlassCard hover={false}>
                    <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
                      {/* Avatar with upload affordance */}
                      <div className="relative shrink-0">
                        <Avatar
                          name={form.name || user.name}
                          src={avatarUrl}
                          size="xl"
                          ring
                        />
                        <button
                          type="button"
                          onClick={() => fileInput.current?.click()}
                          disabled={uploading}
                          aria-label="Change profile photo"
                          className="absolute -bottom-1 -right-1 grid h-8 w-8 place-items-center rounded-full bg-accent-grad text-white transition hover:brightness-105 active:scale-95 disabled:opacity-60"
                        >
                          {uploading ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Camera className="h-4 w-4" />
                          )}
                        </button>
                        <input
                          ref={fileInput}
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/gif"
                          className="hidden"
                          onChange={onPickAvatar}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h2 className="font-display text-xl font-semibold tracking-tight text-ink">
                          {form.name || user.name}
                        </h2>
                        <p className="mt-0.5 text-sm text-ink-500">
                          {user.title} · {user.department}
                        </p>
                        <p className="mt-0.5 text-xs text-ink-400">{user.email}</p>
                        {avatarUrl && (
                          <button
                            type="button"
                            onClick={() => {
                              setAvatarUrl(null);
                              setSaved(false);
                            }}
                            className="mt-2 text-xs font-medium text-ink-400 underline-offset-2 hover:text-danger-ink hover:underline"
                          >
                            Remove photo
                          </button>
                        )}
                      </div>
                      {canViewProfile && (
                        <Link href={`/directory/${user.id}`}>
                          <Button type="button" variant="glass" size="sm">
                            View public profile
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Button>
                        </Link>
                      )}
                    </div>
                  </GlassCard>
                </RevealItem>

                <RevealItem>
                  <GlassCard hover={false}>
                    <h3 className="font-display text-[15px] font-semibold tracking-tight text-ink">
                      Profile details
                    </h3>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <EditField
                        label="Full name"
                        value={form.name}
                        onChange={(v) => setField("name", v)}
                        placeholder="Your name"
                        required
                      />
                      <Field label="Email" value={user.email} />
                      <EditField
                        label="Phone"
                        value={form.phone}
                        onChange={(v) => setField("phone", v)}
                        placeholder="+1 555 000 0000"
                      />
                      <EditField
                        label="Location"
                        value={form.location}
                        onChange={(v) => setField("location", v)}
                        placeholder="City, Country"
                      />
                      <div className="sm:col-span-2">
                        <label className="mb-1.5 block text-xs font-medium text-ink-500">
                          Bio
                        </label>
                        <textarea
                          value={form.bio}
                          onChange={(e) => setField("bio", e.target.value)}
                          rows={3}
                          maxLength={600}
                          placeholder="A short line about what you do."
                          className="input min-h-[88px] resize-y py-2.5"
                        />
                      </div>
                    </div>
                    <p className="mt-4 text-xs text-ink-400">
                      Job title, department, and role are managed by your HR
                      admin. Contact People Ops to request a change.
                    </p>
                  </GlassCard>
                </RevealItem>

                <RevealItem>
                  <div className="flex items-center justify-end gap-3">
                    {profileError && (
                      <span className="text-sm text-danger-ink">{profileError}</span>
                    )}
                    {saved && !dirty && (
                      <span className="flex items-center gap-1.5 text-sm text-success-ink">
                        <Check className="h-4 w-4" />
                        Saved
                      </span>
                    )}
                    <Button
                      type="submit"
                      loading={saving}
                      disabled={!dirty || uploading || !form.name.trim()}
                    >
                      Save changes
                    </Button>
                  </div>
                </RevealItem>
              </Reveal>
            </form>
          )}

          {active === "appearance" && (
            <Reveal className="space-y-5">
              <RevealItem>
                <GlassCard hover={false}>
                  <h3 className="font-display text-[15px] font-semibold tracking-tight text-ink">
                    Theme
                  </h3>
                  <p className="mt-0.5 text-xs text-ink-400">
                    Switch between dark and light. Saved to this browser.
                  </p>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    {THEMES.map((t) => {
                      const on = theme === t.key;
                      return (
                        <button
                          key={t.key}
                          onClick={() => setTheme(t.key)}
                          aria-pressed={on}
                          className={cn(
                            "flex items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition",
                            on
                              ? "border-accent bg-accent-soft"
                              : "border-line hover:border-line-strong",
                          )}
                        >
                          <span
                            className={cn(
                              "grid h-9 w-9 shrink-0 place-items-center rounded-lg border",
                              on
                                ? "border-accent/40 text-accent-ink"
                                : "border-line bg-surface-2 text-ink-500",
                            )}
                          >
                            <t.Icon className="h-[18px] w-[18px]" />
                          </span>
                          <span className="min-w-0">
                            <span className="flex items-center gap-1.5 text-sm font-medium text-ink">
                              {t.label}
                              {on && <Check className="h-3.5 w-3.5 text-accent-ink" />}
                            </span>
                            <span className="mt-0.5 block truncate text-xs text-ink-400">
                              {t.desc}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </GlassCard>
              </RevealItem>

              <RevealItem>
                <GlassCard hover={false}>
                  <h3 className="font-display text-[15px] font-semibold tracking-tight text-ink">
                    Accent color
                  </h3>
                  <p className="mt-0.5 text-xs text-ink-400">
                    Choose the highlight color used across the workspace.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-3">
                    {ACCENTS.map((a) => {
                      const on = accent === a.key;
                      return (
                        <button
                          key={a.key}
                          onClick={() => setAccent(a.key)}
                          className={cn(
                            "flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition",
                            on
                              ? "border-line-strong bg-surface-2 text-ink"
                              : "border-line text-ink-500 hover:border-line-strong hover:text-ink",
                          )}
                        >
                          <span
                            className="grid h-5 w-5 place-items-center rounded-full"
                            style={{ background: a.color }}
                          >
                            {on && <Check className="h-3 w-3 text-white" />}
                          </span>
                          {a.label}
                        </button>
                      );
                    })}
                  </div>
                </GlassCard>
              </RevealItem>

              <RevealItem>
                <GlassCard hover={false}>
                  <h3 className="font-display text-[15px] font-semibold tracking-tight text-ink">
                    Motion
                  </h3>
                  <div className="mt-1 divide-y divide-line">
                    <Row
                      title="Reduce motion"
                      desc="Minimize animations and transitions across the app."
                    >
                      <Toggle
                        on={prefs.reducedMotion}
                        onChange={(v) => setPrefs((p) => ({ ...p, reducedMotion: v }))}
                      />
                    </Row>
                  </div>
                </GlassCard>
              </RevealItem>
            </Reveal>
          )}

          {active === "notifications" && (
            <Reveal className="space-y-5">
              <RevealItem>
                <GlassCard hover={false}>
                  <h3 className="font-display text-[15px] font-semibold tracking-tight text-ink">
                    Email & in-app notifications
                  </h3>
                  <div className="mt-1 divide-y divide-line">
                    <Row
                      title="New announcements"
                      desc="When someone posts a company-wide announcement."
                    >
                      <Toggle
                        on={prefs.announcements}
                        onChange={(v) => setPrefs((p) => ({ ...p, announcements: v }))}
                      />
                    </Row>
                    <Row
                      title="Mentions & comments"
                      desc="When you're mentioned or someone replies to you."
                    >
                      <Toggle
                        on={prefs.mentions}
                        onChange={(v) => setPrefs((p) => ({ ...p, mentions: v }))}
                      />
                    </Row>
                    <Row
                      title="Time-off approvals"
                      desc="Status updates on requests you submitted or review."
                    >
                      <Toggle
                        on={prefs.approvals}
                        onChange={(v) => setPrefs((p) => ({ ...p, approvals: v }))}
                      />
                    </Row>
                    <Row
                      title="Weekly digest"
                      desc="A Monday summary of what happened across 2WayClick."
                    >
                      <Toggle
                        on={prefs.weeklyDigest}
                        onChange={(v) => setPrefs((p) => ({ ...p, weeklyDigest: v }))}
                      />
                    </Row>
                  </div>
                </GlassCard>
              </RevealItem>
            </Reveal>
          )}

          {active === "account" && (
            <Reveal className="space-y-5">
              <RevealItem>
                <GlassCard hover={false}>
                  <h3 className="font-display text-[15px] font-semibold tracking-tight text-ink">
                    Session
                  </h3>
                  <p className="mt-0.5 text-xs text-ink-400">
                    You&apos;re signed in as {user.email}.
                  </p>
                  <div className="mt-4">
                    <Button variant="glass" size="sm" onClick={logout}>
                      <LogOut className="h-4 w-4" />
                      Sign out
                    </Button>
                  </div>
                </GlassCard>
              </RevealItem>

              <RevealItem>
                <GlassCard hover={false}>
                  <div className="flex items-center gap-2">
                    <KeyRound className="h-4 w-4 text-ink-500" />
                    <h3 className="font-display text-[15px] font-semibold tracking-tight text-ink">
                      Change password
                    </h3>
                  </div>
                  <p className="mt-0.5 text-xs text-ink-400">
                    Use at least 8 characters. Changing it signs you out of all
                    your other devices.
                  </p>
                  <form onSubmit={changePassword} className="mt-4 space-y-4">
                    <PasswordField
                      label="Current password"
                      value={pw.currentPassword}
                      onChange={(v) => setPwField("currentPassword", v)}
                      autoComplete="current-password"
                    />
                    <div className="grid gap-4 sm:grid-cols-2">
                      <PasswordField
                        label="New password"
                        value={pw.newPassword}
                        onChange={(v) => setPwField("newPassword", v)}
                        autoComplete="new-password"
                      />
                      <PasswordField
                        label="Confirm new password"
                        value={pw.confirmPassword}
                        onChange={(v) => setPwField("confirmPassword", v)}
                        autoComplete="new-password"
                      />
                    </div>
                    {pw.confirmPassword.length > 0 &&
                      pw.newPassword !== pw.confirmPassword && (
                        <p className="text-xs text-danger-ink">
                          New passwords don&apos;t match.
                        </p>
                      )}
                    <div className="flex items-center justify-end gap-3">
                      {pwError && (
                        <span className="text-sm text-danger-ink">{pwError}</span>
                      )}
                      {pwSaved && (
                        <span className="flex items-center gap-1.5 text-sm text-success-ink">
                          <Check className="h-4 w-4" />
                          Password updated
                        </span>
                      )}
                      <Button type="submit" loading={pwSaving} disabled={!pwValid}>
                        Update password
                      </Button>
                    </div>
                  </form>
                </GlassCard>
              </RevealItem>

              <RevealItem>
                <GlassCard hover={false} className="border-danger/20">
                  <h3 className="font-display text-[15px] font-semibold tracking-tight text-danger-ink">
                    Danger zone
                  </h3>
                  <p className="mt-0.5 text-xs text-ink-400">
                    Account deletion is handled by your administrator and cannot
                    be undone.
                  </p>
                  <div className="mt-4">
                    <Button variant="danger" size="sm" disabled>
                      Delete account
                    </Button>
                  </div>
                </GlassCard>
              </RevealItem>
            </Reveal>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-ink-500">
        {label}
      </label>
      <div className="rounded-xl border border-line bg-surface-2 px-3.5 py-2.5 text-sm text-ink-700">
        {value}
      </div>
    </div>
  );
}

function EditField({
  label,
  value,
  onChange,
  placeholder,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-ink-500">
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className="input"
      />
    </div>
  );
}

function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-ink-500">
        {label}
      </label>
      <input
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        className="input"
      />
    </div>
  );
}
