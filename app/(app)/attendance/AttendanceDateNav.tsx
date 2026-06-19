"use client";

import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/Button";

/**
 * Date controls for the manager attendance roster. The page reads the selected
 * day from `?date=YYYY-MM-DD`; this component only writes it back to the URL.
 *
 * `selected`, `prev`, `next`, and `today` are all YYYY-MM-DD strings the server
 * computed in the business timezone (PKT), so day math stays correct regardless
 * of the viewer's local zone. `next`/`isToday` let us disable forward nav past
 * today (there's no future attendance to show).
 */
export function AttendanceDateNav({
  selected,
  prev,
  next,
  today,
  isToday,
}: {
  selected: string;
  prev: string;
  next: string;
  today: string;
  isToday: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function go(date: string) {
    // Keep canonical URLs clean: today is the default, so drop the param.
    const href = date === today ? "/attendance" : `/attendance?date=${date}`;
    startTransition(() => router.push(href));
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <Button
        variant="glass"
        size="sm"
        onClick={() => go(prev)}
        disabled={isPending}
        aria-label="Previous day"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>

      <input
        type="date"
        value={selected}
        max={today}
        onChange={(e) => {
          if (e.target.value) go(e.target.value);
        }}
        disabled={isPending}
        className="input max-w-[160px] py-2 sm:max-w-[180px]"
        aria-label="Pick a date"
      />

      <Button
        variant="glass"
        size="sm"
        onClick={() => go(next)}
        disabled={isPending || isToday}
        aria-label="Next day"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>

      {!isToday && (
        <Button variant="ghost" size="sm" onClick={() => go(today)} disabled={isPending}>
          Today
        </Button>
      )}

      <a
        href={`/api/attendance/export?date=${selected}`}
        className="inline-flex h-8 items-center gap-2 rounded-xl px-3 text-xs font-medium text-ink-500 transition-colors hover-surface hover:text-ink sm:ml-auto"
      >
        <Download className="h-4 w-4" />
        Export CSV
      </a>
    </div>
  );
}
