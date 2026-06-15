"use client";

import { useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  LayoutDashboard,
  Megaphone,
  Users,
  FileText,
  CalendarCheck,
  KanbanSquare,
  FolderKanban,
  Wrench,
  Hexagon,
  Sparkles,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/announcements", label: "Announcements", icon: Megaphone },
  { href: "/tasks", label: "Tasks", icon: KanbanSquare },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/directory", label: "Directory", icon: Users },
  { href: "/documents", label: "Documents", icon: FileText },
  { href: "/requests", label: "Time Off", icon: CalendarCheck },
  { href: "/tools", label: "Tools", icon: Wrench },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // Optimistic target: the href the user just clicked. We light it up instantly
  // instead of waiting for the destination's server data to load (which is what
  // makes the highlight feel laggy when bound to `pathname` alone).
  const [target, setTarget] = useState<string | null>(null);

  // While a navigation is in flight, treat the clicked href as the active one.
  // Once it lands (or no nav is pending) fall back to the real pathname.
  const activePath = isPending && target ? target : pathname;

  function isActive(href: string) {
    return (
      activePath === href ||
      (href !== "/dashboard" && activePath.startsWith(href))
    );
  }

  function go(e: React.MouseEvent, href: string) {
    // Let modified clicks (new tab, etc.) behave natively.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    if (href === pathname) return;
    setTarget(href); // flip the highlight immediately
    startTransition(() => router.push(href));
  }

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col p-3 lg:flex">
      <div className="glass relative flex h-full flex-col overflow-hidden px-3 py-4">
        {/* Brand */}
        <Link
          href="/dashboard"
          className="group mb-7 flex items-center gap-2.5 px-2 pt-1"
        >
          <div className="relative grid h-9 w-9 place-items-center overflow-hidden rounded-xl bg-accent-grad shadow-accent-glow">
            <span className="absolute -inset-2 animate-breathe rounded-full bg-accent/40 blur-lg" />
            <Hexagon className="relative h-[18px] w-[18px] text-white" strokeWidth={2.4} />
          </div>
          <span className="font-display text-[18px] font-semibold tracking-tight text-ink">
            2WayClick
          </span>
          <span className="ml-auto rounded-md border border-line bg-surface-2 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-ink-400">
            v3
          </span>
        </Link>

        {/* Nav */}
        <nav className="flex-1 space-y-0.5">
          <p className="eyebrow mb-2 px-3">Workspace</p>
          {NAV.map((item) => {
            const active = isActive(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={(e) => go(e, item.href)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "text-white"
                    : "hover-surface text-ink-500 hover:text-ink",
                )}
              >
                {active && (
                  <motion.div
                    layoutId="nav-active"
                    className="shine absolute inset-0 overflow-hidden rounded-xl bg-accent-grad shadow-accent-glow"
                    transition={{ type: "spring", stiffness: 380, damping: 32 }}
                  />
                )}
                <Icon
                  className={cn(
                    "relative z-10 h-[18px] w-[18px] transition-transform duration-200 group-hover:scale-110",
                    active ? "text-white" : "text-ink-400 group-hover:text-ink-700",
                  )}
                />
                <span className="relative z-10">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Upgrade / changelog card */}
        <div className="relative mt-4 overflow-hidden rounded-xl border border-line bg-surface-2 p-3.5">
          <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-accent/15 blur-2xl" />
          <div className="relative flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-accent" />
            <p className="text-xs font-semibold text-ink-700">2WayClick 3.0</p>
          </div>
          <p className="relative mt-1 text-[11px] leading-relaxed text-ink-400">
            Shipping Friday — a faster, cleaner workspace.
          </p>
        </div>
      </div>
    </aside>
  );
}
