"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Bell,
  LogOut,
  ChevronDown,
  Settings,
  User,
  CheckCheck,
} from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { timeAgo } from "@/lib/utils";
import type { SafeUser } from "@/lib/auth";

export interface TopbarNotification {
  id: string;
  verb: string;
  target: string;
  createdAt: string;
  user: { name: string; avatarUrl?: string | null };
}

// Tint the verb word so each notification reads at a glance.
const verbColor: Record<string, string> = {
  posted: "text-accent",
  approved: "text-success",
  denied: "text-danger",
  requested: "text-warn",
  uploaded: "text-info",
  commented: "text-accent",
  joined: "text-success",
};

export function Topbar({
  user,
  notifications = [],
}: {
  user: SafeUser;
  notifications?: TopbarNotification[];
}) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  // Local "read" state — clearing the dot is a client concern; the feed itself
  // lives on the dashboard. Persisting per-user read state would need a model.
  const [read, setRead] = useState(false);
  const hasUnread = notifications.length > 0 && !read;

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-20 px-3 pt-3 lg:px-6">
      <div className="frost flex items-center gap-3 rounded-2xl border border-line px-3 py-2.5 shadow-card">
        {/* Command-bar search */}
        <button className="group relative flex h-10 flex-1 max-w-md items-center gap-2.5 rounded-xl border border-line bg-surface-2/70 px-3 text-left transition hover:border-line-strong hover:bg-surface-2">
          <Search className="h-4 w-4 text-ink-400 transition group-hover:text-ink-500" />
          <span className="flex-1 text-sm text-ink-400">
            Search people, docs, posts…
          </span>
          <kbd className="hidden items-center gap-0.5 rounded-md border border-line bg-surface px-1.5 py-0.5 text-[10px] font-medium text-ink-400 sm:inline-flex">
            ⌘K
          </kbd>
        </button>

        <div className="flex-1" />

        {/* Theme switch */}
        <ThemeToggle />

        {/* Notifications */}
        <div className="relative">
          <button
            aria-label="Notifications"
            aria-expanded={notifOpen}
            onClick={() => {
              setNotifOpen((o) => !o);
              setMenuOpen(false);
            }}
            className="hover-surface relative grid h-9 w-9 place-items-center rounded-xl text-ink-400 transition hover:text-ink-700"
          >
            <Bell className="h-[18px] w-[18px]" />
            {hasUnread && (
              <span className="absolute right-2 top-2 flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent/70" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-accent ring-2 ring-surface" />
              </span>
            )}
          </button>

          <AnimatePresence>
            {notifOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setNotifOpen(false)}
                />
                <motion.div
                  initial={{ opacity: 0, y: -8, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.97 }}
                  transition={{ duration: 0.15 }}
                  className="glass-strong absolute right-0 z-20 mt-2 w-80 overflow-hidden p-0"
                >
                  <div className="flex items-center justify-between border-b border-line px-4 py-3">
                    <h3 className="font-display text-sm font-semibold text-ink">
                      Notifications
                    </h3>
                    {hasUnread && (
                      <button
                        onClick={() => setRead(true)}
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-ink-400 transition hover:text-accent"
                      >
                        <CheckCheck className="h-3.5 w-3.5" />
                        Mark all read
                      </button>
                    )}
                  </div>

                  {notifications.length === 0 ? (
                    <div className="px-4 py-10 text-center">
                      <Bell className="mx-auto mb-2 h-6 w-6 text-ink-300" />
                      <p className="text-sm text-ink-400">You&apos;re all caught up</p>
                    </div>
                  ) : (
                    <ul className="max-h-80 overflow-y-auto py-1">
                      {notifications.map((n) => (
                        <li key={n.id}>
                          <div className="hover-surface flex items-start gap-2.5 px-3 py-2.5">
                            <Avatar
                              name={n.user.name}
                              src={n.user.avatarUrl}
                              size="sm"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="text-[13px] leading-snug text-ink-700">
                                <span className="font-semibold text-ink">
                                  {n.user.name}
                                </span>{" "}
                                <span
                                  className={`font-medium ${verbColor[n.verb] ?? "text-ink-500"}`}
                                >
                                  {n.verb}
                                </span>{" "}
                                <span className="text-ink-500">{n.target}</span>
                              </p>
                              <p className="mt-0.5 text-[11px] text-ink-400">
                                {timeAgo(n.createdAt)}
                              </p>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}

                  <Link
                    href="/dashboard"
                    onClick={() => setNotifOpen(false)}
                    className="hover-surface block border-t border-line px-4 py-2.5 text-center text-xs font-medium text-ink-500 hover:text-ink"
                  >
                    View all activity
                  </Link>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>

        <div className="h-6 w-px bg-line" />

        {/* Profile menu */}
        <div className="relative">
          <button
            onClick={() => {
              setMenuOpen((o) => !o);
              setNotifOpen(false);
            }}
            aria-expanded={menuOpen}
            className="hover-surface flex items-center gap-2.5 rounded-xl py-1 pl-1 pr-2"
          >
            <Avatar name={user.name} src={user.avatarUrl} size="sm" />
            <div className="hidden text-left sm:block">
              <p className="text-xs font-semibold leading-tight text-ink">
                {user.name}
              </p>
              <p className="text-[10px] leading-tight text-ink-400">
                {user.title}
              </p>
            </div>
            <ChevronDown
              className={`hidden h-3.5 w-3.5 text-ink-400 transition-transform duration-200 sm:block ${menuOpen ? "rotate-180" : ""}`}
            />
          </button>

          <AnimatePresence>
            {menuOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setMenuOpen(false)}
                />
                <motion.div
                  initial={{ opacity: 0, y: -8, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.97 }}
                  transition={{ duration: 0.15 }}
                  className="glass-strong absolute right-0 z-20 mt-2 w-60 overflow-hidden p-1.5"
                >
                  <div className="flex items-center gap-3 border-b border-line px-3 py-3">
                    <Avatar name={user.name} src={user.avatarUrl} size="md" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink">
                        {user.name}
                      </p>
                      <p className="truncate text-xs text-ink-400">{user.email}</p>
                    </div>
                  </div>
                  <div className="mt-1 space-y-0.5">
                    <Link
                      href={`/directory/${user.id}`}
                      onClick={() => setMenuOpen(false)}
                      className="hover-surface flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-ink-500 hover:text-ink"
                    >
                      <User className="h-4 w-4" />
                      My profile
                    </Link>
                    <Link
                      href="/settings"
                      onClick={() => setMenuOpen(false)}
                      className="hover-surface flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-ink-500 hover:text-ink"
                    >
                      <Settings className="h-4 w-4" />
                      Settings
                    </Link>
                    <button
                      onClick={logout}
                      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-ink-500 transition hover:bg-danger-soft hover:text-danger-ink"
                    >
                      <LogOut className="h-4 w-4" />
                      Sign out
                    </button>
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
}
