"use client";

import { useEffect, useRef, useState } from "react";
import { useInView, useMotionValue, animate } from "framer-motion";
import { EASE } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * Animated number that counts up when scrolled into view.
 * Supports prefix/suffix and locale grouping for large figures.
 */
export function CountUp({
  value,
  duration = 1.2,
  prefix = "",
  suffix = "",
  decimals = 0,
  className,
}: {
  value: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const mv = useMotionValue(0);
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!inView) return;
    const controls = animate(mv, value, {
      duration,
      ease: EASE,
      onUpdate: (v) => setDisplay(v),
    });
    return controls.stop;
  }, [inView, value, mv, duration]);

  const formatted = display.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  return (
    <span ref={ref} className={cn("nums", className)}>
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
}
