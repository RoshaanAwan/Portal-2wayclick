import { cn } from "@/lib/utils";

/**
 * Skeleton primitives — shimmering placeholders shown while a route's server
 * data loads (via each segment's loading.tsx). They reuse the global `.skeleton`
 * shimmer (see globals.css) so they re-theme with dark/light automatically.
 *
 * These are plain server components: no client JS, instant to render.
 */

/** A single shimmering block. Width/height/shape via className. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded-md", className)} aria-hidden />;
}

/** A run of text lines; the last line is shortened to read like a paragraph. */
export function SkeletonText({
  lines = 3,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)} aria-hidden>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn("h-3.5", i === lines - 1 ? "w-2/3" : "w-full")}
        />
      ))}
    </div>
  );
}

/** Circular avatar placeholder. */
export function SkeletonAvatar({ className }: { className?: string }) {
  return <Skeleton className={cn("h-10 w-10 rounded-full", className)} />;
}

/** A glass card wrapper holding arbitrary skeleton content. */
export function SkeletonCard({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn("glass p-5", className)} aria-hidden>
      {children ?? (
        <>
          <Skeleton className="h-4 w-1/3" />
          <SkeletonText className="mt-4" lines={3} />
        </>
      )}
    </div>
  );
}

/** Page header placeholder — mirrors <PageHeader/>'s icon + title + subtitle. */
export function SkeletonPageHeader({ action }: { action?: boolean }) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4" aria-hidden>
      <div className="flex items-center gap-3">
        <Skeleton className="h-11 w-11 rounded-xl" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-44" />
          <Skeleton className="h-3.5 w-60" />
        </div>
      </div>
      {action && <Skeleton className="h-10 w-32 rounded-xl" />}
    </div>
  );
}

/**
 * A responsive grid of identical skeleton cards — the workhorse for the many
 * list/grid pages (directory, documents, projects, tools, announcements).
 */
export function SkeletonGrid({
  count = 6,
  cols = "sm:grid-cols-2 lg:grid-cols-3",
  card,
}: {
  count?: number;
  cols?: string;
  card?: React.ReactNode;
}) {
  return (
    <div className={cn("grid grid-cols-1 gap-4", cols)} aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i}>{card ?? <SkeletonCard />}</div>
      ))}
    </div>
  );
}
