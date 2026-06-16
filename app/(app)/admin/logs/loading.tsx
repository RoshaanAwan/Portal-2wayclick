import {
  Skeleton,
  SkeletonAvatar,
  SkeletonPageHeader,
  SkeletonPagination,
} from "@/components/ui/Skeleton";

// Mirrors AdminLogsPage: header, a search + action-filter toolbar, then a glass
// card holding a divided list of audit-log rows.
export default function AdminLogsLoading() {
  return (
    <div className="mx-auto max-w-6xl">
      <SkeletonPageHeader />

      <div className="space-y-5">
        {/* Toolbar: search + action select */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Skeleton className="h-10 w-full max-w-sm rounded-xl" />
          <Skeleton className="h-10 w-full max-w-[200px] rounded-xl" />
        </div>

        {/* Log list */}
        <div className="glass overflow-hidden p-0" aria-hidden>
          {Array.from({ length: 10 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 border-b border-line/60 px-5 py-3.5 last:border-0"
            >
              <SkeletonAvatar className="h-9 w-9" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3.5 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
              </div>
              <Skeleton className="h-3 w-16 shrink-0" />
            </div>
          ))}
        </div>

        {/* Pagination footer */}
        <SkeletonPagination />
      </div>
    </div>
  );
}
