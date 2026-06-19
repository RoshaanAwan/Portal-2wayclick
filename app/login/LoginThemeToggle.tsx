"use client";

import { ThemeToggle } from "@/components/ThemeToggle";

/**
 * Floating theme switch for the login screen. Pinned to the top-right corner,
 * where it always sits over the form panel (bg-paper) — so the toggle's ink
 * colors read correctly regardless of which side the hero gradient is on.
 *
 * Wrapped in a bordered surface chip so it reads as an intentional control on
 * the otherwise empty corner. The inner ThemeToggle is the same component the
 * app topbar uses, so behavior and the sun/moon crossfade stay consistent.
 */
export function LoginThemeToggle() {
  return (
    <div className="fixed right-4 top-4 z-20 sm:right-6 sm:top-6">
      <div className="glass flex items-center rounded-xl p-0.5 shadow-card">
        <ThemeToggle />
      </div>
    </div>
  );
}
