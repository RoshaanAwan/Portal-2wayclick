import {
  Skeleton,
  SkeletonCard,
  SkeletonGrid,
  SkeletonPageHeader,
} from "@/components/ui/Skeleton";

export default function DocumentsLoading() {
  return (
    <div className="mx-auto max-w-6xl">
      <SkeletonPageHeader action />
      <Skeleton className="mb-5 h-11 w-full rounded-xl" />
      <SkeletonGrid
        count={8}
        cols="sm:grid-cols-2 lg:grid-cols-4"
        card={
          <SkeletonCard>
            <Skeleton className="h-10 w-10 rounded-lg" />
            <Skeleton className="mt-4 h-4 w-3/4" />
            <Skeleton className="mt-2 h-3 w-1/2" />
          </SkeletonCard>
        }
      />
    </div>
  );
}
