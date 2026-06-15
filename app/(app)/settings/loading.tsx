import {
  Skeleton,
  SkeletonAvatar,
  SkeletonCard,
  SkeletonPageHeader,
} from "@/components/ui/Skeleton";

export default function SettingsLoading() {
  return (
    <div className="mx-auto max-w-5xl">
      <SkeletonPageHeader />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[200px_1fr]">
        {/* Section nav */}
        <div className="space-y-1.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded-xl" />
          ))}
        </div>
        {/* Section content */}
        <div className="space-y-5">
          <SkeletonCard className="flex items-center gap-5">
            <SkeletonAvatar className="h-16 w-16" />
            <div className="flex-1 space-y-2.5">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-3.5 w-56" />
            </div>
          </SkeletonCard>
          <SkeletonCard>
            <Skeleton className="h-4 w-32" />
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-xl" />
              ))}
            </div>
          </SkeletonCard>
        </div>
      </div>
    </div>
  );
}
