"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Pencil,
  Archive,
  ArchiveRestore,
  Loader2,
  X,
  AlertTriangle,
  Check,
  Users,
  Clock,
  Building2,
} from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { PLAN_FEATURES } from "@/lib/planFeatures";

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
  // Selected feature labels, chosen from the PLAN_FEATURES catalog (checkboxes).
  features: string[];
}

const EMPTY_FORM: FormState = {
  name: "",
  description: "",
  price: "",
  currency: "usd",
  interval: "month",
  trialDays: "0",
  maxUsers: "",
  features: [],
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
      // Keep only labels still in the catalog so a legacy free-text feature
      // doesn't survive an edit-save (mirrors lib/planFeatures.sanitize on the API).
      features: PLAN_FEATURES.filter((f) => p.features.includes(f.label)).map((f) => f.label),
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
      features: form.features,
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

      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1 text-xs font-medium text-ink-600">
            {plans.length} {plans.length === 1 ? "plan" : "plans"}
          </span>
          {plans.some((p) => p.active && p.sellable) && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-1 text-xs font-medium text-success">
              <span className="h-1.5 w-1.5 rounded-full bg-success" />
              {plans.filter((p) => p.active && p.sellable).length} sellable
            </span>
          )}
        </div>
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
              <div className="block">
                <span className="mb-1.5 block text-sm font-medium text-ink-700">Included features</span>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {PLAN_FEATURES.map((opt) => {
                    const checked = form.features.includes(opt.label);
                    return (
                      <label
                        key={opt.key}
                        className="flex cursor-pointer items-start gap-2 rounded-lg border border-line px-2.5 py-1.5 text-sm text-ink-700 hover:bg-surface-2"
                      >
                        <input
                          type="checkbox"
                          className="mt-0.5 h-4 w-4 shrink-0 accent-accent"
                          checked={checked}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              features: e.target.checked
                                ? [...f.features, opt.label]
                                : f.features.filter((l) => l !== opt.label),
                            }))
                          }
                        />
                        <span>{opt.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
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
        <GlassCard hover={false} className="py-16 text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-accent-soft text-accent-ink">
            <Plus className="h-5 w-5" />
          </div>
          <p className="mt-4 text-sm font-medium text-ink">No plans yet</p>
          <p className="mt-1 text-sm text-ink-400">Create your first package to start selling.</p>
          <div className="mt-5">
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" /> New plan
            </Button>
          </div>
        </GlassCard>
      ) : (
        <div className="grid items-start gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {plans.map((p) => (
            <div
              key={p.id}
              className={cn(
                "group relative flex flex-col rounded-2xl border bg-surface p-6 transition-all duration-200",
                p.active
                  ? "border-line hover:border-accent/40 hover:shadow-[0_8px_40px_-16px_rgb(var(--c-accent)/0.35)]"
                  : "border-dashed border-line bg-surface-2/40",
              )}
            >
              {/* Status ribbon — top-right corner chip */}
              <div className="absolute right-4 top-4 flex items-center gap-1.5">
                {!p.active && (
                  <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-400">
                    Archived
                  </span>
                )}
                {p.active && !p.sellable && (
                  <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                    Draft
                  </span>
                )}
                {p.active && p.sellable && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-success">
                    <span className="h-1.5 w-1.5 rounded-full bg-success" /> Live
                  </span>
                )}
              </div>

              {/* Name + description */}
              <div className={cn("pr-16", !p.active && "opacity-70")}>
                <h3 className="text-base font-semibold text-ink">{p.name}</h3>
                <p className="mt-0.5 min-h-[1.25rem] text-xs text-ink-400">
                  {p.description || "—"}
                </p>
              </div>

              {/* Price */}
              <div className={cn("mt-4 flex items-baseline gap-1", !p.active && "opacity-70")}>
                <span className="bg-accent-grad bg-clip-text text-3xl font-bold tracking-tight text-transparent">
                  {money(p.priceCents, p.currency)}
                </span>
                <span className="text-sm font-medium text-ink-400">/{p.interval}</span>
              </div>

              {/* Quick facts */}
              <div className="mt-3 flex flex-wrap gap-1.5">
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-surface-2 px-2.5 py-1 text-xs font-medium text-ink-600">
                  <Users className="h-3.5 w-3.5 text-ink-400" />
                  {p.maxUsers != null ? `${p.maxUsers} seats` : "Unlimited"}
                </span>
                {p.trialDays > 0 && (
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-surface-2 px-2.5 py-1 text-xs font-medium text-ink-600">
                    <Clock className="h-3.5 w-3.5 text-ink-400" />
                    {p.trialDays}-day trial
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-surface-2 px-2.5 py-1 text-xs font-medium text-ink-600">
                  <Building2 className="h-3.5 w-3.5 text-ink-400" />
                  {p.tenantCount} {p.tenantCount === 1 ? "tenant" : "tenants"}
                </span>
              </div>

              {/* Feature checklist */}
              {p.features.length > 0 && (
                <ul className="mt-4 space-y-2 text-sm text-ink-600">
                  {p.features.map((f, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full bg-success/15 text-success">
                        <Check className="h-3 w-3" strokeWidth={3} />
                      </span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              )}

              {/* Actions — pinned to the bottom so cards align */}
              <div className="mt-5 flex gap-2 border-t border-line/70 pt-4">
                <button
                  onClick={() => openEdit(p)}
                  disabled={busyId !== null}
                  className="nm-button inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-medium text-ink-700 disabled:opacity-50"
                >
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </button>
                {p.active ? (
                  <button
                    onClick={() => setActive(p.id, false)}
                    disabled={busyId === p.id}
                    className="nm-button inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-medium text-danger disabled:opacity-50"
                  >
                    {busyId === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Archive className="h-3.5 w-3.5" />} Archive
                  </button>
                ) : (
                  <button
                    onClick={() => setActive(p.id, true)}
                    disabled={busyId === p.id}
                    className="nm-button inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-medium text-success disabled:opacity-50"
                  >
                    {busyId === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArchiveRestore className="h-3.5 w-3.5" />} Restore
                  </button>
                )}
              </div>
            </div>
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
