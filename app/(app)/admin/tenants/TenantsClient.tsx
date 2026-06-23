"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Ban, Play, ExternalLink, Loader2 } from "lucide-react";
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
  const [form, setForm] = useState({
    name: "",
    subdomain: "",
    adminName: "",
    adminEmail: "",
    adminPassword: "",
  });
  const [showForm, setShowForm] = useState(false);

  const proto = portalDomain.startsWith("localhost") ? "http" : "https";
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
            <Input label="Subdomain" value={form.subdomain} onChange={(v) => setForm((f) => ({ ...f, subdomain: v }))} placeholder="acme" hint={`→ ${form.subdomain || "acme"}.${portalDomain}`} />
            <Input label="Admin name" value={form.adminName} onChange={(v) => setForm((f) => ({ ...f, adminName: v }))} placeholder="Jane Doe" />
            <Input label="Admin email" value={form.adminEmail} onChange={(v) => setForm((f) => ({ ...f, adminEmail: v }))} placeholder="jane@acme.com" />
            <Input label="Admin password" type="password" value={form.adminPassword} onChange={(v) => setForm((f) => ({ ...f, adminPassword: v }))} placeholder="min 8 chars" />
            <div className="flex items-end">
              <Button type="submit" loading={creating}>Create tenant</Button>
            </div>
          </form>
        </GlassCard>
      )}

      {error && (
        <p className="rounded-xl border border-danger/40 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</p>
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
