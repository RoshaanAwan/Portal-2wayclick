import {
  Skeleton,
  SkeletonGrid,
  SkeletonPageHeader,
} from "@/components/ui/Skeleton";

// Mirrors InvoicesPage: header, then a responsive grid of invoice cards. Shown
// while the invoice list loads.
export default function InvoicesLoading() {
  return (
    <div className="mx-auto max-w-[1200px]">
      <SkeletonPageHeader action />
      <SkeletonGrid
        count={6}
        cols="sm:grid-cols-2 lg:grid-cols-3"
        card={
          <div className="glass flex flex-col p-5" aria-hidden>
            <div className="flex items-start justify-between">
              <Skeleton className="h-10 w-10 rounded-xl" />
              <Skeleton className="h-7 w-7 rounded-lg" />
            </div>
            <Skeleton className="mt-4 h-4 w-2/3" />
            <Skeleton className="mt-2 h-3 w-1/2" />
            <div className="mt-4 flex items-center justify-between">
              <Skeleton className="h-6 w-24" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
          </div>
        }
      />
    </div>
  );
}
