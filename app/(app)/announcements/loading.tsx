import {
  Skeleton,
  SkeletonAvatar,
  SkeletonCard,
  SkeletonPageHeader,
  SkeletonText,
} from "@/components/ui/Skeleton";

export default function AnnouncementsLoading() {
  return (
    <div className="mx-auto max-w-3xl">
      <SkeletonPageHeader />
      <div className="space-y-5">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i}>
            <div className="flex items-center gap-3">
              <SkeletonAvatar />
              <div className="space-y-2">
                <Skeleton className="h-3.5 w-32" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
            <Skeleton className="mt-4 h-5 w-2/3" />
            <SkeletonText className="mt-3" lines={3} />
          </SkeletonCard>
        ))}
      </div>
    </div>
  );
}
