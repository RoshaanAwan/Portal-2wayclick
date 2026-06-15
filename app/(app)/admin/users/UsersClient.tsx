"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  UserPlus,
  X,
  Search,
  Loader2,
  Check,
  Copy,
  RefreshCw,
} from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { GlassCard } from "@/components/ui/GlassCard";
import {
  ROLE_LABELS,
  ROLE_DESCRIPTIONS,
  ROLE_BADGE,
  type Role,
} from "@/lib/permissions";
import { formatDate } from "@/lib/utils";

export interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  title: string;
  department: string;
  avatarUrl: string | null;
  createdAt: string;
}

function roleBadge(role: string) {
  const variant = ROLE_BADGE[role as Role] ?? "neutral";
  const label = ROLE_LABELS[role as Role] ?? role;
  return <Badge variant={variant}>{label}</Badge>;
}

/** Generate a readable-but-strong temporary password. */
function genPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  // Web Crypto for randomness (available in the browser).
  const arr = new Uint32Array(14);
  crypto.getRandomValues(arr);
  let out = "";
  for (let i = 0; i < arr.length; i++) out += chars[arr[i] % chars.length];
  return out + "!7";
}

export function UsersClient({
  users,
  assignableRoles,
  departments,
}: {
  users: AdminUserRow[];
  assignableRoles: Role[];
  departments: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (ROLE_LABELS[u.role as Role] ?? u.role).toLowerCase().includes(q),
    );
  }, [users, query]);

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-sm flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, email, or role…"
            className="input pl-9"
          />
        </div>
        <Button onClick={() => setOpen(true)}>
          <UserPlus className="h-4 w-4" />
          New user
        </Button>
      </div>

      {/* User table */}
      <GlassCard hover={false} className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-ink-400">
                <th className="px-5 py-3 font-semibold">Member</th>
                <th className="px-5 py-3 font-semibold">Role</th>
                <th className="px-5 py-3 font-semibold">Department</th>
                <th className="px-5 py-3 font-semibold">Joined</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-5 py-10 text-center text-ink-400">
                    No users match “{query}”.
                  </td>
                </tr>
              ) : (
                filtered.map((u) => (
                  <tr
                    key={u.id}
                    className="border-b border-line/60 last:border-0 transition-colors hover:bg-[rgb(var(--hover)/var(--hover-opacity))]"
                  >
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={u.name} src={u.avatarUrl} size="sm" />
                        <div className="min-w-0">
                          <p className="truncate font-medium text-ink">{u.name}</p>
                          <p className="truncate text-xs text-ink-400">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3">{roleBadge(u.role)}</td>
                    <td className="px-5 py-3 text-ink-500">{u.department}</td>
                    <td className="px-5 py-3 text-ink-400">
                      {formatDate(u.createdAt)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </GlassCard>

      <AnimatePresence>
        {open && (
          <CreateUserModal
            assignableRoles={assignableRoles}
            departments={departments}
            onClose={() => setOpen(false)}
            onCreated={() => {
              setOpen(false);
              router.refresh();
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function CreateUserModal({
  assignableRoles,
  departments,
  onClose,
  onCreated,
}: {
  assignableRoles: Role[];
  departments: string[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>(assignableRoles[0] ?? "EMPLOYEE");
  const [department, setDepartment] = useState(departments[0] ?? "Executive");
  const [title, setTitle] = useState("");
  const [password, setPassword] = useState(() => genPassword());
  const [copied, setCopied] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function copyPassword() {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard may be blocked — non-fatal */
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/users/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, email, role, department, title, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not create user.");
        setSubmitting(false);
        return;
      }
      onCreated();
    } catch {
      setError("Network error — please try again.");
      setSubmitting(false);
    }
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-40 bg-black/55 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="fixed inset-0 z-50 grid place-items-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.98 }}
          transition={{ type: "spring", stiffness: 320, damping: 30 }}
          className="glass-strong w-full max-w-lg overflow-hidden p-0"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <div className="flex items-center gap-2.5">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-accent-soft text-accent-ink">
                <UserPlus className="h-[18px] w-[18px]" />
              </span>
              <div>
                <h2 className="font-display text-[15px] font-semibold text-ink">
                  Create a user
                </h2>
                <p className="text-xs text-ink-400">
                  They sign in with the temporary password below.
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="hover-surface grid h-8 w-8 place-items-center rounded-lg text-ink-400 hover:text-ink"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <form onSubmit={submit} className="space-y-4 p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Full name">
                <input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Jane Doe"
                  className="input"
                />
              </Field>
              <Field label="Email">
                <input
                  required
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="jane@2wayclick.com"
                  className="input"
                />
              </Field>
            </div>

            <Field label="Role">
              <div className="grid gap-2 sm:grid-cols-2">
                {assignableRoles.map((r) => {
                  const on = role === r;
                  return (
                    <button
                      type="button"
                      key={r}
                      onClick={() => setRole(r)}
                      className={
                        "rounded-xl border px-3 py-2.5 text-left transition " +
                        (on
                          ? "border-accent bg-accent-soft"
                          : "border-line hover:border-line-strong")
                      }
                    >
                      <span className="flex items-center gap-1.5 text-sm font-medium text-ink">
                        {ROLE_LABELS[r]}
                        {on && <Check className="h-3.5 w-3.5 text-accent-ink" />}
                      </span>
                      <span className="mt-0.5 block text-[11px] leading-snug text-ink-400">
                        {ROLE_DESCRIPTIONS[r]}
                      </span>
                    </button>
                  );
                })}
              </div>
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Department">
                <select
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  className="input"
                >
                  {departments.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Job title (optional)">
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Senior Engineer"
                  className="input"
                />
              </Field>
            </div>

            <Field label="Temporary password">
              <div className="flex items-center gap-2">
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input font-mono"
                  minLength={8}
                  required
                />
                <button
                  type="button"
                  onClick={() => setPassword(genPassword())}
                  aria-label="Regenerate"
                  title="Regenerate"
                  className="hover-surface grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-line text-ink-400 hover:text-ink"
                >
                  <RefreshCw className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={copyPassword}
                  aria-label="Copy"
                  title="Copy"
                  className="hover-surface grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-line text-ink-400 hover:text-ink"
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-success" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </button>
              </div>
              <p className="mt-1.5 text-[11px] text-ink-400">
                Share this with the new user — they should change it after first
                sign-in.
              </p>
            </Field>

            {error && (
              <p className="rounded-lg border border-danger/20 bg-danger-soft px-3 py-2 text-xs text-danger-ink">
                {error}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="glass" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <UserPlus className="h-4 w-4" />
                )}
                Create user
              </Button>
            </div>
          </form>
        </motion.div>
      </div>
    </>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-ink-500">{label}</span>
      {children}
    </label>
  );
}
