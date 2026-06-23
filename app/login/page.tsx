import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import { resolveClientBrand, resolveClientBrandForTenant } from "@/lib/branding";
import { tenantIdForSubdomain } from "@/lib/tenant";
import { BrandProvider } from "@/components/BrandProvider";
import { LoginPanel } from "./LoginPanel";
import { LoginHero } from "./LoginHero";
import { LoginThemeToggle } from "./LoginThemeToggle";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  // Show the SUBDOMAIN's tenant brand on the login screen (there's no session
  // yet, so resolve the tenant from the host). Falls back to the env brand on
  // bare/unknown hosts.
  const hdrs = await headers();
  const tenantId = await tenantIdForSubdomain(hdrs.get("x-tenant-subdomain"));
  const brand = tenantId
    ? await resolveClientBrandForTenant(tenantId)
    : await resolveClientBrand();

  return (
    <BrandProvider brand={brand}>
      <main className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/* Theme switch — floats over the form panel, top-right. */}
      <LoginThemeToggle />

      {/* ── Left: branded gradient hero ──────────────────────────────────
         Hidden on small screens; the form takes the full width there. */}
      <LoginHero />

      {/* ── Right: the sign-in form on the clean canvas. ─────────────────── */}
      <div className="relative flex items-center justify-center bg-paper px-5 py-12 sm:px-8">
        {/* A faint warm glow bleeds in from the hero side on large screens so
            the seam between the two panels feels intentional. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 hidden w-64 lg:block"
          style={{
            background:
              "linear-gradient(90deg, rgb(var(--c-accent) / 0.06), transparent)",
          }}
        />
        <div className="relative z-10 flex w-full justify-center">
          <LoginPanel />
        </div>
      </div>
      </main>
    </BrandProvider>
  );
}
