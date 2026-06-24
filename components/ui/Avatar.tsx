"use client";

import React from "react";
import { cn, initials } from "@/lib/utils";

interface AvatarProps {
  name: string;
  src?: string | null;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  ring?: boolean;
  className?: string;
}

const sizes = {
  xs: "h-6 w-6 text-[10px]",
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-14 w-14 text-base",
  xl: "h-20 w-20 text-xl",
};

export function Avatar({ name, src, size = "md", ring, className }: AvatarProps) {
  const [imageError, setImageError] = React.useState(false);
  const showImage = src && !imageError;

  return (
    <div
      className={cn(
        "relative shrink-0 rounded-full overflow-hidden grid place-items-center font-semibold",
        "bg-accent-soft text-accent-ink ring-1 ring-inset ring-accent/15",
        ring && "ring-2 ring-accent/30 ring-offset-2 ring-offset-surface",
        sizes[size],
        className,
      )}
      title={name}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={name}
          className="h-full w-full object-cover"
          onError={() => setImageError(true)}
        />
      ) : (
        <span>{initials(name)}</span>
      )}
    </div>
  );
}
