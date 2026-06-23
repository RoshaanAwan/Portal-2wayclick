import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getCurrentUser, getImpersonation } from "@/lib/auth";
import { getTenantBySubdomain } from "@/lib/tenant";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { AssistantWidgetLazy } from "@/components/AssistantWidgetLazy";
import { MobileNavProvider } from "@/components/MobileNavProvider";
import { MessagingProvider } from "@/components/MessagingProvider";
import { BrandProvider } from "@/components/BrandProvider";
import { resolveClientBrand } from "@/lib/branding";
import { CHAT_ENABLED } from "@/lib/features";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // System Owners have NO tenant identity — they manage tenants only and must
  // never render the tenant shell. Bounce them to their own area. (When a System
  // Owner impersonates, getCurrentUser returns the impersonated TENANT user,
  // whose isSystemOwner is false — so this correctly does NOT fire then.)
  if (user.isSystemOwner) redirect("/system/tenants");

  // Tenant guard: if the request arrives on a tenant SUBDOMAIN whose tenant is
  // missing or suspended, the workspace is unavailable → show /suspended. Only
  // applies when a subdomain is present — the bare host (platform admin / no
  // subdomain) carries no x-tenant-subdomain and is left untouched.
  const subdomain = (await headers()).get("x-tenant-subdomain");
  if (subdomain) {
    const tenant = await getTenantBySubdomain(subdomain);
    if (!tenant || tenant.status === "suspended") redirect("/suspended");
  }

  const brand = await resolveClientBrand();
  const impersonating = await getImpersonation();

  // The topbar bell loads the user's own notifications (and subscribes to a live
  // SSE stream) client-side — see components/Topbar.tsx.
  const shell = (
    <div className="min-h-screen">
      <Sidebar role={user.role} />
      <div className="lg:pl-64">
        <Topbar user={user} impersonating={!!impersonating} />
        <main className="px-4 py-6 lg:px-8">{children}</main>
      </div>
      {/* Floating AI assistant (bottom-right) — answers from scoped portal data.
          Lazy-loaded so its JS stays off every page's critical hydration path. */}
      <AssistantWidgetLazy />
    </div>
  );

  return (
    <BrandProvider brand={brand}>
      <MobileNavProvider>
        {/* MessagingProvider owns the single chat SSE/poll stream + conversation
            list, so both the Sidebar (unread badge) and the /messages page read one
            source. Mounted only when chat is enabled (lib/features.ts CHAT_ENABLED)
            — while off, its polling loop never runs and nothing chat-related loads. */}
        {CHAT_ENABLED ? (
          <MessagingProvider
            me={{ id: user.id, name: user.name, avatarUrl: user.avatarUrl }}
          >
            {shell}
          </MessagingProvider>
        ) : (
          shell
        )}
      </MobileNavProvider>
    </BrandProvider>
  );
}
