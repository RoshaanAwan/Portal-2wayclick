import { Skeleton, SkeletonAvatar, SkeletonPageHeader } from "@/components/ui/Skeleton";

// Mirrors PerformancePage: 4 summary tiles, sort chips, then a list of people
// each with two score bars. Shown while buildPerformance() runs.
export default function PerformanceLoading() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <SkeletonPageHeader />

      {/* Summary tiles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-hidden>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="glass p-3.5">
            <Skeleton className="h-8 w-8 rounded-lg" />
            <Skeleton className="mt-2.5 h-7 w-16" />
            <Skeleton className="mt-1.5 h-3 w-20" />
          </div>
        ))}
      </div>

      {/* Sort chips */}
      <div className="flex items-center gap-2" aria-hidden>
        <Skeleton className="h-5 w-12" />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-7 w-20 rounded-lg" />
        ))}
      </div>

      {/* People list */}
      <div className="glass p-0" aria-hidden>
        <div className="divide-y divide-line">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3 sm:px-5">
              <SkeletonAvatar className="h-10 w-10" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-3.5 w-32" />
                <Skeleton className="h-3 w-24" />
              </div>
              {/* Two score bars (desktop) */}
              <div className="hidden w-64 shrink-0 flex-col gap-2 sm:flex">
                <Skeleton className="h-1.5 w-full rounded-full" />
                <Skeleton className="h-1.5 w-full rounded-full" />
              </div>
              <Skeleton className="h-4 w-4 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
