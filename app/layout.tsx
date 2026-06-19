import type { Metadata, Viewport } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { AnimatedBackground } from "@/components/AnimatedBackground";
import { ThemeProvider, themeInitScript } from "@/components/ThemeProvider";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

// Display face — modern geometric. Used for headings, KPIs, and brand.
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  // Base for resolving relative metadata URLs to absolute ones. Prefers an
  // explicit site URL, then Vercel's auto-injected deployment host, else local.
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ??
      (process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "http://localhost:3000"),
  ),
  applicationName: "2WayClick",
  title: "2WayClick — Company Portal",
  description: "Your immersive internal employee hub.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icons/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/icons/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  // iOS standalone (Add to Home Screen) presentation.
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "2WayClick",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  // Essential for mobile responsiveness — without this the page renders at
  // desktop width on phones and ignores the responsive breakpoints.
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // OS browser/status-bar chrome tint — matched to each theme's canvas color
  // (see globals.css: dark #181a1f, light #f4f5f7).
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#181a1f" },
    { media: "(prefers-color-scheme: light)", color: "#f4f5f7" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      // Default to dark for SSR; the inline script below corrects it before
      // paint based on the saved/OS preference, so there's no theme flash.
      data-theme="dark"
      suppressHydrationWarning
      className={`${inter.variable} ${spaceGrotesk.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <ThemeProvider>
          <AnimatedBackground />
          {children}
        </ThemeProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
