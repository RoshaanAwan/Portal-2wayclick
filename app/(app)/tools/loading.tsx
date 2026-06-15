import {
  Skeleton,
  SkeletonCard,
  SkeletonPageHeader,
} from "@/components/ui/Skeleton";

export default function ToolsLoading() {
  return (
    <div className="mx-auto max-w-6xl">
      <SkeletonPageHeader />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Apps grid */}
          <SkeletonCard>
            <Skeleton className="h-4 w-24" />
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 rounded-xl border border-line bg-surface-2 p-3"
                >
                  <Skeleton className="h-10 w-10 rounded-xl" />
                  <Skeleton className="h-3.5 w-16" />
                </div>
              ))}
            </div>
          </SkeletonCard>
          <SkeletonCard>
            <Skeleton className="h-4 w-28" />
            <div className="mt-4 space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-xl" />
              ))}
            </div>
          </SkeletonCard>
        </div>
        <div className="space-y-6">
          <SkeletonCard>
            <Skeleton className="h-4 w-24" />
            <Skeleton className="mx-auto mt-5 h-44 w-44 rounded-full" />
            <Skeleton className="mx-auto mt-5 h-12 w-32 rounded-xl" />
          </SkeletonCard>
          <SkeletonCard>
            <Skeleton className="h-4 w-20" />
            <div className="mt-4 space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-3.5 w-full" />
              ))}
            </div>
          </SkeletonCard>
        </div>
      </div>
    </div>
  );
}
