/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
