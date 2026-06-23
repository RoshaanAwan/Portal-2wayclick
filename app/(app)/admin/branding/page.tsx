import { Palette } from "lucide-react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getBrandingRow } from "@/lib/branding";
import { BRAND, pageTitle } from "@/lib/brand";
import { PageHeader } from "@/components/ui/PageHeader";
import { BrandingClient } from "./BrandingClient";

export const metadata = { title: pageTitle("Branding") };

export default async function AdminBrandingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // The /admin layout already blocks non-admin-tier; this is defense-in-depth.
  if (!can.manageBranding(user.role)) redirect("/dashboard");

  // Current saved override (may be null). Env defaults are shown as placeholders
  // so an admin can see what each field falls back to when left blank.
  const row = await getBrandingRow();

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Branding"
        subtitle="White-label the portal — name, colors, logo, and contact details."
        icon={Palette}
      />
      <BrandingClient
        initial={{
          companyName: row?.companyName ?? "",
          tagline: row?.tagline ?? "",
          legalName: row?.legalName ?? "",
          website: row?.website ?? "",
          emailDomain: row?.emailDomain ?? "",
          logoUrl: row?.logoUrl ?? "",
          accentHex: row?.accentHex ?? "",
        }}
        defaults={{
          companyName: BRAND.name,
          tagline: BRAND.tagline,
          legalName: BRAND.legalName,
          website: BRAND.website,
          emailDomain: BRAND.emailDomain,
          accentHex: BRAND.accentHex,
        }}
      />
    </div>
  );
}
