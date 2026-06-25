import { NextResponse, type NextRequest } from "next/server";

// ── Tenant resolution middleware ──────────────────────────────────────────────
// Parses the request Host into a tenant subdomain and forwards it downstream as
// `x-tenant-subdomain`. The authoritative subdomain→tenant DB resolve happens
// Node-side (lib/tenant.ts, lib/auth.ts) where Prisma is available; middleware
// only does the host parsing so every server entry point reads one header
// instead of re-parsing Host.
//
// Local dev: `acme.localhost:3000` (native) or `acme.lvh.me:3000`. Bare
// `localhost` / `127.0.0.1` and reserved labels (www/app/admin/api) carry no
// tenant → the platform/login context.
//
// NEXT_PUBLIC_PORTAL_DOMAIN is the base domain in prod (e.g. portal.example.com);
// the subdomain is everything left of it. In dev we fall back to treating the
// first dotted label as the subdomain.

const RESERVED = new Set(["www", "app", "admin", "api"]);

function subdomainFromHost(host: string): string | null {
  // Strip port.
  const hostname = host.split(":")[0].toLowerCase();

  // Bare local hosts → no tenant.
  if (hostname === "localhost" || hostname === "127.0.0.1") return null;

  const portalDomain = (process.env.NEXT_PUBLIC_PORTAL_DOMAIN ?? "")
    .split(":")[0]
    .toLowerCase();

  let label: string | null = null;
  if (portalDomain && hostname.endsWith(`.${portalDomain}`)) {
    // acme.portal.example.com → "acme"
    label = hostname.slice(0, -(portalDomain.length + 1)).split(".")[0] || null;
  } else {
    // Dev / no configured domain: first label, but only if there's more than one
    // (so bare `lvh.me` or `localhost` doesn't become a tenant).
    const parts = hostname.split(".");
    if (parts.length > 1) label = parts[0];
  }

  if (!label || RESERVED.has(label)) return null;
  return label;
}

export function middleware(req: NextRequest) {
  const host = req.headers.get("host") ?? "";
  const subdomain = subdomainFromHost(host);

  const requestHeaders = new Headers(req.headers);
  if (subdomain) {
    requestHeaders.set("x-tenant-subdomain", subdomain);
  } else {
    requestHeaders.delete("x-tenant-subdomain");
  }
  // Forward the request path so server layouts can make path-aware decisions
  // (e.g. the trial-lapsed gate must let /billing through so the tenant can
  // actually subscribe). Layouts otherwise can't read the pathname.
  requestHeaders.set("x-pathname", req.nextUrl.pathname);

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  // Run on app routes; skip Next internals and static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons/|sw.js).*)"],
};
