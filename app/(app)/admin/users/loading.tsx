import {
  Skeleton,
  SkeletonAvatar,
  SkeletonPageHeader,
  SkeletonPagination,
} from "@/components/ui/Skeleton";

// Mirrors AdminUsersPage: header, a search + "new user" toolbar, then a glass
// card holding the members table (Member / Role / Department / Joined).
export default function AdminUsersLoading() {
  return (
    <div className="mx-auto max-w-6xl">
      <SkeletonPageHeader />

      <div className="space-y-5">
        {/* Toolbar: search + new-user button */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Skeleton className="h-10 w-full max-w-sm rounded-xl" />
          <Skeleton className="h-10 w-32 rounded-xl" />
        </div>

        {/* Members table */}
        <div className="glass overflow-hidden p-0" aria-hidden>
          {/* Header row */}
          <div className="flex items-center gap-4 border-b border-line px-5 py-3">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="ml-auto h-3 w-12" />
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-12" />
          </div>
          {/* Body rows */}
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-4 border-b border-line/60 px-5 py-3 last:border-0"
            >
              <div className="flex flex-1 items-center gap-3">
                <SkeletonAvatar className="h-9 w-9" />
                <div className="space-y-2">
                  <Skeleton className="h-3.5 w-32" />
                  <Skeleton className="h-3 w-40" />
                </div>
              </div>
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-3.5 w-16" />
            </div>
          ))}
        </div>

        <SkeletonPagination />
      </div>
    </div>
  );
}
