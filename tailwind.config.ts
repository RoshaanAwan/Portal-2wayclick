import type { Config } from "tailwindcss";

// Helper: a token whose value is an RGB-channel CSS variable, wrapped so that
// Tailwind's opacity modifiers (e.g. `bg-surface/70`, `ring-accent/25`) still
// work. Every color below resolves at runtime to whatever `--<var>` is set to
// for the active theme (see app/globals.css — :root = dark, [data-theme=light]).
const v = (name: string) => `rgb(var(${name}) / <alpha-value>)`;

const config: Config = {
  // Toggle themes via a `data-theme` attribute on <html>; `dark` is the default
  // (set in :root) so `dark:` variants are unnecessary — tokens re-theme below.
  darkMode: ["class", '[data-theme="dark"]'],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // ── Themeable palette ──────────────────────────────────────────────
        // Token NAMES are stable (paper/surface/ink/line/accent) so every page
        // re-themes from one place. Concrete values live as RGB channels in CSS
        // variables and swap between the dark (default) and light themes.

        // Surfaces.
        paper: v("--c-paper"), // app canvas (deepest)
        surface: v("--c-surface"), // cards / panels
        "surface-2": v("--c-surface-2"), // inset rows / wells / inputs

        // Text — primary through faint.
        ink: {
          DEFAULT: v("--c-ink"), // headings / primary
          700: v("--c-ink-700"), // body
          500: v("--c-ink-500"), // secondary
          400: v("--c-ink-400"), // muted
          300: v("--c-ink-300"), // faint / placeholder
        },

        // Hairlines & dividers.
        line: {
          DEFAULT: v("--c-line"), // standard border
          strong: v("--c-line-strong"), // emphasized border
        },

        // The single brand accent — warm orange/coral.
        accent: {
          DEFAULT: v("--c-accent"),
          600: v("--c-accent-600"),
          500: v("--c-accent-500"),
          400: v("--c-accent-400"),
          soft: v("--c-accent-soft"), // tinted fill for active/selected
          ink: v("--c-accent-ink"), // accent text on tinted fill
        },

        // Semantic status — base hues are shared; soft/ink tints re-theme.
        success: {
          DEFAULT: v("--c-success"),
          soft: v("--c-success-soft"),
          ink: v("--c-success-ink"),
        },
        warn: {
          DEFAULT: v("--c-warn"),
          soft: v("--c-warn-soft"),
          ink: v("--c-warn-ink"),
        },
        danger: {
          DEFAULT: v("--c-danger"),
          soft: v("--c-danger-soft"),
          ink: v("--c-danger-ink"),
        },
        info: {
          DEFAULT: v("--c-info"),
          soft: v("--c-info-soft"),
          ink: v("--c-info-ink"),
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "system-ui", "sans-serif"],
      },
      // iOS/PWA safe-area insets (notch, status bar, home indicator). Used as
      // `pt-safe-top`, `pb-safe-bottom`, etc. so chrome clears the notch when the
      // viewport is edge-to-edge (viewport-fit=cover). max() keeps a sane minimum
      // on devices with no inset.
      spacing: {
        "safe-top": "env(safe-area-inset-top)",
        "safe-bottom": "env(safe-area-inset-bottom)",
        "safe-left": "env(safe-area-inset-left)",
        "safe-right": "env(safe-area-inset-right)",
      },
      backgroundImage: {
        // Barely-there warm wash in the top corners of the canvas (per-theme).
        "paper-wash": "var(--paper-wash)",
        // Brand gradient for the logo mark / primary buttons. Built from the
        // accent tokens so it re-tints when the user picks a different accent.
        "accent-grad":
          "linear-gradient(135deg, rgb(var(--c-accent-400)) 0%, rgb(var(--c-accent-500)) 55%, rgb(var(--c-accent-600)) 100%)",
      },
      boxShadow: {
        // Flat design: depth tokens resolve to `none` via the CSS vars; only
        // overlays (shadow-pop) keep a single soft drop. Names are retained so
        // existing usages flatten without per-file edits.
        xs: "var(--shadow-xs)",
        card: "var(--shadow-card)",
        elevated: "var(--shadow-elevated)",
        pop: "var(--shadow-pop)",
        // Accent glow removed — kept as a no-op so `shadow-accent-glow` usages
        // render flat instead of breaking.
        "accent-glow": "none",
        "focus-ring": "0 0 0 3px rgb(var(--c-accent) / 0.25)",
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
