import {
  Skeleton,
  SkeletonAvatar,
  SkeletonPageHeader,
} from "@/components/ui/Skeleton";

// Mirrors PulsePage: 4 summary tiles, a row of filter chips, then department
// groups each holding a grid of person tiles. Shown while buildTeamPulse() runs.
export default function PulseLoading() {
  return (
    <div className="space-y-6">
      <SkeletonPageHeader />

      {/* Summary tiles */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="glass flex items-center gap-3 p-5" aria-hidden>
            <Skeleton className="h-11 w-11 rounded-xl" />
            <div className="space-y-2">
              <Skeleton className="h-6 w-12" />
              <Skeleton className="h-3 w-16" />
            </div>
          </div>
        ))}
      </div>

      {/* Legend / filter chips */}
      <div className="flex flex-wrap items-center gap-2" aria-hidden>
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-24 rounded-full" />
        ))}
      </div>

      {/* Department groups */}
      <div className="space-y-5">
        {Array.from({ length: 2 }).map((_, g) => (
          <div key={g}>
            <Skeleton className="mb-2.5 h-4 w-32" />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="glass flex items-center gap-3 p-4" aria-hidden>
                  <SkeletonAvatar className="h-10 w-10" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3.5 w-24" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
