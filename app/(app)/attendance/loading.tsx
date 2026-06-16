import { Skeleton, SkeletonPageHeader } from "@/components/ui/Skeleton";

// Mirrors AttendancePage: header, then a bordered table with four columns
// (Person/Day · Status · Check-in · Check-out). Covers both the manager roster
// and the employee history view, which share the same table shape. Shown while
// the user + attendance queries run.
export default function AttendanceLoading() {
  return (
    <div className="mx-auto max-w-5xl">
      <SkeletonPageHeader />

      <div className="overflow-hidden rounded-xl border border-line" aria-hidden>
        {/* Header row */}
        <div className="flex items-center gap-4 bg-surface-2 px-4 py-3">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="ml-auto h-3 w-16" />
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-16" />
        </div>
        {/* Body rows */}
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 border-t border-line px-4 py-3"
          >
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="h-3 w-40" />
            </div>
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="h-3.5 w-14" />
            <Skeleton className="h-3.5 w-14" />
          </div>
        ))}
      </div>
    </div>
  );
}
