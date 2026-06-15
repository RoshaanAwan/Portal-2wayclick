import {
  Skeleton,
  SkeletonAvatar,
  SkeletonCard,
  SkeletonGrid,
  SkeletonPageHeader,
} from "@/components/ui/Skeleton";

export default function DirectoryLoading() {
  return (
    <div className="mx-auto max-w-7xl">
      <SkeletonPageHeader />
      {/* Search / filter bar */}
      <Skeleton className="mb-5 h-11 w-full rounded-xl" />
      <SkeletonGrid
        count={9}
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
    </div>
  );
}
