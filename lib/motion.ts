import type { Variants, Transition } from "framer-motion";

// ── Shared motion language ────────────────────────────────────────────────
// A small, consistent vocabulary so every page animates the same way.
// Premium feel = soft, slightly-overshooting easing + short, confident timing.

/** Signature ease — gentle ease-out with a hair of authority. */
export const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

/** Spring used for hover lifts and layout pills. */
export const SPRING: Transition = {
  type: "spring",
  stiffness: 380,
  damping: 30,
  mass: 0.6,
};

/** Container that staggers its children in. */
export const stagger = (gap = 0.06, delay = 0): Variants => ({
  hidden: {},
  show: {
    transition: { staggerChildren: gap, delayChildren: delay },
  },
});

/** Child item: rise + fade. */
export const riseItem: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } },
};

/** Child item: fade only (for text-heavy blocks). */
export const fadeItem: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.5, ease: EASE } },
};

/** Child item: scale-in (for tiles / badges). */
export const popItem: Variants = {
  hidden: { opacity: 0, y: 12, scale: 0.98 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.45, ease: EASE },
  },
};

/** One-off rise used directly on a motion element. */
export const rise = (delay = 0) => ({
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5, ease: EASE, delay },
});
