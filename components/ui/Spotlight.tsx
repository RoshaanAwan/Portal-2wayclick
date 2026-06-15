"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Pointer-tracking spotlight overlay. Drop inside a `relative` container;
 * a soft radial accent glow follows the cursor and fades when it leaves.
 * Listens on the parent element so it never intercepts clicks
 * (pointer-events:none) — safe inside links and buttons.
 */
export function Spotlight({
  className,
  color = "rgba(245,104,63,0.16)",
  size = 320,
}: {
  className?: string;
  color?: string;
  size?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [on, setOn] = useState(false);

  useEffect(() => {
    const parent = ref.current?.parentElement;
    if (!parent) return;
    const move = (e: MouseEvent) => {
      const r = parent.getBoundingClientRect();
      setPos({ x: e.clientX - r.left, y: e.clientY - r.top });
    };
    const enter = () => setOn(true);
    const leave = () => setOn(false);
    parent.addEventListener("mousemove", move);
    parent.addEventListener("mouseenter", enter);
    parent.addEventListener("mouseleave", leave);
    return () => {
      parent.removeEventListener("mousemove", move);
      parent.removeEventListener("mouseenter", enter);
      parent.removeEventListener("mouseleave", leave);
    };
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0 z-0 transition-opacity duration-300",
        on ? "opacity-100" : "opacity-0",
        className,
      )}
      style={{
        background: `radial-gradient(${size}px circle at ${pos.x}px ${pos.y}px, ${color}, transparent 70%)`,
      }}
    />
  );
}
