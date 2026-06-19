import { Skeleton, SkeletonPageHeader } from "@/components/ui/Skeleton";

// Mirrors ExpensesPage: header, a row of status-filter chips + "New expense"
// button, then a bordered six-column table (Expense · Project · Submitted by ·
// Amount · Status · Actions). Shown while the user + expense queries run.
export default function ExpensesLoading() {
  return (
    <div className="mx-auto max-w-[1200px]">
      <SkeletonPageHeader />

      {/* Filter chips + new-expense button */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3" aria-hidden>
        <div className="flex flex-wrap items-center gap-1.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-20 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-8 w-32 rounded-xl" />
      </div>

      {/* Table — matches the real table's horizontal-scroll behavior on mobile
          (min-width + overflow-x-auto) so the loading state doesn't clip. */}
      <div className="overflow-x-auto rounded-2xl border border-line" aria-hidden>
        <div className="min-w-[680px]">
          {/* Header row */}
          <div className="flex items-center gap-4 bg-surface-2 px-4 py-3">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="ml-auto h-3 w-16" />
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-14" />
            <Skeleton className="h-3 w-16" />
          </div>
          {/* Body rows */}
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-4 border-t border-line px-4 py-3"
            >
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3.5 w-40" />
                <Skeleton className="h-3 w-28" />
              </div>
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-3.5 w-20" />
              <Skeleton className="h-3.5 w-16" />
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-7 w-16 rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
