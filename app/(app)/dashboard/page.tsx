import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth";
import { isAdminTier } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { Skeleton, SkeletonCard } from "@/components/ui/Skeleton";
import { HeroSection } from "./HeroSection";
import { StatTilesSection } from "./StatTilesSection";
import { CalendarSection } from "./CalendarSection";
import { AssignedCardsSection } from "./AssignedCardsSection";
import { RightRailSection } from "./RightRailSection";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Directory is admin tier only — drives whether we surface links to it.
  const canSeeDirectory = isAdminTier(user.role);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <Suspense fallback={<HeroFallback />}>
        <HeroSection user={user} />
      </Suspense>

      <Suspense fallback={<StatTilesFallback />}>
        <StatTilesSection canSeeDirectory={canSeeDirectory} />
      </Suspense>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Main column */}
        <div className="space-y-6 lg:col-span-2">
          <Suspense fallback={<AssignedCardsFallback />}>
            <AssignedCardsSection user={user} />
          </Suspense>
          <Suspense fallback={<CalendarFallback />}>
            <CalendarSection user={user} />
          </Suspense>
        </div>

        {/* Right rail */}
        <div className="lg:col-span-1">
          <Suspense fallback={<RightRailFallback />}>
            <RightRailSection user={user} canSeeDirectory={canSeeDirectory} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

function HeroFallback() {
  return (
    <div className="glass flex flex-col gap-5 p-6 sm:flex-row sm:items-center">
      <Skeleton className="h-16 w-16 rounded-2xl" />
      <div className="flex-1 space-y-2.5">
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-4 w-48" />
      </div>
    </div>
  );
}

function StatTilesFallback() {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <SkeletonCard key={i}>
          <Skeleton className="h-9 w-9 rounded-lg" />
          <Skeleton className="mt-4 h-8 w-20" />
          <Skeleton className="mt-2 h-3.5 w-24" />
        </SkeletonCard>
      ))}
    </div>
  );
}

function AssignedCardsFallback() {
  return (
    <SkeletonCard>
      <Skeleton className="h-4 w-24" />
      <div className="mt-4 space-y-2.5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-2 rounded-xl border border-line p-3">
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="h-3.5 w-3/4" />
          </div>
        ))}
      </div>
    </SkeletonCard>
  );
}

function CalendarFallback() {
  return (
    <SkeletonCard>
      <Skeleton className="h-4 w-32" />
      <Skeleton className="mt-3 mx-auto h-4 w-28" />
      <div className="mt-4 grid grid-cols-7 gap-1">
        {Array.from({ length: 42 }).map((_, i) => (
          <Skeleton key={i} className="h-12 rounded-lg" />
        ))}
      </div>
    </SkeletonCard>
  );
}

function RightRailFallback() {
  return (
    <div className="space-y-6">
      <SkeletonCard>
        <Skeleton className="h-4 w-28" />
        <Skeleton className="mt-4 h-28 w-full rounded-xl" />
      </SkeletonCard>
      <SkeletonCard>
        <Skeleton className="h-4 w-32" />
        <div className="mt-4 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-8 w-8 rounded-full" />
              <Skeleton className="h-3.5 w-32" />
            </div>
          ))}
        </div>
      </SkeletonCard>
    </div>
  );
}
