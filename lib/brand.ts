// ── Brand config (env layer) ─────────────────────────────────────────────────
// White-label source of truth, level 1 of 2. This module reads brand identity
// from env vars with sensible 2WayClick defaults, so a fresh deploy (or any code
// path that runs before a DB row exists — server boot, the seed, push/VAPID
// fallbacks) always has a usable value.
//
// Level 2 is the optional `BrandingSettings` DB row (see lib/branding.ts), which
// an Admin can edit at runtime; `resolveBrand()` there merges the DB row on top
// of these env defaults. For anything that needs the *live* brand, prefer
// `resolveBrand()`; import `BRAND` directly only where a DB read is impossible
// or undesirable (client components, the seed, low-level fallbacks).
//
// Client-readable fields use NEXT_PUBLIC_* so they're inlined into the browser
// bundle at build time (same pattern as lib/features.ts). Server-only values
// (raw accent hex used to derive CSS vars, invoice accent) are plain env vars.

export interface Brand {
  /** Display name shown throughout the UI ("Acme", "2WayClick"). */
  name: string;
  /** Legal entity for copyright lines; falls back to `name`. */
  legalName: string;
  /** Short descriptor under the name (e.g. "Company Portal"). */
  tagline: string;
  /** Public website, shown on invoices ("acme.com"). */
  website: string;
  /** Email domain for placeholders / contact fallbacks ("acme.com"). */
  emailDomain: string;
  /** Theme accent as #rrggbb; drives the live --c-accent* CSS vars. */
  accentHex: string;
  /** Invoice accent (#rrggbb). Static & print-safe — NOT the live theme var. */
  invoiceAccent: string;
  /** Optional uploaded/hosted logo image URL; null = use the built-in SVG mark. */
  logoUrl: string | null;
}

export const BRAND: Brand = {
  name: process.env.NEXT_PUBLIC_BRAND_NAME ?? "2WayClick",
  legalName:
    process.env.NEXT_PUBLIC_BRAND_LEGAL ??
    process.env.NEXT_PUBLIC_BRAND_NAME ??
    "2WayClick",
  tagline: process.env.NEXT_PUBLIC_BRAND_TAGLINE ?? "Company Portal",
  website: process.env.NEXT_PUBLIC_BRAND_WEBSITE ?? "2wayclick.com",
  emailDomain: process.env.NEXT_PUBLIC_BRAND_EMAIL_DOMAIN ?? "2wayclick.com",
  accentHex: process.env.BRAND_ACCENT_HEX ?? "#f5683f",
  invoiceAccent:
    process.env.BRAND_INVOICE_ACCENT ?? process.env.BRAND_ACCENT_HEX ?? "#f5683f",
  logoUrl: process.env.NEXT_PUBLIC_BRAND_LOGO_URL || null,
};

// ── Title helper ──────────────────────────────────────────────────────────────
// One place that owns the page-title format. Replaces the ad-hoc
// "<Page> — 2WayClick" / "Tools · 2WayClick" / bare-title strings scattered
// across page metadata so the brand name and separator (em-dash) are consistent.
export const pageTitle = (page: string, name: string = BRAND.name): string =>
  `${page} — ${name}`;

// ── Color helpers ─────────────────────────────────────────────────────────────
// The theme stores colors as space-separated RGB channels ("245 104 63") so
// Tailwind's `rgb(var(--c-x) / <alpha-value>)` opacity modifiers work. These
// helpers convert a brand hex into that format and derive the full --c-accent*
// ramp from a single base, mirroring the hand-tuned coral relationships in
// app/globals.css (600 ≈ -8% L, 400 ≈ +12% L, soft/ink tuned per theme).

type Rgb = { r: number; g: number; b: number };

function clamp255(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

/** Parse "#rrggbb" (or "#rgb") to {r,g,b}; falls back to the coral default. */
export function hexToRgb(hex: string): Rgb {
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return { r: 245, g: 104, b: 63 }; // #f5683f
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

/** "#f5683f" → "245 104 63" — the space-separated form CSS vars expect. */
export function hexToRgbTriplet(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  return `${r} ${g} ${b}`;
}

/** Mix two colors by `amount` (0 = a, 1 = b). Used to lighten toward white. */
function mix(a: Rgb, b: Rgb, amount: number): Rgb {
  return {
    r: a.r + (b.r - a.r) * amount,
    g: a.g + (b.g - a.g) * amount,
    b: a.b + (b.b - a.b) * amount,
  };
}

function tripletOf({ r, g, b }: Rgb): string {
  return `${clamp255(r)} ${clamp255(g)} ${clamp255(b)}`;
}

const WHITE: Rgb = { r: 255, g: 255, b: 255 };
const BLACK: Rgb = { r: 0, g: 0, b: 0 };

/**
 * Derives the six accent CSS-variable values (as RGB triplets) from a single
 * brand hex, for both themes. Injected as a server-side <style> in <head> so the
 * brand accent is the default with no flash (see app/layout.tsx). Per-user
 * preset accents still override via the [data-accent="…"] blocks in globals.css.
 *
 * The ramp matches the coral defaults' character:
 *   600  = base darkened ~16% (toward black)
 *   500  = base
 *   400  = base lightened ~22% (toward white)
 *   soft = a faint tint of base on the canvas (dark: very dark, light: very light)
 *   ink  = readable accent text on `soft` (dark: light tint, light: dark tint)
 */
export function accentVars(
  hex: string,
): Record<"dark" | "light", Record<string, string>> {
  const base = hexToRgb(hex);
  const v600 = mix(base, BLACK, 0.16);
  const v400 = mix(base, WHITE, 0.22);

  return {
    dark: {
      "--c-accent": tripletOf(base),
      "--c-accent-600": tripletOf(v600),
      "--c-accent-500": tripletOf(base),
      "--c-accent-400": tripletOf(v400),
      // Deep, desaturated tint of the accent for selected/active fills.
      "--c-accent-soft": tripletOf(mix(base, { r: 20, g: 22, b: 26 }, 0.86)),
      // Light tint reads as accent text on the dark soft fill.
      "--c-accent-ink": tripletOf(v400),
    },
    light: {
      "--c-accent": tripletOf(mix(base, BLACK, 0.05)),
      "--c-accent-600": tripletOf(mix(base, BLACK, 0.2)),
      "--c-accent-500": tripletOf(base),
      "--c-accent-400": tripletOf(v400),
      // Pale wash of the accent on the light canvas.
      "--c-accent-soft": tripletOf(mix(base, WHITE, 0.84)),
      // Darkened accent reads as text on the pale soft fill.
      "--c-accent-ink": tripletOf(mix(base, BLACK, 0.28)),
    },
  };
}

/**
 * Builds the CSS injected into <head> to set the brand accent as the default for
 * both themes, ahead of paint (no FOUC). Scoped to `:not([data-accent])` so the
 * brand default applies ONLY when the user hasn't picked a preset: a per-user
 * preset (the `[data-accent="violet|blue|emerald"]` blocks in globals.css) then
 * always wins by higher specificity, regardless of stylesheet source order. The
 * default coral preset (no data-accent) falls through to this brand block.
 */
export function brandAccentStyle(hex: string): string {
  const vars = accentVars(hex);
  const toBlock = (rec: Record<string, string>) =>
    Object.entries(rec)
      .map(([k, val]) => `${k}:${val}`)
      .join(";");
  return (
    `:root:not([data-accent]){${toBlock(vars.dark)}}` +
    `[data-theme="light"]:not([data-accent]){${toBlock(vars.light)}}`
  );
}
