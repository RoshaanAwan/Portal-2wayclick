import {
  Skeleton,
  SkeletonCard,
  SkeletonGrid,
  SkeletonPageHeader,
  SkeletonPagination,
} from "@/components/ui/Skeleton";

export default function DocumentsLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <SkeletonPageHeader action />

      {/* Stats row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-[88px] rounded-2xl" />
        ))}
      </div>

      {/* Search + view toggle */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Skeleton className="h-10 w-full rounded-xl sm:max-w-xs" />
        <Skeleton className="h-10 w-32 rounded-xl" />
      </div>

      <SkeletonGrid
        count={12}
        cols="sm:grid-cols-2 lg:grid-cols-3"
        card={
          <SkeletonCard>
            <Skeleton className="h-12 w-12 rounded-xl" />
            <Skeleton className="mt-4 h-4 w-3/4" />
            <Skeleton className="mt-2 h-3 w-1/2" />
          </SkeletonCard>
        }
      />

      <SkeletonPagination />
    </div>
  );
}
