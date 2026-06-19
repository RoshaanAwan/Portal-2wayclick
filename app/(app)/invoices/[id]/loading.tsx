import { Skeleton, SkeletonText } from "@/components/ui/Skeleton";

// Mirrors InvoiceDetailClient: a back/action bar, then the invoice document.
export default function InvoiceDetailLoading() {
  return (
    <div className="mx-auto max-w-[900px]">
      {/* Action bar */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3" aria-hidden>
        <Skeleton className="h-8 w-28 rounded-lg" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-20 rounded-lg" />
          <Skeleton className="h-8 w-24 rounded-lg" />
        </div>
      </div>

      {/* Invoice document */}
      <div className="glass p-8" aria-hidden>
        <div className="flex items-start justify-between">
          <div className="space-y-3">
            <Skeleton className="h-10 w-10 rounded-xl" />
            <Skeleton className="h-5 w-40" />
            <SkeletonText lines={2} className="w-48" />
          </div>
          <div className="space-y-2 text-right">
            <Skeleton className="ml-auto h-7 w-28" />
            <Skeleton className="ml-auto h-3 w-20" />
            <Skeleton className="ml-auto h-3 w-24" />
          </div>
        </div>

        {/* Line-items table */}
        <div className="mt-9 space-y-2">
          <Skeleton className="h-9 w-full rounded-lg" />
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>

        {/* Totals */}
        <div className="mt-6 flex justify-end">
          <div className="w-full max-w-[280px] space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-12 w-full rounded-xl" />
          </div>
        </div>
      </div>
    </div>
  );
}
