import { Skeleton, SkeletonPageHeader } from "@/components/ui/Skeleton";

// Single project board — back link, header, then the kanban columns.
export default function ProjectDetailLoading() {
  return (
    <div className="mx-auto max-w-[1400px]">
      <Skeleton className="mb-4 h-4 w-24" />
      <SkeletonPageHeader action />
      <div className="flex gap-4 overflow-hidden">
        {Array.from({ length: 4 }).map((_, col) => (
          <div key={col} className="glass w-72 shrink-0 p-3">
            <Skeleton className="mb-3 h-4 w-24" />
            <div className="space-y-2.5">
              {Array.from({ length: 2 + (col % 3) }).map((_, c) => (
                <div key={c} className="rounded-xl border border-line bg-surface-2 p-3">
                  <Skeleton className="h-3.5 w-3/4" />
                  <Skeleton className="mt-2.5 h-3 w-full" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
