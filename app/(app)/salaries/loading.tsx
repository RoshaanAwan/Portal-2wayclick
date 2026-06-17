import { Skeleton, SkeletonPageHeader } from "@/components/ui/Skeleton";

// Mirrors SalariesPage: header, a count line + "Add salary" button, then a
// couple of per-project group cards — each a header bar (project name + monthly
// cost) over a small table of employee salary rows. Shown while the queries run.
export default function SalariesLoading() {
  return (
    <div className="mx-auto max-w-[1200px]">
      <SkeletonPageHeader />

      {/* Count line + add button */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3" aria-hidden>
        <Skeleton className="h-4 w-56" />
        <Skeleton className="h-8 w-32 rounded-xl" />
      </div>

      {/* Per-project groups */}
      <div className="space-y-6" aria-hidden>
        {Array.from({ length: 2 }).map((_, g) => (
          <div key={g} className="overflow-hidden rounded-2xl border border-line">
            {/* Group header: project name + monthly cost */}
            <div className="flex items-center justify-between gap-2 border-b border-line bg-surface-2 px-4 py-3">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3.5 w-36" />
            </div>
            {/* Salary rows */}
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-4 border-t border-line px-4 py-3 first:border-0"
              >
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3.5 w-32" />
                  <Skeleton className="h-3 w-20" />
                </div>
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-7 w-24 rounded-lg" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
