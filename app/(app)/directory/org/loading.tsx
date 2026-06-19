import {
  Skeleton,
  SkeletonAvatar,
  SkeletonPageHeader,
} from "@/components/ui/Skeleton";

// Mirrors OrgChartPage: header, then the zoomable canvas with a root node and a
// row of report nodes beneath it. Shown while buildOrgChart() runs.
function NodeCard() {
  return (
    <div className="glass flex w-56 flex-col items-center gap-2 p-4" aria-hidden>
      <SkeletonAvatar className="h-12 w-12" />
      <Skeleton className="h-3.5 w-28" />
      <Skeleton className="h-3 w-20" />
    </div>
  );
}

export default function OrgChartLoading() {
  return (
    <div className="mx-auto max-w-[100rem]">
      <SkeletonPageHeader />

      <div className="glass overflow-x-auto p-6 sm:p-8" aria-hidden>
        <div className="flex min-w-max flex-col items-center gap-8 pt-2">
          {/* Root */}
          <NodeCard />
          {/* Reports row */}
          <div className="flex gap-4 sm:gap-8">
            {Array.from({ length: 4 }).map((_, i) => (
              <NodeCard key={i} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
