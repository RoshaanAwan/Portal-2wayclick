"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, Upload, X, Loader2 } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { Logo } from "@/components/ui/Logo";

interface Fields {
  companyName: string;
  tagline: string;
  legalName: string;
  website: string;
  emailDomain: string;
  logoUrl: string;
  accentHex: string;
}

type Defaults = Omit<Fields, "logoUrl">;

// A labeled text field. `placeholder` shows the env default so an admin sees the
// fallback for a blank field.
function Field({
  label,
  value,
  onChange,
  placeholder,
  hint,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink-700">
        {label}
      </span>
      <input
        type={type}
        className="input"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint && <span className="mt-1 block text-xs text-ink-400">{hint}</span>}
    </label>
  );
}

export function BrandingClient({
  initial,
  defaults,
}: {
  initial: Fields;
  defaults: Defaults;
}) {
  const router = useRouter();
  const [form, setForm] = useState<Fields>(initial);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  function set<K extends keyof Fields>(key: K, value: Fields[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
    setError("");
  }

  // The accent fed to the live preview swatch / logo: the chosen hex, else the
  // env default.
  const previewAccent = form.accentHex || defaults.accentHex;

  async function onPickLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/admin/branding/logo/upload", {
        method: "POST",
        body,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setError(data.error || "Upload failed");
      else set("logoUrl", data.url);
    } catch {
      setError("Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const res = await fetch("/api/admin/branding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Save failed");
      } else {
        setSaved(true);
        // Re-fetch server components so the new brand shows app-wide immediately.
        router.refresh();
      }
    } catch {
      setError("Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-5">
      {/* Live preview */}
      <GlassCard hover={false}>
        <h3 className="text-sm font-semibold text-ink">Preview</h3>
        <div className="mt-3 flex items-center gap-3">
          <Logo
            size="md"
            logoUrl={form.logoUrl || null}
            name={form.companyName || defaults.companyName}
          />
          <div>
            <p className="font-display text-lg font-semibold tracking-tight text-ink">
              {form.companyName || defaults.companyName}
            </p>
            <p className="text-xs text-ink-400">
              {form.tagline || defaults.tagline}
            </p>
          </div>
          <span
            className="ml-auto h-8 w-8 rounded-full border border-line"
            style={{ background: previewAccent }}
            title={previewAccent}
          />
        </div>
        <p className="mt-2 text-[11px] text-ink-400">
          The logo and accent above reflect the values below. The accent applies
          app-wide as the default; users can still pick a different accent in
          Settings.
        </p>
      </GlassCard>

      {/* Identity */}
      <GlassCard hover={false}>
        <h3 className="text-sm font-semibold text-ink">Identity</h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field
            label="Company name"
            value={form.companyName}
            onChange={(v) => set("companyName", v)}
            placeholder={defaults.companyName}
          />
          <Field
            label="Tagline"
            value={form.tagline}
            onChange={(v) => set("tagline", v)}
            placeholder={defaults.tagline}
          />
          <Field
            label="Legal name"
            value={form.legalName}
            onChange={(v) => set("legalName", v)}
            placeholder={defaults.legalName}
            hint="Used in copyright lines."
          />
          <Field
            label="Website"
            value={form.website}
            onChange={(v) => set("website", v)}
            placeholder={defaults.website}
          />
          <Field
            label="Email domain"
            value={form.emailDomain}
            onChange={(v) => set("emailDomain", v)}
            placeholder={defaults.emailDomain}
            hint="Used in email placeholders and contact fallbacks."
          />
        </div>
      </GlassCard>

      {/* Accent */}
      <GlassCard hover={false}>
        <h3 className="text-sm font-semibold text-ink">Accent color</h3>
        <p className="mt-0.5 text-xs text-ink-400">
          The brand highlight color, applied across the workspace.
        </p>
        <div className="mt-4 flex items-center gap-3">
          <input
            type="color"
            className="h-10 w-14 cursor-pointer rounded-lg border border-line bg-surface-2"
            value={previewAccent}
            onChange={(e) => set("accentHex", e.target.value)}
            aria-label="Accent color"
          />
          <input
            type="text"
            className="input max-w-[160px] font-mono"
            value={form.accentHex}
            placeholder={defaults.accentHex}
            onChange={(e) => set("accentHex", e.target.value)}
          />
          {form.accentHex && (
            <button
              type="button"
              onClick={() => set("accentHex", "")}
              className="text-xs text-ink-400 hover:text-ink"
            >
              Reset to default
            </button>
          )}
        </div>
      </GlassCard>

      {/* Logo */}
      <GlassCard hover={false}>
        <h3 className="text-sm font-semibold text-ink">Logo</h3>
        <p className="mt-0.5 text-xs text-ink-400">
          Upload a custom logo image (PNG, SVG, etc., max 4 MB). Leave empty to
          use the built-in mark, which tints to the accent automatically.
        </p>
        <div className="mt-4 flex items-center gap-3">
          <label className="nm-button inline-flex cursor-pointer items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium text-ink-700">
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            {uploading ? "Uploading…" : "Upload logo"}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
              className="hidden"
              onChange={onPickLogo}
              disabled={uploading}
            />
          </label>
          {form.logoUrl && (
            <button
              type="button"
              onClick={() => set("logoUrl", "")}
              className="inline-flex items-center gap-1 text-xs text-ink-400 hover:text-ink"
            >
              <X className="h-3.5 w-3.5" /> Remove
            </button>
          )}
        </div>
      </GlassCard>

      {error && (
        <p className="rounded-xl border border-danger/40 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" loading={saving}>
          Save changes
        </Button>
        {saved && (
          <span className="inline-flex items-center gap-1 text-sm text-success">
            <Check className="h-4 w-4" /> Saved
          </span>
        )}
      </div>
    </form>
  );
}
