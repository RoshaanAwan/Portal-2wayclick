import { Skeleton, SkeletonPageHeader } from "@/components/ui/Skeleton";

// Kanban board — a horizontal row of list columns, each with a few cards.
export default function TasksLoading() {
  return (
    <div className="mx-auto max-w-[1400px]">
      <SkeletonPageHeader />
      <div className="flex gap-4 overflow-hidden">
        {Array.from({ length: 4 }).map((_, col) => (
          <div key={col} className="glass w-72 shrink-0 p-3">
            <div className="mb-3 flex items-center justify-between">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-5 w-6 rounded-full" />
            </div>
            <div className="space-y-2.5">
              {Array.from({ length: 3 + (col % 2) }).map((_, c) => (
                <div key={c} className="rounded-xl border border-line bg-surface-2 p-3">
                  <Skeleton className="h-3.5 w-3/4" />
                  <Skeleton className="mt-2.5 h-3 w-full" />
                  <div className="mt-3 flex items-center justify-between">
                    <Skeleton className="h-5 w-16 rounded-full" />
                    <Skeleton className="h-6 w-6 rounded-full" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
