import { cn } from "@/lib/utils";

// The 2WayClick brand mark. The image already carries its own gradient + glow,
// so it renders bare (no colored chip behind it). Drop the asset at
// public/logo.png; sized via the `size` prop to match each brand spot.

// The trimmed mark is portrait (~0.78:1), so size by height and let width auto —
// this keeps the glyph as large as possible without distortion or letterboxing.
const sizes = {
  sm: "h-9 w-auto", // sidebar
  md: "h-10 w-auto", // login hero
  lg: "h-14 w-auto", // login form (mobile)
};

export function Logo({
  size = "sm",
  className,
}: {
  size?: keyof typeof sizes;
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logo.png"
      alt="2WayClick"
      className={cn("object-contain", sizes[size], className)}
    />
  );
}
