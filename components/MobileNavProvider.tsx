"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { usePathname } from "next/navigation";

interface MobileNavContextValue {
  open: boolean;
  openNav: () => void;
  closeNav: () => void;
  toggleNav: () => void;
}

const MobileNavContext = createContext<MobileNavContextValue | null>(null);

/**
 * Coordinates the mobile navigation drawer. The Topbar's hamburger lives in one
 * subtree and the Sidebar drawer in another, so they share open/closed state
 * through this context rather than prop-drilling across the layout.
 *
 * Closes itself automatically on route change (so tapping a nav link dismisses
 * the drawer) and locks body scroll while open so the page behind doesn't move.
 */
export function MobileNavProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  const openNav = useCallback(() => setOpen(true), []);
  const closeNav = useCallback(() => setOpen(false), []);
  const toggleNav = useCallback(() => setOpen((o) => !o), []);

  // Dismiss the drawer whenever the route changes (link tap, back/forward).
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Lock the underlying page scroll while the drawer is open, and let Escape
  // close it for keyboard/a11y parity with the click-on-backdrop dismiss.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <MobileNavContext.Provider value={{ open, openNav, closeNav, toggleNav }}>
      {children}
    </MobileNavContext.Provider>
  );
}

export function useMobileNav() {
  const ctx = useContext(MobileNavContext);
  if (!ctx)
    throw new Error("useMobileNav must be used within a MobileNavProvider");
  return ctx;
}
