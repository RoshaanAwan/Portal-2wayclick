"use client";

import { motion, type HTMLMotionProps } from "framer-motion";
import { forwardRef } from "react";
import { stagger, riseItem, popItem, fadeItem } from "@/lib/motion";

type ItemVariant = "rise" | "pop" | "fade";
const ITEM = { rise: riseItem, pop: popItem, fade: fadeItem };

/**
 * Stagger container — animates children in sequence on mount (or in-view).
 * Wrap a group; mark each child with <RevealItem>.
 */
export const Reveal = forwardRef<
  HTMLDivElement,
  HTMLMotionProps<"div"> & { gap?: number; delay?: number; inView?: boolean }
>(function Reveal({ gap = 0.06, delay = 0, inView = false, ...props }, ref) {
  const trigger = inView
    ? { whileInView: "show", viewport: { once: true, margin: "-60px" } }
    : { animate: "show" };
  return (
    <motion.div
      ref={ref}
      initial="hidden"
      variants={stagger(gap, delay)}
      {...trigger}
      {...props}
    />
  );
});

/** A single staggered child. */
export const RevealItem = forwardRef<
  HTMLDivElement,
  HTMLMotionProps<"div"> & { variant?: ItemVariant }
>(function RevealItem({ variant = "rise", ...props }, ref) {
  return <motion.div ref={ref} variants={ITEM[variant]} {...props} />;
});
