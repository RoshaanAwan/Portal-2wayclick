import {
  Skeleton,
  SkeletonCard,
  SkeletonGrid,
  SkeletonPageHeader,
} from "@/components/ui/Skeleton";

export default function ProjectsLoading() {
  return (
    <div className="mx-auto max-w-[1200px]">
      <SkeletonPageHeader action />
      <SkeletonGrid
        count={6}
        card={
          <SkeletonCard>
            <div className="flex items-center justify-between">
              <Skeleton className="h-10 w-10 rounded-lg" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            <Skeleton className="mt-4 h-4 w-2/3" />
            <Skeleton className="mt-2 h-3 w-full" />
            <div className="mt-4 flex -space-x-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-7 w-7 rounded-full" />
              ))}
            </div>
          </SkeletonCard>
        }
      />
    </div>
  );
}
