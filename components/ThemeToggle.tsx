"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/ThemeProvider";

/**
 * Compact theme switch for the topbar — an icon button that crossfades between
 * sun (light) and moon (dark) and flips the active theme on click.
 */
export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isLight = theme === "light";

  return (
    <button
      onClick={toggleTheme}
      aria-label={isLight ? "Switch to dark mode" : "Switch to light mode"}
      title={isLight ? "Switch to dark mode" : "Switch to light mode"}
      className="hover-surface relative grid h-9 w-9 place-items-center overflow-hidden rounded-xl text-ink-400 transition hover:text-ink-700"
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={theme}
          initial={{ y: 14, opacity: 0, rotate: -30 }}
          animate={{ y: 0, opacity: 1, rotate: 0 }}
          exit={{ y: -14, opacity: 0, rotate: 30 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="absolute inset-0 grid place-items-center"
        >
          {isLight ? (
            <Sun className="h-[18px] w-[18px]" />
          ) : (
            <Moon className="h-[18px] w-[18px]" />
          )}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}
