/** @type {import('next').NextConfig} */
const nextConfig = {
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
