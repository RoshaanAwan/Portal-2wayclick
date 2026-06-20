"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  MoreHorizontal,
  Pencil,
  Ban,
  CircleCheck,
  KeyRound,
} from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { GlassCard } from "@/components/ui/GlassCard";
import { Pagination } from "@/components/ui/Pagination";
import {
  ROLE_LABELS,
  ROLE_DESCRIPTIONS,
  ROLE_BADGE,
  type Role,
} from "@/lib/permissions";
import { useListParams } from "@/lib/useListParams";
import { cn, formatDate } from "@/lib/utils";

export interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  title: string;
  department: string;
  avatarUrl: string | null;
  createdAt: string;
  disabled: boolean;
  /** Whether the current actor may edit / disable / reset this user. */
  canManage: boolean;
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
  page,
  pageCount,
  total,
  query,
  assignableRoles,
  departments,
}: {
  users: AdminUserRow[];
  page: number;
  pageCount: number;
  total: number;
  query: string;
  assignableRoles: Role[];
  departments: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // Row being edited, and the result of a password reset (shown once).
  const [editing, setEditing] = useState<AdminUserRow | null>(null);
  const [resetResult, setResetResult] = useState<{
    name: string;
    password: string;
  } | null>(null);
  const { setParams, isPending } = useListParams({ q: query, page });

  // Local mirror of the search box; debounced into the URL so search runs on
  // the server across every user, not just the current page.
  const [search, setSearch] = useState(query);
  useEffect(() => setSearch(query), [query]);
  useEffect(() => {
    if (search === query) return;
    const t = setTimeout(() => setParams({ q: search, page: 1 }), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-sm flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
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
          <table
            className={cn(
              "w-full min-w-full text-sm transition-opacity sm:min-w-[640px]",
              isPending && "opacity-60",
            )}
          >
            <thead>
              <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-ink-400">
                <th className="px-5 py-3 font-semibold">Member</th>
                <th className="px-5 py-3 font-semibold">Role</th>
                <th className="px-5 py-3 font-semibold">Department</th>
                <th className="px-5 py-3 font-semibold">Joined</th>
                <th className="px-5 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-ink-400">
                    {query ? `No users match “${query}”.` : "No users yet."}
                  </td>
                </tr>
              ) : (
                users.map((u) => (
                  <tr
                    key={u.id}
                    className={cn(
                      "border-b border-line/60 last:border-0 transition-colors hover:bg-[rgb(var(--hover)/var(--hover-opacity))]",
                      u.disabled && "opacity-60",
                    )}
                  >
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={u.name} src={u.avatarUrl} size="sm" />
                        <div className="min-w-0">
                          <p className="flex items-center gap-2 truncate font-medium text-ink">
                            {u.name}
                            {u.disabled && (
                              <Badge variant="red">Disabled</Badge>
                            )}
                          </p>
                          <p className="truncate text-xs text-ink-400">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3">{roleBadge(u.role)}</td>
                    <td className="px-5 py-3 text-ink-500">{u.department}</td>
                    <td className="px-5 py-3 text-ink-400">
                      {formatDate(u.createdAt)}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {u.canManage ? (
                        <RowActions
                          user={u}
                          onEdit={() => setEditing(u)}
                          onResetDone={(password) =>
                            setResetResult({ name: u.name, password })
                          }
                          onChanged={() => router.refresh()}
                        />
                      ) : (
                        <span className="text-xs text-ink-300">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </GlassCard>

      {total > 0 && (
        <div className="flex flex-col items-center gap-3">
          <Pagination
            page={page}
            pageCount={pageCount}
            disabled={isPending}
            onPage={(p) => setParams({ page: p })}
          />
          <p className="text-xs text-ink-400">
            {total} {total === 1 ? "member" : "members"}
          </p>
        </div>
      )}

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
        {editing && (
          <EditUserModal
            key="edit"
            user={editing}
            assignableRoles={assignableRoles}
            departments={departments}
            onClose={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);
              router.refresh();
            }}
          />
        )}
        {resetResult && (
          <ResetPasswordModal
            key="reset"
            name={resetResult.name}
            password={resetResult.password}
            onClose={() => setResetResult(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Row action menu ──────────────────────────────────────────────────────────
// A "⋯" button opening Edit / Disable-Enable / Reset password. Disable and reset
// run inline (with a tiny busy state); edit opens a modal owned by the parent.
function RowActions({
  user,
  onEdit,
  onResetDone,
  onChanged,
}: {
  user: AdminUserRow;
  onEdit: () => void;
  onResetDone: (password: string) => void;
  onChanged: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState<null | "disable" | "reset">(null);
  const [error, setError] = useState<string | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [coords, setCoords] = useState<{ top: number; right: number } | null>(
    null,
  );
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Anchor the portal-rendered menu to the trigger button. Using fixed
  // positioning lets the menu escape the table's `overflow-x-auto` wrapper and
  // the GlassCard's `overflow-hidden`, which would otherwise clip it.
  useLayoutEffect(() => {
    if (!menuOpen) return;
    function place() {
      const el = buttonRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setCoords({
        top: r.bottom + 6,
        right: window.innerWidth - r.right,
      });
    }
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [menuOpen]);

  async function toggleDisabled() {
    setBusy("disable");
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${user.id}/disable`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ disabled: !user.disabled }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not update access.");
      setMenuOpen(false);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  }

  async function resetPassword() {
    setBusy("reset");
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${user.id}/reset-password`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not reset password.");
      setMenuOpen(false);
      onResetDone(data.password as string);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="relative inline-block text-left">
      <button
        ref={buttonRef}
        onClick={() => setMenuOpen((o) => !o)}
        aria-label={`Actions for ${user.name}`}
        aria-expanded={menuOpen}
        className="hover-surface grid h-8 w-8 place-items-center rounded-lg border border-line text-ink-400 hover:text-ink"
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <MoreHorizontal className="h-4 w-4" />
        )}
      </button>

      {mounted &&
        createPortal(
          <AnimatePresence>
            {menuOpen && coords && (
              <>
                <div
                  className="fixed inset-0 z-[60]"
                  onClick={() => setMenuOpen(false)}
                />
                <motion.div
                  initial={{ opacity: 0, y: -6, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.97 }}
                  transition={{ duration: 0.14 }}
                  style={{ top: coords.top, right: coords.right }}
                  className="glass-strong fixed z-[61] w-48 overflow-hidden p-1.5 text-left shadow-pop"
                >
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      onEdit();
                    }}
                    className="hover-surface flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-ink-500 hover:text-ink"
                  >
                    <Pencil className="h-4 w-4" />
                    Edit
                  </button>
                  <button
                    onClick={toggleDisabled}
                    disabled={busy !== null}
                    className="hover-surface flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-ink-500 hover:text-ink disabled:opacity-50"
                  >
                    {user.disabled ? (
                      <>
                        <CircleCheck className="h-4 w-4 text-success" />
                        Enable
                      </>
                    ) : (
                      <>
                        <Ban className="h-4 w-4 text-danger-ink" />
                        Disable
                      </>
                    )}
                  </button>
                  <button
                    onClick={resetPassword}
                    disabled={busy !== null}
                    className="hover-surface flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-ink-500 hover:text-ink disabled:opacity-50"
                  >
                    <KeyRound className="h-4 w-4" />
                    Reset password
                  </button>
                  {error && (
                    <p className="px-3 py-1.5 text-[11px] text-danger-ink">
                      {error}
                    </p>
                  )}
                </motion.div>
              </>
            )}
          </AnimatePresence>,
          document.body,
        )}
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

// ── Shared modal shell ───────────────────────────────────────────────────────
function ModalShell({
  icon,
  title,
  subtitle,
  onClose,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
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
                {icon}
              </span>
              <div>
                <h2 className="font-display text-[15px] font-semibold text-ink">
                  {title}
                </h2>
                <p className="text-xs text-ink-400">{subtitle}</p>
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
          {children}
        </motion.div>
      </div>
    </>
  );
}

// ── Edit user ────────────────────────────────────────────────────────────────
function EditUserModal({
  user,
  assignableRoles,
  departments,
  onClose,
  onSaved,
}: {
  user: AdminUserRow;
  assignableRoles: Role[];
  departments: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(user.name);
  const [title, setTitle] = useState(user.title);
  const [department, setDepartment] = useState(user.department);
  const [role, setRole] = useState<Role>(user.role as Role);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The current role should always be visible even if the actor can't assign it
  // (e.g. it was set by a higher admin); it just isn't selectable in that case.
  const roleOptions: Role[] = assignableRoles.includes(user.role as Role)
    ? assignableRoles
    : [user.role as Role, ...assignableRoles];

  // A department not in the standard list (legacy data) is still selectable.
  const departmentOptions = departments.includes(department)
    ? departments
    : [department, ...departments];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${user.id}/update`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, title, department, role }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not save changes.");
        setSubmitting(false);
        return;
      }
      onSaved();
    } catch {
      setError("Network error — please try again.");
      setSubmitting(false);
    }
  }

  return (
    <ModalShell
      icon={<Pencil className="h-[18px] w-[18px]" />}
      title="Edit user"
      subtitle={user.email}
      onClose={onClose}
    >
      <form onSubmit={submit} className="space-y-4 p-5">
        <Field label="Full name">
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input"
          />
        </Field>

        <Field label="Role">
          <div className="grid gap-2 sm:grid-cols-2">
            {roleOptions.map((r) => {
              const on = role === r;
              const assignable = assignableRoles.includes(r);
              return (
                <button
                  type="button"
                  key={r}
                  disabled={!assignable}
                  onClick={() => assignable && setRole(r)}
                  className={
                    "rounded-xl border px-3 py-2.5 text-left transition " +
                    (on
                      ? "border-accent bg-accent-soft"
                      : "border-line hover:border-line-strong") +
                    (!assignable ? " cursor-not-allowed opacity-50" : "")
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
              {departmentOptions.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Job title">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Senior Engineer"
              className="input"
            />
          </Field>
        </div>

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
              <Check className="h-4 w-4" />
            )}
            Save changes
          </Button>
        </div>
      </form>
    </ModalShell>
  );
}

// ── Reset password result ────────────────────────────────────────────────────
// Shows the freshly-generated temporary password ONCE for the admin to copy.
function ResetPasswordModal({
  name,
  password,
  onClose,
}: {
  name: string;
  password: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard may be blocked — non-fatal */
    }
  }

  return (
    <ModalShell
      icon={<KeyRound className="h-[18px] w-[18px]" />}
      title="Password reset"
      subtitle={`A new temporary password for ${name}`}
      onClose={onClose}
    >
      <div className="space-y-4 p-5">
        <p className="text-sm text-ink-500">
          Share this with {name}. They&apos;ll use it to sign in, then should
          change it. Their existing sessions have been signed out.
        </p>
        <div className="flex items-center gap-2">
          <input
            readOnly
            value={password}
            className="input font-mono"
            onFocus={(e) => e.currentTarget.select()}
          />
          <button
            type="button"
            onClick={copy}
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
        <p className="text-[11px] text-ink-400">
          For security, this password won&apos;t be shown again.
        </p>
        <div className="flex justify-end pt-1">
          <Button type="button" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </ModalShell>
  );
}
