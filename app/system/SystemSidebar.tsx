"use client";

import { useState, useTransition, useEffect } from "react";
import Link from "@/components/Link";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Building2,
  ShieldCheck,
  ScrollText,
  Megaphone,
  FolderOpen,
  Settings,
  LogOut,
  X,
  ChevronDown,
  User,
  HardDrive,
  KeyRound,
  Blocks,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/ui/Logo";
import { Avatar } from "@/components/ui/Avatar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useSystemNav } from "./SystemNavProvider";

const PLATFORM_NAV = [
  { href: "/system/tenants",       label: "Tenants",       icon: Building2  },
  { href: "/system/announcements", label: "Announcements", icon: Megaphone  },
  { href: "/system/documents",     label: "Documents",     icon: FolderOpen },
  { href: "/system/tools",         label: "Tools",         icon: Wrench     },
  { href: "/system/integrations",  label: "Integrations",  icon: Blocks     },
  { href: "/system/logs",          label: "Platform Log",  icon: ScrollText },
];

const SETTINGS_CHILDREN = [
  { href: "/system/settings#profile",  label: "Profile",       icon: User      },
  { href: "/system/settings#drive",    label: "Google Drive",  icon: HardDrive },
  { href: "/system/settings#security", label: "Security",      icon: KeyRound  },
];

export function SystemSidebar({
  userName,
  avatarUrl,
}: {
  userName: string;
  avatarUrl: string | null;
}) {
  const { open, closeNav } = useSystemNav();

  return (
    <>
      {/* Desktop fixed sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col p-3 lg:flex">
        <SidebarBody
          userName={userName}
          avatarUrl={avatarUrl}
          scope="desktop"
          onClose={() => {}}
        />
      </aside>

      {/* Mobile drawer — opened by the hamburger in SystemTopbar */}
      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={closeNav}
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            />
            <motion.aside
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", stiffness: 360, damping: 38 }}
              className="absolute inset-y-0 left-0 flex w-[min(16rem,85vw)] flex-col p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pl-[calc(0.75rem+env(safe-area-inset-left))] pt-[calc(0.75rem+env(safe-area-inset-top))]"
            >
              <SidebarBody
                userName={userName}
                avatarUrl={avatarUrl}
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

function SidebarBody({
  userName,
  avatarUrl,
  scope,
  onClose,
}: {
  userName: string;
  avatarUrl: string | null;
  scope: string;
  onClose: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [target, setTarget] = useState<string | null>(null);

  const onSettings = pathname.startsWith("/system/settings");
  const [settingsOpen, setSettingsOpen] = useState(onSettings);

  const activePath = isPending && target ? target : pathname;

  function isActive(href: string) {
    const path = href.split("#")[0];
    return activePath === path || activePath.startsWith(path);
  }

  function go(e: React.MouseEvent, href: string) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    const path = href.split("#")[0];
    const hash = href.includes("#") ? href.split("#")[1] : null;
    if (path === pathname) {
      if (hash) document.getElementById(hash)?.scrollIntoView({ behavior: "smooth" });
      onClose();
      return;
    }
    setTarget(path);
    startTransition(() => router.push(href));
    onClose();
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="glass relative flex h-full flex-col overflow-hidden px-3 py-4">

      {/* Brand row */}
      <div className="mb-7 flex items-center gap-2.5 px-2 pt-1">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <Logo size="sm" />
          <span className="truncate font-display text-[18px] font-semibold tracking-tight text-ink">
            System
          </span>
          <span className="rounded-md border border-line bg-surface-2 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-ink-400">
            Owner
          </span>
        </div>
        {scope === "mobile" && (
          <button
            onClick={onClose}
            aria-label="Close menu"
            className="hover-surface -mr-1 grid h-9 w-9 shrink-0 place-items-center rounded-xl text-ink-400 transition hover:text-ink-700 lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Scrollable nav */}
      <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto">
        <p className="eyebrow mb-2 px-3">Platform</p>
        {PLATFORM_NAV.map((item) => (
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

      </nav>

      {/* Bottom user card */}
      {/* <div className="relative mt-4 shrink-0 overflow-hidden rounded-xl border border-line bg-surface-2 p-3.5">
        <div className="flex items-center gap-2.5">
          <Avatar name={userName} src={avatarUrl} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-ink">{userName}</p>
            <p className="flex items-center gap-1 text-[10px] text-ink-400">
              <ShieldCheck className="h-3 w-3 text-accent" />
              System Owner
            </p>
          </div>
          <ThemeToggle />
          <button
            onClick={logout}
            aria-label="Sign out"
            title="Sign out"
            className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-ink-400 transition hover:bg-danger-soft hover:text-danger-ink"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </div> */}
    </div>
  );
}

function ExpandableGroup({
  label,
  Icon,
  open,
  active,
  scope,
  onToggle,
  children,
}: {
  label: string;
  Icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  open: boolean;
  active: boolean;
  scope: string;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "group relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
          active ? "text-white" : "hover-surface text-ink-500 hover:text-ink",
        )}
      >
        {active && (
          <motion.div
            layoutId={`sys-nav-active-${scope}`}
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
        <span className="relative z-10 flex-1 text-left">{label}</span>
        <ChevronDown
          className={cn(
            "relative z-10 h-3.5 w-3.5 shrink-0 transition-transform duration-200",
            open ? "rotate-180" : "rotate-0",
            active ? "text-white/70" : "text-ink-400",
          )}
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="settings-children"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="ml-3 mt-0.5 space-y-0.5 border-l border-line pl-3">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SubNavLink({
  href,
  label,
  Icon,
  onGo,
}: {
  href: string;
  label: string;
  Icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  onGo: (e: React.MouseEvent, href: string) => void;
}) {
  const pathname = usePathname();
  const hash = href.includes("#") ? href.split("#")[1] : "";
  const [currentHash, setCurrentHash] = useState<string>(() =>
    typeof window !== "undefined" ? window.location.hash.replace("#", "") : "",
  );

  useEffect(() => {
    const sync = () => setCurrentHash(window.location.hash.replace("#", ""));
    window.addEventListener("hashchange", sync);
    window.addEventListener("popstate", sync);
    return () => {
      window.removeEventListener("hashchange", sync);
      window.removeEventListener("popstate", sync);
    };
  }, []);

  const active = pathname.startsWith("/system/settings") && (!hash || currentHash === hash);

  return (
    <Link
      href={href}
      onClick={(e) => onGo(e, href)}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-accent-soft text-accent-ink"
          : "text-ink-500 hover:bg-surface-2 hover:text-ink",
      )}
    >
      <Icon
        className={cn(
          "h-[15px] w-[15px] shrink-0 transition-transform duration-200 group-hover:scale-110",
          active ? "text-accent" : "text-ink-400 group-hover:text-ink-600",
        )}
      />
      {label}
    </Link>
  );
}

function NavLink({
  href,
  label,
  Icon,
  active,
  onGo,
  scope,
}: {
  href: string;
  label: string;
  Icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  active: boolean;
  onGo: (e: React.MouseEvent, href: string) => void;
  scope: string;
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
          layoutId={`sys-nav-active-${scope}`}
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
