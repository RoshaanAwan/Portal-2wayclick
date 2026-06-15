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
  FolderKanban,
  Wrench,
  Sparkles,
  ShieldCheck,
  ScrollText,
  Activity,
  Clock,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/ui/Logo";
import { can, isManagerTier } from "@/lib/permissions";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/announcements", label: "Announcements", icon: Megaphone },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  // Directory is admin-tier only — see adminTierNav below.
  { href: "/documents", label: "Documents", icon: FileText },
  { href: "/requests", label: "Time Off", icon: CalendarCheck },
  { href: "/attendance", label: "Attendance", icon: Clock },
  { href: "/tools", label: "Tools", icon: Wrench },
];

export function Sidebar({ role }: { role?: string | null }) {
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

  // Team Pulse — manager tier and up (they manage people / can decide leave).
  const managerNav = isManagerTier(role)
    ? [{ href: "/pulse", label: "Team Pulse", icon: Activity }]
    : [];

  // Directory (the people list + org chart) — admin tier only (Super Admin /
  // Admin). Hidden from HR, Lead, PM, and Employee.
  const adminTierNav = can.accessAdmin(role)
    ? [{ href: "/directory", label: "Directory", icon: Users }]
    : [];

  // Admin section — shown only to those allowed. /admin/users for the admin
  // tier; /admin/logs for Super Admin, Admin, and Project Manager.
  const adminNav = [
    ...(can.accessAdmin(role)
      ? [{ href: "/admin/users", label: "Users", icon: ShieldCheck }]
      : []),
    ...(can.viewAuditLog(role)
      ? [{ href: "/admin/logs", label: "Audit Log", icon: ScrollText }]
      : []),
  ];

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col p-3 lg:flex">
      <div className="glass relative flex h-full flex-col overflow-hidden px-3 py-4">
        {/* Brand */}
        <Link
          href="/dashboard"
          className="group mb-7 flex items-center gap-2.5 px-2 pt-1"
        >
          <Logo size="sm" />
          <span className="font-display text-[18px] font-semibold tracking-tight text-ink">
            2WayClick
          </span>
          <span className="ml-auto rounded-md border border-line bg-surface-2 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-ink-400">
            v3
          </span>
        </Link>

        {/* Nav — scrolls when entries + footer exceed the viewport (admins have
            the most items). min-h-0 lets this flex child actually scroll. */}
        <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto">
          <p className="eyebrow mb-2 px-3">Workspace</p>
          {NAV.map((item) => (
            <NavLink
              key={item.href}
              href={item.href}
              label={item.label}
              Icon={item.icon}
              active={isActive(item.href)}
              onGo={go}
            />
          ))}

          {/* Directory — admin tier only. */}
          {adminTierNav.map((item) => (
            <NavLink
              key={item.href}
              href={item.href}
              label={item.label}
              Icon={item.icon}
              active={isActive(item.href)}
              onGo={go}
            />
          ))}

          {/* Team Pulse — manager tier and up. */}
          {managerNav.map((item) => (
            <NavLink
              key={item.href}
              href={item.href}
              label={item.label}
              Icon={item.icon}
              active={isActive(item.href)}
              onGo={go}
            />
          ))}

          {/* Admin — visible only to admin-tier / Super Admin. */}
          {adminNav.length > 0 && (
            <div className="pt-4">
              <p className="eyebrow mb-2 px-3">Administration</p>
              {adminNav.map((item) => (
                <NavLink
                  key={item.href}
                  href={item.href}
                  label={item.label}
                  Icon={item.icon}
                  active={isActive(item.href)}
                  onGo={go}
                />
              ))}
            </div>
          )}
        </nav>

        {/* Upgrade / changelog card — pinned below the scrollable nav. */}
        <div className="relative mt-4 shrink-0 overflow-hidden rounded-xl border border-line bg-surface-2 p-3.5">
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

// A single sidebar entry — the sliding accent pill marks the active item.
function NavLink({
  href,
  label,
  Icon,
  active,
  onGo,
}: {
  href: string;
  label: string;
  Icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  active: boolean;
  onGo: (e: React.MouseEvent, href: string) => void;
}) {
  return (
    <Link
      href={href}
      onClick={(e) => onGo(e, href)}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
        active ? "text-white" : "hover-surface text-ink-500 hover:text-ink",
      )}
    >
      {active && (
        <motion.div
          layoutId="nav-active"
          className="absolute inset-0 overflow-hidden rounded-xl bg-accent-grad"
          transition={{ type: "spring", stiffness: 380, damping: 32 }}
        />
      )}
      <Icon
        className={cn(
          "relative z-10 h-[18px] w-[18px] transition-transform duration-200 group-hover:scale-110",
          active ? "text-white" : "text-ink-400 group-hover:text-ink-700",
        )}
      />
      <span className="relative z-10">{label}</span>
    </Link>
  );
}
