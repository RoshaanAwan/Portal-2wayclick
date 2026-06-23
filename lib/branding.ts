import "server-only";
import { cache } from "react";
import { db, adminDb } from "./db";
import { getTenantId } from "./tenantContext";
import { currentRequestTenantId } from "./tenant";
import { BRAND, type Brand } from "./brand";

// ── Brand config (DB layer) ───────────────────────────────────────────────────
// White-label source of truth, level 2 of 2. A PER-TENANT `BrandingSettings` row
// lets each tenant's Admin override the env defaults (lib/brand.ts) at runtime —
// no redeploy. `resolveBrand()` merges the row over the env layer: any non-null
// DB field wins, everything else falls through to env.
//
// Wrapped in React.cache() like getCurrentUser() (lib/auth.ts) so the layout,
// header, footer share one query per request. When there's no tenant context
// (the login screen, platform pages) we return null → the env brand, instead of
// throwing on the scoped client.

export const getBrandingRow = cache(async () => {
  // Resolve the tenant in priority order, so the root-layout accent injection
  // (which runs before getCurrentUser) is always tenant-correct:
  //   1. explicit ALS context  2. session cookie  3. the request SUBDOMAIN.
  // The subdomain fallback is what makes the brand accent correct on the LOGIN
  // screen, where there's no session yet but the host already identifies the
  // tenant. No tenant at all (bare/platform host) → env brand.
  const tenantId =
    getTenantId() ??
    (await currentRequestTenantId()) ??
    (await currentSubdomainTenantId());
  if (!tenantId) return null;
  try {
    return await adminDb.brandingSettings.findUnique({ where: { tenantId } });
  } catch {
    // Table not migrated yet, or DB unreachable — fall back to env brand.
    return null;
  }
});

/** Resolve the request's tenant from the x-tenant-subdomain header (no session
 *  needed). Returns null on bare/unknown hosts or outside a request. */
async function currentSubdomainTenantId(): Promise<string | null> {
  try {
    const { headers } = await import("next/headers");
    const sub = (await headers()).get("x-tenant-subdomain");
    if (!sub) return null;
    const { tenantIdForSubdomain } = await import("./tenant");
    return await tenantIdForSubdomain(sub);
  } catch {
    return null;
  }
}

/**
 * Resolve the brand for a SPECIFIC tenant id, regardless of the current context.
 * Used by public token routes that know the owning tenant from the row, and by
 * the login screen once it knows its subdomain's tenant. Uses adminDb so it
 * works with no ambient tenant context.
 */
export const resolveBrandForTenant = cache(
  async (tenantId: string): Promise<Brand> => {
    let row = null;
    try {
      row = await adminDb.brandingSettings.findUnique({ where: { tenantId } });
    } catch {
      row = null;
    }
    return mergeBrand(row);
  },
);

/** Returns the env-only brand if no override exists, never throws. */
export const resolveBrand = cache(async (): Promise<Brand> => {
  const row = await getBrandingRow();
  return mergeBrand(row);
});

type BrandingRow = NonNullable<Awaited<ReturnType<typeof getBrandingRow>>>;

function mergeBrand(row: BrandingRow | null): Brand {
  if (!row) return BRAND;
  return {
    name: row.companyName ?? BRAND.name,
    legalName: row.legalName ?? row.companyName ?? BRAND.legalName,
    tagline: row.tagline ?? BRAND.tagline,
    website: row.website ?? BRAND.website,
    emailDomain: row.emailDomain ?? BRAND.emailDomain,
    accentHex: row.accentHex ?? BRAND.accentHex,
    // Invoices print best with a definite accent; reuse the theme accent when
    // an explicit invoice accent isn't separately configured.
    invoiceAccent: row.accentHex ?? BRAND.invoiceAccent,
    logoUrl: row.logoUrl ?? BRAND.logoUrl,
  };
}

/**
 * The subset of the brand safe to expose to client components via BrandProvider
 * (no raw accent hex / invoice accent needed there — colors flow through CSS).
 */
export async function resolveClientBrand() {
  const b = await resolveBrand();
  return {
    name: b.name,
    legalName: b.legalName,
    tagline: b.tagline,
    website: b.website,
    emailDomain: b.emailDomain,
    logoUrl: b.logoUrl,
  };
}

/** Client-brand for a specific tenant (login screen / token routes). */
export async function resolveClientBrandForTenant(tenantId: string) {
  const b = await resolveBrandForTenant(tenantId);
  return {
    name: b.name,
    legalName: b.legalName,
    tagline: b.tagline,
    website: b.website,
    emailDomain: b.emailDomain,
    logoUrl: b.logoUrl,
  };
}
