import { redirect } from "next/navigation";
import Link from "@/components/Link";
import { Building2, ShieldCheck, ScrollText } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { Logo } from "@/components/ui/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SystemLogoutButton } from "./SystemTopbar";

// ── System Owner shell ────────────────────────────────────────────────────────
// A deliberately minimal chrome for the platform operator area. It is NOT the
// tenant shell: no Sidebar/Topbar, no BrandProvider, no AI widget, no tenant
// business nav. System Owners manage TENANTS ONLY, so the only nav item is
// "Tenants". Dark, on-brand tokens; gated to isSystemOwner at the top.
export default async function SystemLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.isSystemOwner) redirect("/dashboard");

  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="sticky top-0 z-20 border-b border-line bg-surface/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3 lg:px-6">
          <Logo size="sm" />
          <span className="inline-flex items-center gap-1.5 rounded-md border border-line bg-paper px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
            <ShieldCheck className="h-3.5 w-3.5 text-accent" />
            System Owner
          </span>

          {/* The System Owner's whole world: tenants + the platform log. */}
          <nav className="ml-2 hidden items-center gap-1 sm:flex">
            <Link
              href="/system/tenants"
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-ink-500 transition hover:text-ink"
            >
              <Building2 className="h-4 w-4" />
              Tenants
            </Link>
            <Link
              href="/system/logs"
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-ink-500 transition hover:text-ink"
            >
              <ScrollText className="h-4 w-4" />
              Platform Log
            </Link>
          </nav>

          <div className="flex-1" />

          <ThemeToggle />
          <span className="hidden text-sm text-ink-400 sm:block">
            {user.name}
          </span>
          <SystemLogoutButton />
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 lg:px-6">{children}</main>
    </div>
  );
}
