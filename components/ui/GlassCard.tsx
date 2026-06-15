"use client";

import { motion, type HTMLMotionProps } from "framer-motion";
import { cn } from "@/lib/utils";
import { forwardRef } from "react";
import { Spotlight } from "./Spotlight";

interface GlassCardProps extends HTMLMotionProps<"div"> {
  glow?: boolean;
  strong?: boolean;
  hover?: boolean;
  /** Pointer-tracking accent glow that follows the cursor. */
  spotlight?: boolean;
}

export const GlassCard = forwardRef<HTMLDivElement, GlassCardProps>(
  (
    { className, glow, strong, hover = true, spotlight, children, ...props },
    ref,
  ) => {
    return (
      <motion.div
        ref={ref}
        className={cn(
          "relative overflow-hidden rounded-2xl p-5",
          strong ? "glass-strong" : "glass",
          hover && "glass-hover",
          glow && "glow-ring",
          className,
        )}
        {...props}
      >
        {spotlight ? <Spotlight /> : null}
        {children as React.ReactNode}
      </motion.div>
    );
  },
);
GlassCard.displayName = "GlassCard";
