import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // ── "Metric Flow" dark palette ─────────────────────────────────────
        // Near-black blue-charcoal canvas, dark card surfaces, a single warm
        // orange accent. Status greens/reds for deltas. Token NAMES are kept
        // stable (paper/surface/ink/line/accent) so every page re-themes here.

        // Surfaces.
        paper: "#0d0d11", // app canvas (deepest)
        surface: "#17171c", // cards / panels
        "surface-2": "#1e1e24", // inset rows / wells / inputs

        // Text — white through cool greys.
        ink: {
          DEFAULT: "#f4f4f6", // headings / primary
          700: "#d4d4da", // body
          500: "#9a9aa5", // secondary
          400: "#74747f", // muted
          300: "#56565f", // faint / placeholder
        },

        // Hairlines & dividers (subtle on dark).
        line: {
          DEFAULT: "#26262d", // standard border
          strong: "#34343c", // emphasized border
        },

        // The single brand accent — warm orange/coral.
        accent: {
          DEFAULT: "#f5683f",
          600: "#e8542c",
          500: "#f5683f",
          400: "#ff8159",
          soft: "#2a1a16", // tinted fill for active/selected (dark)
          ink: "#ff8159", // accent text on tinted fill
        },

        // Semantic status.
        success: { DEFAULT: "#34d399", soft: "#10261f", ink: "#4ade80" },
        warn: { DEFAULT: "#fbbf24", soft: "#2a2110", ink: "#fcd34d" },
        danger: { DEFAULT: "#f87171", soft: "#2a1518", ink: "#fca5a5" },
        info: { DEFAULT: "#60a5fa", soft: "#121d2e", ink: "#93c5fd" },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "system-ui", "sans-serif"],
      },
      backgroundImage: {
        // Barely-there warm wash in the top corners of the dark canvas.
        "paper-wash":
          "radial-gradient(at 0% 0%, rgba(245,104,63,0.10) 0px, transparent 42%), radial-gradient(at 100% 0%, rgba(245,104,63,0.05) 0px, transparent 38%)",
        // Brand gradient for the logo mark / primary buttons.
        "accent-grad": "linear-gradient(135deg, #ff8159 0%, #f5683f 55%, #e8542c 100%)",
      },
      boxShadow: {
        // Soft shadows tuned for dark surfaces (low, diffuse).
        xs: "0 1px 2px 0 rgba(0,0,0,0.4)",
        card: "0 1px 2px rgba(0,0,0,0.35), 0 1px 3px rgba(0,0,0,0.3)",
        elevated: "0 1px 2px rgba(0,0,0,0.4), 0 10px 30px -10px rgba(0,0,0,0.6)",
        pop: "0 16px 40px -12px rgba(0,0,0,0.7), 0 2px 8px rgba(0,0,0,0.5)",
        "accent-glow": "0 8px 22px -6px rgba(245,104,63,0.5)",
        "focus-ring": "0 0 0 3px rgba(245,104,63,0.25)",
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-10px)" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
      },
      animation: {
        float: "float 7s ease-in-out infinite",
        shimmer: "shimmer 2s infinite",
      },
    },
  },
  plugins: [],
};

export default config;
