"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

export type Theme = "dark" | "light";
/** Accent keys mirror the swatches in Settings → Appearance. */
export type Accent = "orange" | "violet" | "blue" | "emerald";

const STORAGE_KEY = "2wc-theme";
const ACCENT_KEY = "2wc-accent";
const MOTION_KEY = "2wc-reduce-motion";

const DEFAULT_ACCENT: Accent = "orange";
const ACCENTS: Accent[] = ["orange", "violet", "blue", "emerald"];

interface ThemeContextValue {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
  accent: Accent;
  setAccent: (a: Accent) => void;
  reducedMotion: boolean;
  setReducedMotion: (v: boolean) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Reads the appearance prefs the no-flash script already applied to <html>
 * (data-theme / data-accent / data-reduce-motion), keeps React state in sync,
 * and persists changes to localStorage. Defaults to dark + coral, motion on.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("dark");
  const [accent, setAccentState] = useState<Accent>(DEFAULT_ACCENT);
  const [reducedMotion, setReducedMotionState] = useState(false);

  // Hydrate from whatever the inline script set on <html> (avoids a flash and
  // keeps SSR/CSR consistent — the attributes are the source of truth on load).
  useEffect(() => {
    const el = document.documentElement;
    setThemeState((el.getAttribute("data-theme") as Theme | null) ?? "dark");
    const a = el.getAttribute("data-accent") as Accent | null;
    setAccentState(a && ACCENTS.includes(a) ? a : DEFAULT_ACCENT);
    setReducedMotionState(el.getAttribute("data-reduce-motion") === "1");
  }, []);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    document.documentElement.setAttribute("data-theme", t);
    try {
      localStorage.setItem(STORAGE_KEY, t);
    } catch {
      /* storage may be unavailable (private mode) — non-fatal */
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [theme, setTheme]);

  const setAccent = useCallback((a: Accent) => {
    setAccentState(a);
    document.documentElement.setAttribute("data-accent", a);
    try {
      localStorage.setItem(ACCENT_KEY, a);
    } catch {
      /* non-fatal */
    }
  }, []);

  const setReducedMotion = useCallback((v: boolean) => {
    setReducedMotionState(v);
    // Attribute drives a CSS block that kills transitions/animations app-wide.
    if (v) document.documentElement.setAttribute("data-reduce-motion", "1");
    else document.documentElement.removeAttribute("data-reduce-motion");
    try {
      localStorage.setItem(MOTION_KEY, v ? "1" : "0");
    } catch {
      /* non-fatal */
    }
  }, []);

  return (
    <ThemeContext.Provider
      value={{
        theme,
        setTheme,
        toggleTheme,
        accent,
        setAccent,
        reducedMotion,
        setReducedMotion,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}

/**
 * Resolves the live value of an accent CSS variable to a concrete `rgb(...)`
 * string for SVG/canvas consumers (recharts, the focus-ring circle) that can't
 * use Tailwind `accent` classes. Recomputes whenever the accent or theme
 * changes so charts re-tint with the rest of the app.
 *
 * @param token one of the accent CSS vars, e.g. "--c-accent", "--c-accent-400"
 * @param alpha optional 0–1 opacity
 */
export function useAccentColor(token = "--c-accent", alpha?: number): string {
  const { accent, theme } = useTheme();
  const [color, setColor] = useState("rgb(245 104 63)");

  useEffect(() => {
    const rgb = getComputedStyle(document.documentElement)
      .getPropertyValue(token)
      .trim();
    if (rgb) {
      setColor(alpha == null ? `rgb(${rgb})` : `rgb(${rgb} / ${alpha})`);
    }
    // accent & theme are the inputs that change the resolved value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accent, theme, token, alpha]);

  return color;
}

/**
 * Inline script injected in <head> before paint. Applies the saved theme,
 * accent, and reduce-motion prefs to <html> so there's no flash of the wrong
 * appearance on first load. Kept tiny and dependency-free on purpose.
 */
export const themeInitScript = `(function(){try{var d=document.documentElement;var t=localStorage.getItem(${JSON.stringify(
  STORAGE_KEY,
)});if(t!=="dark"&&t!=="light"){t=window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark";}d.setAttribute("data-theme",t);var a=localStorage.getItem(${JSON.stringify(
  ACCENT_KEY,
)});if(${JSON.stringify(
  ACCENTS,
)}.indexOf(a)===-1){a=${JSON.stringify(
  DEFAULT_ACCENT,
)};}d.setAttribute("data-accent",a);if(localStorage.getItem(${JSON.stringify(
  MOTION_KEY,
)})==="1"){d.setAttribute("data-reduce-motion","1");}}catch(e){document.documentElement.setAttribute("data-theme","dark");document.documentElement.setAttribute("data-accent",${JSON.stringify(
  DEFAULT_ACCENT,
)});}})();`;
