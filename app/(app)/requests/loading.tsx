import {
  Skeleton,
  SkeletonCard,
  SkeletonGrid,
  SkeletonPageHeader,
} from "@/components/ui/Skeleton";

export default function RequestsLoading() {
  return (
    <div className="mx-auto max-w-5xl">
      <SkeletonPageHeader action />
      {/* Stat strip */}
      <SkeletonGrid
        count={3}
        cols="sm:grid-cols-3"
        card={
          <SkeletonCard>
            <Skeleton className="h-8 w-16" />
            <Skeleton className="mt-2 h-3.5 w-24" />
          </SkeletonCard>
        }
      />
      {/* My requests list */}
      <div className="mt-6 space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} className="flex items-center justify-between">
            <div className="space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-28" />
            </div>
            <Skeleton className="h-6 w-20 rounded-full" />
          </SkeletonCard>
        ))}
      </div>
    </div>
  );
}
