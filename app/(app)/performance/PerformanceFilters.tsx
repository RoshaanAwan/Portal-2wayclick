"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { cn } from "@/lib/utils";
import type {
  PerformanceFilters as Filters,
  PerfUserOption,
} from "@/lib/performance";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * Period + user controls for the Performance board. The page reads everything
 * from the URL (`?period=&year=&month=&user=`); this component only writes it
 * back, mirroring AttendanceDateNav. Changing a control pushes a fresh URL and
 * the server rebuilds the report.
 */
export function PerformanceFilters({
  filters,
  years,
  users,
}: {
  filters: Filters;
  years: number[];
  users: PerfUserOption[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function apply(next: Partial<Filters>) {
    const merged = { ...filters, ...next };
    const params = new URLSearchParams();
    params.set("period", merged.period);
    params.set("year", String(merged.year));
    if (merged.period === "month") params.set("month", String(merged.month));
    if (merged.userId) params.set("user", merged.userId);
    startTransition(() => router.push(`/performance?${params.toString()}`));
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Period segmented toggle */}
      <div className="inline-flex rounded-xl border border-line bg-surface-2 p-0.5">
        {(["month", "year"] as const).map((p) => (
          <button
            key={p}
            onClick={() => apply({ period: p })}
            disabled={isPending}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition",
              filters.period === p
                ? "bg-accent text-white shadow-sm"
                : "text-ink-500 hover:text-ink",
            )}
          >
            {p}ly
          </button>
        ))}
      </div>

      {/* Month — only in month view */}
      {filters.period === "month" && (
        <select
          value={filters.month}
          onChange={(e) => apply({ month: Number(e.target.value) })}
          disabled={isPending}
          className="input max-w-[140px] py-2"
          aria-label="Month"
        >
          {MONTHS.map((m, i) => (
            <option key={m} value={i}>
              {m}
            </option>
          ))}
        </select>
      )}

      {/* Year */}
      <select
        value={filters.year}
        onChange={(e) => apply({ year: Number(e.target.value) })}
        disabled={isPending}
        className="input max-w-[110px] py-2"
        aria-label="Year"
      >
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>

      {/* User — wins over the team view when set */}
      <select
        value={filters.userId ?? ""}
        onChange={(e) => apply({ userId: e.target.value || null })}
        disabled={isPending}
        className="input max-w-[180px] py-2 sm:ml-auto"
        aria-label="User"
      >
        <option value="">All people</option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
          </option>
        ))}
      </select>
    </div>
  );
}
