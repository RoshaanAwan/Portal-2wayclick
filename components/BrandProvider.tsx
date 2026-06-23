"use client";

import { createContext, useContext } from "react";

// ── Client brand context ──────────────────────────────────────────────────────
// Client components (Sidebar, Topbar, login screens, settings copy) need the
// resolved brand (which may come from the DB, not just NEXT_PUBLIC_* env). A
// server component resolves it once (resolveBrand) and seeds this provider; any
// client descendant reads it via useBrand(). This avoids prop-drilling the brand
// through unrelated component APIs.
//
// Only the user-facing display fields are exposed here — never secrets.

export interface ClientBrand {
  name: string;
  legalName: string;
  tagline: string;
  website: string;
  emailDomain: string;
  logoUrl: string | null;
}

const FALLBACK: ClientBrand = {
  name: "2WayClick",
  legalName: "2WayClick",
  tagline: "Company Portal",
  website: "2wayclick.com",
  emailDomain: "2wayclick.com",
  logoUrl: null,
};

const BrandContext = createContext<ClientBrand>(FALLBACK);

export function BrandProvider({
  brand,
  children,
}: {
  brand: ClientBrand;
  children: React.ReactNode;
}) {
  return <BrandContext.Provider value={brand}>{children}</BrandContext.Provider>;
}

/** Read the resolved brand in any client component. */
export function useBrand(): ClientBrand {
  return useContext(BrandContext);
}
