import {
  Skeleton,
  SkeletonCard,
  SkeletonText,
} from "@/components/ui/Skeleton";

// Single person profile — back link, banner+avatar header, then detail cards.
export default function PersonLoading() {
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <Skeleton className="h-4 w-32" />

      {/* Profile header with banner + overlapping avatar */}
      <div className="glass-strong overflow-hidden p-0">
        <Skeleton className="h-28 w-full rounded-none" />
        <div className="px-6 pb-6 sm:px-8 sm:pb-8">
          <div className="-mt-12 flex flex-col gap-4 sm:flex-row sm:items-end">
            <Skeleton className="h-24 w-24 rounded-full ring-4 ring-surface" />
            <div className="flex-1 space-y-2.5 pb-1">
              <Skeleton className="h-7 w-48" />
              <Skeleton className="h-4 w-64" />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <SkeletonCard>
          <Skeleton className="h-4 w-28" />
          <SkeletonText className="mt-4" lines={4} />
        </SkeletonCard>
        <SkeletonCard>
          <Skeleton className="h-4 w-24" />
          <SkeletonText className="mt-4" lines={4} />
        </SkeletonCard>
      </div>
    </div>
  );
}
