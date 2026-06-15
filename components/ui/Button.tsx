"use client";

import { cn } from "@/lib/utils";
import { forwardRef } from "react";

type Variant = "primary" | "ghost" | "glass" | "danger";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const variants: Record<Variant, string> = {
  // Primary — confident warm gradient that reads as a raised soft-UI key. Lifts
  // slightly and brightens on hover; depresses on press.
  primary:
    "shine bg-accent-grad text-white shadow-accent-glow hover:-translate-y-0.5 hover:brightness-[1.05] active:translate-y-0 active:brightness-95",
  // Glass → neumorphic "secondary": a raised surface chip that presses in on click.
  glass: "nm-button text-ink-700 hover:text-ink",
  // Ghost — quiet, text-only.
  ghost: "hover-surface text-ink-500 hover:text-ink",
  // Danger.
  danger:
    "bg-danger text-white shadow-accent-glow hover:brightness-[1.06] active:brightness-95",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-[15px]",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", loading, children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          "relative inline-flex items-center justify-center gap-2 rounded-xl font-medium outline-none transition-[transform,box-shadow,background-color,filter] duration-200 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.97]",
          variants[variant],
          sizes[size],
          className,
        )}
        {...props}
      >
        {loading && (
          <span className="relative z-[1] h-4 w-4 animate-spin rounded-full border-2 border-current/30 border-t-current" />
        )}
        <span className="relative z-[1] inline-flex items-center gap-2">
          {children}
        </span>
      </button>
    );
  },
);
Button.displayName = "Button";
