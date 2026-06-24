"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Archive, ArchiveRestore, Loader2, X, AlertTriangle } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";

interface PlanRow {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  currency: string;
  interval: string;
  trialDays: number;
  maxUsers: number | null;
  features: string[];
  active: boolean;
  sortOrder: number;
  stripePriceId: string | null;
  sellable: boolean;
  tenantCount: number;
  createdAt: string;
}

interface FormState {
  name: string;
  description: string;
  // Major units as a string (e.g. "29.99"); converted to cents on submit.
  price: string;
  currency: string;
  interval: "month" | "year";
  trialDays: string;
  maxUsers: string;
  // One feature per line in the textarea.
  features: string;
}

const EMPTY_FORM: FormState = {
  name: "",
  description: "",
  price: "",
  currency: "usd",
  interval: "month",
  trialDays: "0",
  maxUsers: "",
  features: "",
};

function money(cents: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(cents / 100);
  } catch {
    return `${currency.toUpperCase()} ${(cents / 100).toFixed(2)}`;
  }
}

export function PlansClient({
  plans,
  stripeReady,
}: {
  plans: PlanRow[];
  stripeReady: boolean;
}) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<PlanRow | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setError("");
    setShowForm(true);
  }

  function openEdit(p: PlanRow) {
    setEditing(p);
    setForm({
      name: p.name,
      description: p.description ?? "",
      price: (p.priceCents / 100).toFixed(2),
      currency: p.currency,
      interval: p.interval === "year" ? "year" : "month",
      trialDays: String(p.trialDays),
      maxUsers: p.maxUsers != null ? String(p.maxUsers) : "",
      features: p.features.join("\n"),
    });
    setError("");
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditing(null);
    setError("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    const priceNum = Number(form.price);
    if (!Number.isFinite(priceNum) || priceNum < 0) {
      setError("Enter a valid price.");
      setSaving(false);
      return;
    }
    const payload = {
      ...(editing ? { id: editing.id } : {}),
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      priceCents: Math.round(priceNum * 100),
      currency: form.currency.trim().toLowerCase(),
      interval: form.interval,
      trialDays: Number(form.trialDays) || 0,
      maxUsers: form.maxUsers.trim() ? Number(form.maxUsers) : null,
      features: form.features
        .split("\n")
        .map((f) => f.trim())
        .filter(Boolean),
    };

    try {
      const url = editing ? "/api/admin/plans/update" : "/api/admin/plans/create";
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not save plan");
        return;
      }
      closeForm();
      router.refresh();
    } catch {
      setError("Could not save plan");
    } finally {
      setSaving(false);
    }
  }

  async function setActive(id: string, active: boolean) {
    setBusyId(id);
    setError("");
    try {
      const res = await fetch("/api/admin/plans/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, active }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error || "Could not update plan");
      } else router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-5">
      {!stripeReady && (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-400/40 bg-amber-400/10 px-3.5 py-2.5 text-sm text-amber-700 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Stripe isn’t configured (no <code>STRIPE_SECRET_KEY</code>). You can draft plans, but
            they won’t be subscribable until Stripe is set up and the plan is re-saved.
          </span>
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-400">
          {plans.length} {plans.length === 1 ? "plan" : "plans"}
        </p>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" /> New plan
        </Button>
      </div>

      {error && !showForm && (
        <p className="rounded-xl border border-danger/40 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</p>
      )}

      {/* Create / edit modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <GlassCard hover={false} className="max-h-[90vh] w-full max-w-lg overflow-y-auto">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold text-ink">{editing ? "Edit plan" : "New plan"}</h2>
              <button onClick={closeForm} className="text-ink-400 hover:text-ink">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={submit} className="space-y-3">
              <Input label="Plan name" value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} placeholder="Starter" />
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-ink-700">Description</span>
                <textarea
                  className="input min-h-[60px]"
                  value={form.description}
                  placeholder="What's included at a glance"
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <Input label="Price" value={form.price} onChange={(v) => setForm((f) => ({ ...f, price: v.replace(/[^0-9.]/g, "") }))} placeholder="29.00" />
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-ink-700">Currency</span>
                  <input
                    className="input uppercase"
                    value={form.currency}
                    maxLength={3}
                    onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value.toLowerCase().replace(/[^a-z]/g, "") }))}
                    required
                  />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-ink-700">Billing interval</span>
                  <select
                    className="input"
                    value={form.interval}
                    onChange={(e) => setForm((f) => ({ ...f, interval: e.target.value as "month" | "year" }))}
                  >
                    <option value="month">Monthly</option>
                    <option value="year">Yearly</option>
                  </select>
                </label>
                <Input label="Free trial (days)" value={form.trialDays} onChange={(v) => setForm((f) => ({ ...f, trialDays: v.replace(/[^0-9]/g, "") }))} placeholder="0" />
              </div>
              <Input
                label="Max users (blank = unlimited)"
                value={form.maxUsers}
                onChange={(v) => setForm((f) => ({ ...f, maxUsers: v.replace(/[^0-9]/g, "") }))}
                placeholder="unlimited"
                required={false}
              />
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-ink-700">Features (one per line)</span>
                <textarea
                  className="input min-h-[80px]"
                  value={form.features}
                  placeholder={"Unlimited projects\nPriority support\nAdvanced analytics"}
                  onChange={(e) => setForm((f) => ({ ...f, features: e.target.value }))}
                />
              </label>
              {editing && editing.priceCents !== Math.round((Number(form.price) || 0) * 100) && (
                <p className="rounded-lg bg-amber-400/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                  Changing the price creates a new Stripe price. Tenants already subscribed keep their
                  current price until they re-subscribe.
                </p>
              )}
              {error && <p className="text-sm text-danger">{error}</p>}
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={closeForm} className="nm-button rounded-lg px-3 py-1.5 text-sm text-ink-600">
                  Cancel
                </button>
                <Button type="submit" loading={saving}>{editing ? "Save changes" : "Create plan"}</Button>
              </div>
            </form>
          </GlassCard>
        </div>
      )}

      {plans.length === 0 ? (
        <GlassCard hover={false} className="py-12 text-center">
          <p className="text-sm text-ink-400">No plans yet. Create your first package to start selling.</p>
        </GlassCard>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {plans.map((p) => (
            <GlassCard key={p.id} hover={false} className={p.active ? "" : "opacity-60"}>
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-ink">{p.name}</h3>
                    {!p.active && (
                      <span className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px] font-semibold text-ink-400">Archived</span>
                    )}
                    {p.active && !p.sellable && (
                      <span className="rounded-md bg-amber-400/15 px-1.5 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300">Not sellable</span>
                    )}
                  </div>
                  {p.description && <p className="mt-0.5 text-xs text-ink-400">{p.description}</p>}
                </div>
              </div>

              <p className="mb-3 text-2xl font-bold text-ink">
                {money(p.priceCents, p.currency)}
                <span className="text-sm font-normal text-ink-400">/{p.interval}</span>
              </p>

              <ul className="mb-3 space-y-1 text-xs text-ink-500">
                <li>{p.maxUsers != null ? `Up to ${p.maxUsers} users` : "Unlimited users"}</li>
                {p.trialDays > 0 && <li>{p.trialDays}-day free trial</li>}
                {p.features.map((f, i) => (
                  <li key={i}>• {f}</li>
                ))}
                <li className="pt-1 text-ink-400">
                  {p.tenantCount} {p.tenantCount === 1 ? "tenant" : "tenants"} subscribed
                </li>
              </ul>

              <div className="flex gap-2">
                <button
                  onClick={() => openEdit(p)}
                  disabled={busyId !== null}
                  className="nm-button inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-ink-700 disabled:opacity-50"
                >
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </button>
                {p.active ? (
                  <button
                    onClick={() => setActive(p.id, false)}
                    disabled={busyId === p.id}
                    className="nm-button inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-danger disabled:opacity-50"
                  >
                    {busyId === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Archive className="h-3.5 w-3.5" />} Archive
                  </button>
                ) : (
                  <button
                    onClick={() => setActive(p.id, true)}
                    disabled={busyId === p.id}
                    className="nm-button inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-success disabled:opacity-50"
                  >
                    {busyId === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArchiveRestore className="h-3.5 w-3.5" />} Restore
                  </button>
                )}
              </div>
            </GlassCard>
          ))}
        </div>
      )}
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  required = true,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink-700">{label}</span>
      <input type={type} className="input" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} required={required} />
    </label>
  );
}
