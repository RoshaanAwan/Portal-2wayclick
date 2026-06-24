"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Ban, Play, ExternalLink, Loader2, LogIn, Pencil, X } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";

interface TenantRow {
  id: string;
  name: string;
  subdomain: string;
  status: string;
  suspendedAt: string | null;
  createdAt: string;
  userCount: number;
  // The tenant's first SUPER_ADMIN (Company Owner). Null when the tenant has no
  // such user — the impersonate action is disabled in that case.
  companyOwnerId: string | null;
}

export function TenantsClient({
  tenants,
  portalDomain,
}: {
  tenants: TenantRow[];
  portalDomain: string;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [editingTenant, setEditingTenant] = useState<TenantRow | null>(null);
  const [editForm, setEditForm] = useState({ name: "", subdomain: "" });
  const [editError, setEditError] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    subdomain: "",
    adminName: "",
    adminEmail: "",
    adminPassword: "",
  });
  const [showForm, setShowForm] = useState(false);

  // Local dev runs over plain HTTP; prod over HTTPS. Dev hosts always carry an
  // explicit :port (lvh.me:3001 / localhost:3000); a bare prod domain doesn't.
  // (Mirrors isLocalPortalDomain in lib/share.ts — that module is server-only so
  // it can't be imported into this client component.)
  const isLocal =
    portalDomain.includes(":") ||
    /(^|\.)(localhost|lvh\.me)$/.test(portalDomain) ||
    portalDomain.startsWith("127.0.0.1");
  const proto = isLocal ? "http" : "https";
  const tenantUrl = (sub: string) => `${proto}://${sub}.${portalDomain}`;

  async function createTenant(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError("");
    try {
      const res = await fetch("/api/admin/tenants/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setError(data.error || "Could not create tenant");
      else {
        setShowForm(false);
        setForm({ name: "", subdomain: "", adminName: "", adminEmail: "", adminPassword: "" });
        router.refresh();
      }
    } catch {
      setError("Could not create tenant");
    } finally {
      setCreating(false);
    }
  }

  async function setStatus(id: string, status: "active" | "suspended") {
    setBusyId(id);
    setError("");
    try {
      const res = await fetch("/api/admin/tenants/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId: id, status }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error || "Could not update tenant");
      } else router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  function openEdit(t: TenantRow) {
    setEditingTenant(t);
    setEditForm({ name: t.name, subdomain: t.subdomain });
    setEditError("");
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingTenant) return;
    setSaving(true);
    setEditError("");
    try {
      const res = await fetch("/api/admin/tenants/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId: editingTenant.id, ...editForm }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setEditError(data.error || "Could not update tenant"); return; }
      setEditingTenant(null);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  // Mint an impersonation session for the tenant's Company Owner, then hop to
  // that tenant's subdomain where the host-scoped cookie is valid.
  async function impersonate(userId: string) {
    setBusyId(userId);
    setError("");
    try {
      const res = await fetch("/api/admin/tenants/impersonate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.subdomain || !data.claimToken) {
        setError(data.error || "Could not enter tenant");
        setBusyId(null);
        return;
      }
      // Claim the session ON the target subdomain so the host-scoped cookie
      // lands on the right host, then it redirects to the tenant dashboard.
      window.location.href = `${proto}://${data.subdomain}.${portalDomain}/impersonate/claim?token=${encodeURIComponent(data.claimToken)}`;
    } catch {
      setError("Could not enter tenant");
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-400">
          {tenants.length} {tenants.length === 1 ? "tenant" : "tenants"}
        </p>
        <Button onClick={() => setShowForm((v) => !v)}>
          <Plus className="h-4 w-4" /> New tenant
        </Button>
      </div>

      {showForm && (
        <GlassCard hover={false}>
          <form onSubmit={createTenant} className="grid gap-3 sm:grid-cols-2">
            <Input label="Workspace name" value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} placeholder="Acme Corp" />
            <Input
              label="Subdomain"
              value={form.subdomain}
              // Normalize as typed: lowercase, only a–z/0–9/hyphen (no spaces or
              // uppercase) so the value is always a valid DNS label.
              onChange={(v) =>
                setForm((f) => ({
                  ...f,
                  subdomain: v.toLowerCase().replace(/[^a-z0-9-]/g, ""),
                }))
              }
              placeholder="acme"
              hint={`→ ${form.subdomain || "acme"}.${portalDomain}`}
            />
            <Input label="Company Owner name" value={form.adminName} onChange={(v) => setForm((f) => ({ ...f, adminName: v }))} placeholder="Jane Doe" />
            <Input label="Company Owner email" type="email" value={form.adminEmail} onChange={(v) => setForm((f) => ({ ...f, adminEmail: v }))} placeholder="jane@acme.com" />
            <Input label="Company Owner password" type="password" value={form.adminPassword} onChange={(v) => setForm((f) => ({ ...f, adminPassword: v }))} placeholder="min 8 chars" />
            <div className="flex items-end">
              <Button type="submit" loading={creating}>Create tenant</Button>
            </div>
            <p className="text-xs text-ink-400 sm:col-span-2">
              The first admin of this workspace (Company Owner). Full tenant access; no platform access.
            </p>
          </form>
        </GlassCard>
      )}

      {error && (
        <p className="rounded-xl border border-danger/40 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</p>
      )}

      {/* Edit tenant modal */}
      {editingTenant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <GlassCard hover={false} className="w-full max-w-md">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold text-ink">Edit Tenant</h2>
              <button onClick={() => setEditingTenant(null)} className="text-ink-400 hover:text-ink">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={saveEdit} className="space-y-3">
              <Input
                label="Workspace name"
                value={editForm.name}
                onChange={(v) => setEditForm((f) => ({ ...f, name: v }))}
                placeholder="Acme Corp"
              />
              <Input
                label="Subdomain"
                value={editForm.subdomain}
                onChange={(v) =>
                  setEditForm((f) => ({
                    ...f,
                    subdomain: v.toLowerCase().replace(/[^a-z0-9-]/g, ""),
                  }))
                }
                placeholder="acme"
                hint={`→ ${editForm.subdomain || "acme"}.${portalDomain}`}
              />
              {editError && (
                <p className="text-sm text-danger">{editError}</p>
              )}
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setEditingTenant(null)} className="nm-button rounded-lg px-3 py-1.5 text-sm text-ink-600">
                  Cancel
                </button>
                <Button type="submit" loading={saving}>Save changes</Button>
              </div>
            </form>
          </GlassCard>
        </div>
      )}

      <GlassCard hover={false} className="overflow-hidden p-0">
        <div className="divide-y divide-line">
          {tenants.map((t) => {
            const suspended = t.status === "suspended";
            return (
              <div key={t.id} className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-ink">{t.name}</p>
                    {suspended && (
                      <span className="rounded-md bg-danger-soft px-1.5 py-0.5 text-[11px] font-semibold text-danger">Suspended</span>
                    )}
                  </div>
                  <p className="text-xs text-ink-400">
                    {t.subdomain}.{portalDomain} · {t.userCount} {t.userCount === 1 ? "user" : "users"}
                  </p>
                </div>
                <button
                  onClick={() => openEdit(t)}
                  disabled={busyId !== null}
                  className="nm-button inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-ink-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </button>
                <button
                  onClick={() => t.companyOwnerId && impersonate(t.companyOwnerId)}
                  disabled={!t.companyOwnerId || busyId !== null}
                  title={t.companyOwnerId ? "Sign in as this workspace's Company Owner" : "No Company Owner to enter as"}
                  className="nm-button inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-ink-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busyId === t.companyOwnerId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogIn className="h-3.5 w-3.5" />} Enter as Company Owner
                </button>
                <a href={tenantUrl(t.subdomain)} target="_blank" rel="noreferrer" className="nm-button inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-ink-700">
                  <ExternalLink className="h-3.5 w-3.5" /> Open
                </a>
                {suspended ? (
                  <button onClick={() => setStatus(t.id, "active")} disabled={busyId === t.id} className="nm-button inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-success">
                    {busyId === t.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />} Reactivate
                  </button>
                ) : (
                  <button onClick={() => setStatus(t.id, "suspended")} disabled={busyId === t.id} className="nm-button inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-danger">
                    {busyId === t.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ban className="h-3.5 w-3.5" />} Suspend
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </GlassCard>
    </div>
  );
}

function Input({
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
      <span className="mb-1.5 block text-sm font-medium text-ink-700">{label}</span>
      <input type={type} className="input" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} required />
      {hint && <span className="mt-1 block text-xs text-ink-400">{hint}</span>}
    </label>
  );
}
