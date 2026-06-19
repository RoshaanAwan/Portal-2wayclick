"use client";

import { useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
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
  Gauge,
  Clock,
  Receipt,
  Wallet,
  Banknote,
  MessageSquare,
  X,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/ui/Logo";
import { can, isManagerTier } from "@/lib/permissions";
import { useMobileNav } from "@/components/MobileNavProvider";
import { useMessaging } from "@/components/MessagingProvider";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/messages", label: "Messages", icon: MessageSquare },
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
  const { open, closeNav } = useMobileNav();
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
    if (href === pathname) {
      closeNav(); // already here — just dismiss the mobile drawer
      return;
    }
    setTarget(href); // flip the highlight immediately
    startTransition(() => router.push(href));
  }

  // Team Pulse + Performance — manager tier and up (they manage people).
  const managerNav = isManagerTier(role)
    ? [
        { href: "/pulse", label: "Team Pulse", icon: Activity },
        { href: "/performance", label: "Performance", icon: Gauge },
      ]
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
    // Invoices — admin tier (create/send client invoices).
    ...(can.manageInvoices(role)
      ? [{ href: "/invoices", label: "Invoices", icon: Receipt }]
      : []),
    // Finance — admin tier (expenses, per-user monthly salaries).
    ...(can.manageFinance(role)
      ? [
          { href: "/expenses", label: "Expenses", icon: Wallet },
          { href: "/salaries", label: "Salaries", icon: Banknote },
        ]
      : []),
    ...(can.viewAuditLog(role)
      ? [{ href: "/admin/logs", label: "Audit Log", icon: ScrollText }]
      : []),
  ];

  const sections = { adminTierNav, managerNav, adminNav };

  return (
    <>
      {/* ── Desktop: the fixed sidebar, lg and up. ─────────────────────────── */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col p-3 lg:flex">
        <SidebarBody
          isActive={isActive}
          go={go}
          sections={sections}
          scope="desktop"
        />
      </aside>

      {/* ── Mobile: a slide-in drawer below lg, opened from the topbar. ─────── */}
      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-50 lg:hidden">
            {/* Backdrop — tap to dismiss. */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={closeNav}
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            />
            {/* Drawer panel — same nav as desktop, with a close affordance. */}
            <motion.aside
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", stiffness: 360, damping: 38 }}
              className="absolute inset-y-0 left-0 flex w-[min(18rem,85vw)] flex-col p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pl-[calc(0.75rem+env(safe-area-inset-left))] pt-[calc(0.75rem+env(safe-area-inset-top))]"
            >
              <SidebarBody
                isActive={isActive}
                go={go}
                sections={sections}
                scope="mobile"
                onClose={closeNav}
              />
            </motion.aside>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
};

// The shared inner panel — brand, scrollable nav, and the changelog card. Used
// by both the fixed desktop sidebar and the mobile drawer so the two stay
// identical. `onClose` (mobile only) renders a close button in the brand row.
function SidebarBody({
  isActive,
  go,
  sections,
  scope,
  onClose,
}: {
  isActive: (href: string) => boolean;
  go: (e: React.MouseEvent, href: string) => void;
  sections: {
    adminTierNav: NavItem[];
    managerNav: NavItem[];
    adminNav: NavItem[];
  };
  scope: string;
  onClose?: () => void;
}) {
  const { adminTierNav, managerNav, adminNav } = sections;
  // Live unread total for the Messages entry — same source as the page badge.
  const { totalUnread } = useMessaging();
  return (
    <div className="glass relative flex h-full flex-col overflow-hidden px-3 py-4">
      {/* Brand */}
      <div className="mb-7 flex items-center gap-2.5 px-2 pt-1">
        <Link
          href="/dashboard"
          onClick={(e) => go(e, "/dashboard")}
          className="group flex min-w-0 flex-1 items-center gap-2.5"
        >
          <Logo size="sm" />
          <span className="truncate font-display text-[18px] font-semibold tracking-tight text-ink">
            2WayClick
          </span>
          <span className="rounded-md border border-line bg-surface-2 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-ink-400">
            v3
          </span>
        </Link>
        {/* Close — mobile drawer only. */}
        {onClose && (
          <button
            onClick={onClose}
            aria-label="Close menu"
            className="hover-surface -mr-1 grid h-9 w-9 shrink-0 place-items-center rounded-xl text-ink-400 transition hover:text-ink-700 lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

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
            scope={scope}
            badge={item.href === "/messages" ? totalUnread : 0}
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
            scope={scope}
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
            scope={scope}
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
                scope={scope}
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
  );
}

// A single sidebar entry — the sliding accent pill marks the active item.
function NavLink({
  href,
  label,
  Icon,
  active,
  onGo,
  scope,
  badge = 0,
}: {
  href: string;
  label: string;
  Icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  active: boolean;
  onGo: (e: React.MouseEvent, href: string) => void;
  // Disambiguates the sliding-pill layoutId between the desktop and mobile
  // instances, which can both be mounted at once (drawer open over the page).
  scope: string;
  // Optional unread count pill (Messages). Hidden when 0.
  badge?: number;
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
          layoutId={`nav-active-${scope}`}
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
      <span className="relative z-10 flex-1">{label}</span>
      {badge > 0 && (
        <span
          className={cn(
            "relative z-10 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none",
            active ? "bg-white/25 text-white" : "bg-accent text-white",
          )}
        >
          {badge > 9 ? "9+" : badge}
        </span>
      )}
    </Link>
  );
}
