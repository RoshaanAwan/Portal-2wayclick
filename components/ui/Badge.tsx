import { cn } from "@/lib/utils";

type Variant = "accent" | "cyan" | "pink" | "emerald" | "neutral" | "amber" | "red";

// Variant names are kept for backward compatibility with callers, but the
// palette is now the calm, editorial set: tinted fill + readable ink + hairline.
const variants: Record<Variant, string> = {
  accent: "bg-accent-soft text-accent-ink border-accent/15",
  cyan: "bg-info-soft text-info-ink border-info/15",
  pink: "bg-accent-soft text-accent-ink border-accent/15",
  emerald: "bg-success-soft text-success-ink border-success/15",
  amber: "bg-warn-soft text-warn-ink border-warn/20",
  red: "bg-danger-soft text-danger-ink border-danger/15",
  neutral: "bg-surface-2 text-ink-500 border-line",
};

export function Badge({
  children,
  variant = "neutral",
  className,
}: {
  children: React.ReactNode;
  variant?: Variant;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        variants[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
