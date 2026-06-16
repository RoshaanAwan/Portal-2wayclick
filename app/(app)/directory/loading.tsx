import {
  Skeleton,
  SkeletonAvatar,
  SkeletonCard,
  SkeletonGrid,
  SkeletonPageHeader,
  SkeletonPagination,
} from "@/components/ui/Skeleton";

export default function DirectoryLoading() {
  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <SkeletonPageHeader action />
      {/* Search / filter bar */}
      <Skeleton className="h-11 w-full rounded-xl" />
      <SkeletonGrid
        count={12}
        cols="sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        card={
          <SkeletonCard className="flex items-center gap-4">
            <SkeletonAvatar className="h-12 w-12" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-36" />
            </div>
          </SkeletonCard>
        }
      />
      <SkeletonPagination />
    </div>
  );
}
