import type { MetadataRoute } from "next";
import { resolveBrand } from "@/lib/branding";

// Dynamic PWA manifest (replaces the old static public/manifest.webmanifest).
// Served at /manifest.webmanifest and built from the brand config so the
// installed-app name, theme color, and description follow the white-label brand.
//
// force-dynamic so it's rendered per-request: this way it reflects BOTH the
// runtime env brand AND a live admin rebrand (BrandingSettings) without a
// rebuild — important since a statically-baked manifest would freeze whatever
// brand was set at build time. It's a tiny JSON response, so per-request render
// is cheap. Icon binaries are still swapped at deploy time (generating PWA icons
// from an uploaded logo is out of scope). theme_color tracks the brand accent;
// background_color matches the dark canvas (globals.css --c-paper).
export const dynamic = "force-dynamic";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const brand = await resolveBrand();

  return {
    name: `${brand.name} — ${brand.tagline}`,
    short_name: brand.name,
    description:
      "Your internal employee hub — projects, tasks, attendance, and tools in one place.",
    id: "/",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#181a1f",
    theme_color: brand.accentHex,
    categories: ["business", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icons/icon-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Dashboard",
        short_name: "Dashboard",
        url: "/dashboard",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "Tasks",
        short_name: "Tasks",
        url: "/tasks",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "Attendance",
        short_name: "Attendance",
        url: "/attendance",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
    ],
  };
}
