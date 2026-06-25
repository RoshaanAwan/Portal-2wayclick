import { Skeleton, SkeletonAvatar, SkeletonPageHeader } from "@/components/ui/Skeleton";

// Mirrors PerformancePage: a trend chart, 4 mini stats, sort chips, then a
// delivery-led ranked list. Shown while buildPerformance() runs.
export default function PerformanceLoading() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <SkeletonPageHeader />

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2" aria-hidden>
        <Skeleton className="h-9 w-32 rounded-xl" />
        <Skeleton className="h-9 w-32 rounded-xl" />
        <Skeleton className="h-9 w-24 rounded-xl" />
        <Skeleton className="h-9 w-40 rounded-xl sm:ml-auto" />
      </div>

      {/* Trend chart */}
      <div className="glass" aria-hidden>
        <div className="mb-4 space-y-2">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3 w-40" />
        </div>
        <Skeleton className="h-44 w-full rounded-xl" />
      </div>

      {/* Four mini stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-hidden>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="glass p-3.5 text-center">
            <Skeleton className="mx-auto h-7 w-16" />
            <Skeleton className="mx-auto mt-1.5 h-3 w-20" />
          </div>
        ))}
      </div>

      {/* Sort chips */}
      <div className="flex flex-wrap items-center gap-2" aria-hidden>
        <Skeleton className="h-5 w-12" />
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-7 w-16 rounded-lg" />
        ))}
      </div>

      {/* Ranked list */}
      <div className="glass p-0" aria-hidden>
        <div className="divide-y divide-line">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3 sm:px-5">
              <Skeleton className="h-4 w-4 rounded" />
              <SkeletonAvatar className="h-8 w-8" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-3.5 w-32" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="hidden h-7 w-24 rounded sm:block" />
              <Skeleton className="h-5 w-9" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
