// ── Security headers ──────────────────────────────────────────────────────────
// Applied to every response (see headers() below). The CSP is a defence-in-depth
// backstop: the app renders two inline tags in <head> (the accent <style> and the
// theme-init <script>, both server-controlled and already sanitized), and Next's
// client runtime also injects inline bootstrap script, so script/style-src must
// allow 'unsafe-inline'. We still lock down the high-value directives that don't
// depend on inline content — framing, plugins, <base>, and form targets — so a
// stored-XSS regression can't be trivially weaponised into clickjacking, data
// exfiltration to an attacker origin, or a <base href> hijack.
//
// img-src mirrors next.config images.remotePatterns (pravatar/unsplash) plus
// Vercel Blob (uploaded logos/avatars) and data: URLs (inline logo fallback).
// React's dev runtime uses eval() for debugging features (callstack
// reconstruction, Fast Refresh); without 'unsafe-eval' the dev server logs CSP
// errors and loses those features. Production React never uses eval(), so the
// allowance is scoped to development only and never weakens the prod policy.
const devEval = process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'";

const cspDirectives = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${devEval}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://i.pravatar.cc https://images.unsplash.com https://*.public.blob.vercel-storage.com",
  "font-src 'self' data:",
  // connect-src: the app's own origin for API/SSE/polling. External provider APIs
  // (GitHub/Slack/Google) are called server-side, so the browser never connects
  // to them directly and they are deliberately NOT listed here.
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: cspDirectives },
  // Belt-and-suspenders with CSP frame-ancestors for older browsers.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Drop powerful features the app doesn't use, so a compromised script can't.
  {
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(), geolocation=(), payment=()",
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  reactStrictMode: true,
  // Skip tsc and eslint during `next build` — OOMs the 512MB droplet.
  // Type safety is enforced in the editor and can be run separately via tsc.
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  images: {
    // Modern formats first — AVIF/WebP are much smaller than JPEG/PNG.
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      { protocol: "https", hostname: "i.pravatar.cc" },
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
  },
  // Tree-shake big icon/chart libraries: import only the symbols actually used
  // instead of the whole barrel. Cuts bundle size and speeds up cold compiles.
  experimental: {
    optimizePackageImports: ["lucide-react", "recharts", "framer-motion"],
  },
};

export default nextConfig;
