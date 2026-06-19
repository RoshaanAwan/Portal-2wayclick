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
  Menu,
} from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Logo } from "@/components/ui/Logo";
import { timeAgo } from "@/lib/utils";
import { useNotifications } from "@/lib/useNotifications";
import { useMobileNav } from "@/components/MobileNavProvider";
import { isAdminTier } from "@/lib/permissions";
import type { SafeUser } from "@/lib/auth";

// Tint the notification type so each line reads at a glance.
const typeColor: Record<string, string> = {
  "announcement.created": "text-accent",
  "leave.decided": "text-success",
  "task.assigned": "text-info",
  "task.comment": "text-accent",
};

export function Topbar({ user }: { user: SafeUser }) {
  const router = useRouter();
  const { openNav } = useMobileNav();
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  // Real per-user notifications: loaded over HTTP, kept live via SSE, read state
  // persisted to the DB. See lib/useNotifications.ts.
  const { items: notifications, unread, markAllRead } = useNotifications();
  const hasUnread = unread > 0;

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-20 px-3 pt-[calc(0.75rem+env(safe-area-inset-top))] lg:px-6 lg:pt-3">
      <div className="frost flex items-center gap-2 rounded-2xl border border-line px-3 py-2.5 shadow-card sm:gap-3">
        {/* Mobile: hamburger opens the nav drawer (the sidebar is hidden below
            lg). Paired with a compact brand mark so the bar still reads as the
            app on phones, where the sidebar logo isn't visible. */}
        <button
          onClick={openNav}
          aria-label="Open menu"
          className="hover-surface grid h-9 w-9 shrink-0 place-items-center rounded-xl text-ink-500 transition hover:text-ink lg:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
        <span className="flex shrink-0 items-center lg:hidden">
          <Logo size="sm" />
        </span>

        {/* Command-bar search */}
        {/* <button className="group relative flex h-10 flex-1 max-w-md items-center gap-2.5 rounded-xl border border-line bg-surface-2/70 px-3 text-left transition hover:border-line-strong hover:bg-surface-2">
          <Search className="h-4 w-4 text-ink-400 transition group-hover:text-ink-500" />
          <span className="flex-1 text-sm text-ink-400">
            Search people, docs, posts…
          </span>
          <kbd className="hidden items-center gap-0.5 rounded-md border border-line bg-surface px-1.5 py-0.5 text-[10px] font-medium text-ink-400 sm:inline-flex">
            ⌘K
          </kbd>
        </button> */}

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
              <span className="absolute -right-0.5 -top-0.5 flex min-w-[18px] items-center justify-center">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent/40" />
                <span className="relative inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold leading-none text-white ring-2 ring-surface">
                  {unread > 9 ? "9+" : unread}
                </span>
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
                  className="glass-strong fixed inset-x-3 top-[calc(70px+env(safe-area-inset-top))] z-20 w-auto overflow-hidden p-0 sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-80"
                >
                  <div className="flex items-center justify-between border-b border-line px-4 py-3">
                    <h3 className="font-display text-sm font-semibold text-ink">
                      Notifications
                    </h3>
                    {hasUnread && (
                      <button
                        onClick={() => markAllRead()}
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
                      {notifications.map((n) => {
                        const row = (
                          <div className="hover-surface flex items-start gap-2.5 px-3 py-2.5">
                            {/* Unread marker keeps the dropdown scannable. */}
                            <span
                              className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${n.readAt ? "bg-transparent" : "bg-accent"}`}
                            />
                            <Avatar
                              name={n.actorName ?? "System"}
                              src={n.actorAvatar}
                              size="sm"
                            />
                            <div className="min-w-0 flex-1">
                              <p
                                className={`text-[13px] leading-snug ${n.readAt ? "text-ink-400" : "text-ink-700"}`}
                              >
                                {n.actorName && (
                                  <span className="font-semibold text-ink">
                                    {n.actorName}
                                  </span>
                                )}{" "}
                                <span
                                  className={`font-medium ${typeColor[n.type] ?? "text-ink-500"}`}
                                >
                                  {n.message}
                                </span>
                              </p>
                              <p className="mt-0.5 text-[11px] text-ink-400">
                                {timeAgo(n.createdAt)}
                              </p>
                            </div>
                          </div>
                        );
                        return (
                          <li key={n.id}>
                            {n.link ? (
                              <Link
                                href={n.link}
                                onClick={() => setNotifOpen(false)}
                                className="block"
                              >
                                {row}
                              </Link>
                            ) : (
                              row
                            )}
                          </li>
                        );
                      })}
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
                    {/* Profile page lives under the directory, which is admin
                        tier only. Others manage their profile via Settings. */}
                    {isAdminTier(user.role) && (
                      <Link
                        href={`/directory/${user.id}`}
                        onClick={() => setMenuOpen(false)}
                        className="hover-surface flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-ink-500 hover:text-ink"
                      >
                        <User className="h-4 w-4" />
                        My profile
                      </Link>
                    )}
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
