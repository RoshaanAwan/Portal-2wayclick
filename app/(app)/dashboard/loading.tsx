import {
  Skeleton,
  SkeletonCard,
  SkeletonGrid,
} from "@/components/ui/Skeleton";

// Shown while the dashboard's parallel DB queries resolve. Mirrors the real
// layout: hero, stat tiles, then a two-column (feed + chart | right rail) grid.
export default function DashboardLoading() {
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Hero */}
      <div className="glass flex items-center gap-5 p-6">
        <Skeleton className="h-16 w-16 rounded-2xl" />
        <div className="flex-1 space-y-2.5">
          <Skeleton className="h-7 w-64" />
          <Skeleton className="h-4 w-48" />
        </div>
      </div>

      {/* Stat tiles */}
      <SkeletonGrid
        count={4}
        cols="sm:grid-cols-2 lg:grid-cols-4"
        card={
          <SkeletonCard>
            <Skeleton className="h-9 w-9 rounded-lg" />
            <Skeleton className="mt-4 h-8 w-20" />
            <Skeleton className="mt-2 h-3.5 w-24" />
          </SkeletonCard>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <SkeletonCard>
            <Skeleton className="h-4 w-32" />
            <div className="mt-5 space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-start gap-3">
                  <Skeleton className="h-9 w-9 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3.5 w-3/4" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
              ))}
            </div>
          </SkeletonCard>
          <SkeletonCard>
            <Skeleton className="h-4 w-44" />
            <Skeleton className="mt-5 h-56 w-full rounded-xl" />
          </SkeletonCard>
        </div>
        <div className="lg:col-span-1 space-y-6">
          <SkeletonCard>
            <Skeleton className="h-4 w-28" />
            <Skeleton className="mt-4 h-28 w-full rounded-xl" />
          </SkeletonCard>
          <SkeletonCard>
            <Skeleton className="h-4 w-32" />
            <div className="mt-4 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-8 w-8 rounded-full" />
                  <Skeleton className="h-3.5 w-32" />
                </div>
              ))}
            </div>
          </SkeletonCard>
        </div>
      </div>
    </div>
  );
}
