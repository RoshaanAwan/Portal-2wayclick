"use client";

import { motion, type HTMLMotionProps } from "framer-motion";
import { cn } from "@/lib/utils";
import { forwardRef } from "react";

interface GlassCardProps extends HTMLMotionProps<"div"> {
  glow?: boolean;
  strong?: boolean;
  hover?: boolean;
  /**
   * Deprecated. The cursor-tracking accent glow was part of the soft-UI look
   * and has been removed in the flat design. Accepted but ignored so existing
   * usages keep compiling.
   */
  spotlight?: boolean;
}

export const GlassCard = forwardRef<HTMLDivElement, GlassCardProps>(
  (
    { className, glow, strong, hover = true, spotlight: _spotlight, children, ...props },
    ref,
  ) => {
    return (
      <motion.div
        ref={ref}
        className={cn(
          "relative overflow-hidden rounded-2xl border border-line bg-surface p-5",
          hover && "glass-hover",
          glow && "glow-ring",
          className,
        )}
        {...props}
      >
        {children as React.ReactNode}
      </motion.div>
    );
  },
);
GlassCard.displayName = "GlassCard";
