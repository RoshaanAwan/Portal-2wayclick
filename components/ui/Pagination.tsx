"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

// Shared numbered pagination control. Page state is owned by the caller (which
// typically mirrors it to the URL so the server can fetch the right slice).
// Renders nothing when there's a single page so callers can drop it in
// unconditionally.

export function Pagination({
  page,
  pageCount,
  onPage,
  disabled,
  className,
}: {
  page: number;
  pageCount: number;
  onPage: (page: number) => void;
  disabled?: boolean;
  className?: string;
}) {
  if (pageCount <= 1) return null;
  const pages = pageRange(page, pageCount);

  return (
    <nav
      className={cn("flex items-center justify-center gap-1.5", className)}
      aria-label="Pagination"
    >
      <PageButton
        disabled={disabled || page <= 1}
        onClick={() => onPage(page - 1)}
        aria-label="Previous page"
      >
        <ChevronLeft className="h-4 w-4" />
      </PageButton>

      {pages.map((p, i) =>
        p === "…" ? (
          <span
            key={`gap-${i}`}
            className="select-none px-1.5 text-sm text-ink-400"
          >
            …
          </span>
        ) : (
          <PageButton
            key={p}
            disabled={disabled}
            active={p === page}
            onClick={() => onPage(p)}
            aria-label={`Page ${p}`}
            aria-current={p === page ? "page" : undefined}
          >
            {p}
          </PageButton>
        ),
      )}

      <PageButton
        disabled={disabled || page >= pageCount}
        onClick={() => onPage(page + 1)}
        aria-label="Next page"
      >
        <ChevronRight className="h-4 w-4" />
      </PageButton>
    </nav>
  );
}

function PageButton({
  active,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        "grid h-9 min-w-9 place-items-center rounded-lg px-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        active
          ? "bg-accent-grad text-white"
          : "nm-button text-ink-700 hover:text-ink",
        className,
      )}
      {...props}
    />
  );
}

// Compact page list with leading/trailing ellipses: 1 … 4 5 [6] 7 8 … 20.
function pageRange(current: number, count: number): (number | "…")[] {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i + 1);
  const out: (number | "…")[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(count - 1, current + 1);
  if (start > 2) out.push("…");
  for (let p = start; p <= end; p++) out.push(p);
  if (end < count - 1) out.push("…");
  out.push(count);
  return out;
}
