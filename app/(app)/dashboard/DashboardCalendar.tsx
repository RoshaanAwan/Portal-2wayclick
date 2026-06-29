"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Megaphone,
  PalmtreeIcon,
  X,
} from "lucide-react";
import Link from "@/components/Link";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

// One overlay on a calendar day: a task due that day, or an announcement /
// holiday pinned to it. `day` is a YYYY-MM-DD key (UTC calendar date).
export interface CalendarEvent {
  id: string;
  day: string;
  title: string;
  kind: "task" | "announcement" | "holiday";
  // Task: the issue key (e.g. PORTAL-42). Unused for announcements.
  meta?: string | null;
  // Who created/posted it — the card's creator, or the announcer.
  author?: string | null;
  // Where the agenda row links to (a task card; announcements use the feed).
  linkTo?: string;
  done?: boolean;
}

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

const KIND_DOT: Record<CalendarEvent["kind"], string> = {
  task: "bg-info",
  announcement: "bg-accent",
  holiday: "bg-warn",
};

/** YYYY-MM-DD for a Date's UTC calendar day. */
function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Build the 6-week grid (Mon-first) covering `year`/`month` (0-indexed). */
function buildGrid(year: number, month: number): Date[] {
  const first = new Date(Date.UTC(year, month, 1));
  // JS getUTCDay: 0=Sun … 6=Sat. Shift so Monday is the first column.
  const lead = (first.getUTCDay() + 6) % 7;
  const start = new Date(Date.UTC(year, month, 1 - lead));
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    return d;
  });
}

export function DashboardCalendar({
  events,
  canAnnounce,
}: {
  events: CalendarEvent[];
  canAnnounce: boolean;
}) {
  const now = new Date();
  // The month being viewed (anchored to its 1st, UTC).
  const [cursor, setCursor] = useState(
    () => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
  );
  // Day whose agenda panel is open (YYYY-MM-DD), and the announce modal.
  const [selected, setSelected] = useState<string>(() => ymd(now));
  const [announceFor, setAnnounceFor] = useState<string | null>(null);

  const todayKey = ymd(now);

  const byDay = useMemo(() => {
    const m = new Map<string, CalendarEvent[]>();
    for (const e of events) {
      const arr = m.get(e.day);
      if (arr) arr.push(e);
      else m.set(e.day, [e]);
    }
    return m;
  }, [events]);

  const grid = useMemo(
    () => buildGrid(cursor.getUTCFullYear(), cursor.getUTCMonth()),
    [cursor],
  );

  const monthLabel = cursor.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  const selectedEvents = byDay.get(selected) ?? [];
  const selectedLabel = new Date(`${selected}T00:00:00Z`).toLocaleDateString(
    undefined,
    { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" },
  );

  const step = (delta: number) =>
    setCursor(
      (c) =>
        new Date(Date.UTC(c.getUTCFullYear(), c.getUTCMonth() + delta, 1)),
    );

  return (
    <GlassCard hover={false} className="p-0">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <div className="flex items-center gap-2.5">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-accent-soft">
            <CalendarDays className="h-4 w-4 text-accent" />
          </div>
          <div>
            <h2 className="font-display text-[15px] font-semibold tracking-tight text-ink">
              Calendar
            </h2>
            <p className="text-[11px] text-ink-400">Holidays, announcements &amp; due dates</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {canAnnounce && (
            <button
              onClick={() => setAnnounceFor(selected)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-accent/30 bg-accent-soft px-2.5 py-1.5 text-xs font-medium text-accent-ink transition hover:border-accent/50"
            >
              <Megaphone className="h-3.5 w-3.5" />
              Announce
            </button>
          )}
          <div className="flex items-center rounded-lg border border-line">
            <button
              onClick={() => step(-1)}
              aria-label="Previous month"
              className="grid h-7 w-7 place-items-center text-ink-400 hover:text-ink"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => step(1)}
              aria-label="Next month"
              className="grid h-7 w-7 place-items-center text-ink-400 hover:text-ink"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="px-5 py-4">
        <p className="mb-3 text-center text-[13px] font-semibold text-ink">
          {monthLabel}
        </p>

        {/* Weekday header */}
        <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[10px] font-medium uppercase tracking-wide text-ink-300">
          {WEEKDAYS.map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>

        {/* Day grid */}
        <div className="grid grid-cols-7 gap-1">
          {grid.map((d) => {
            const key = ymd(d);
            const inMonth = d.getUTCMonth() === cursor.getUTCMonth();
            const dayEvents = byDay.get(key) ?? [];
            const isToday = key === todayKey;
            const isSelected = key === selected;
            // De-duped dot kinds present that day (max 3 dots).
            const kinds = Array.from(new Set(dayEvents.map((e) => e.kind)));

            return (
              <button
                key={key}
                onClick={() => setSelected(key)}
                className={cn(
                  "relative flex h-12 flex-col items-center justify-start rounded-lg border px-1 pt-1.5 text-xs transition-colors",
                  isSelected
                    ? "border-accent/40 bg-accent-soft"
                    : isToday
                      ? "border-accent/30 hover:bg-surface-2"
                      : "border-transparent hover:bg-surface-2",
                  !inMonth && "opacity-35",
                )}
              >
                <span
                  className={cn(
                    "grid h-5 w-5 place-items-center rounded-full tabular-nums",
                    isToday
                      ? "bg-accent font-semibold text-white"
                      : isSelected
                        ? "font-semibold text-accent-ink"
                        : "text-ink-600",
                  )}
                >
                  {d.getUTCDate()}
                </span>
                {kinds.length > 0 && (
                  <span className="mt-1 flex items-center gap-0.5">
                    {kinds.slice(0, 3).map((k) => (
                      <span
                        key={k}
                        className={cn("h-1.5 w-1.5 rounded-full", KIND_DOT[k])}
                      />
                    ))}
                    {dayEvents.length > 3 && (
                      <span className="ml-0.5 text-[8px] font-semibold leading-none text-ink-400">
                        +{dayEvents.length - 3}
                      </span>
                    )}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Legend */}
        <div className="mt-3 flex items-center justify-center gap-4 text-[10px] text-ink-400">
          <Legend dot={KIND_DOT.holiday} label="Holiday" />
          <Legend dot={KIND_DOT.announcement} label="Announcement" />
          <Legend dot={KIND_DOT.task} label="Due" />
        </div>
      </div>

      {/* Selected-day agenda */}
      <div className="border-t border-line px-5 py-4">
        <div className="mb-2.5 flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">
            {selectedLabel}
          </p>
          {selectedEvents.length > 0 && (
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-semibold text-ink-400">
              {selectedEvents.length}{" "}
              {selectedEvents.length === 1 ? "item" : "items"}
            </span>
          )}
        </div>
        {selectedEvents.length === 0 ? (
          <p className="py-2 text-sm text-ink-400">Nothing scheduled.</p>
        ) : (
          <ul className="space-y-1">
            {selectedEvents.map((e) => (
              <AgendaRow key={e.id} event={e} />
            ))}
          </ul>
        )}
      </div>

      <AnimatePresence>
        {announceFor && (
          <AnnounceModal
            date={announceFor}
            onClose={() => setAnnounceFor(null)}
          />
        )}
      </AnimatePresence>
    </GlassCard>
  );
}

function Legend({ dot, label }: { dot: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn("h-1.5 w-1.5 rounded-full", dot)} />
      {label}
    </span>
  );
}

function AgendaRow({ event }: { event: CalendarEvent }) {
  const Icon =
    event.kind === "task"
      ? CalendarDays
      : event.kind === "holiday"
        ? PalmtreeIcon
        : Megaphone;
  const chip =
    event.kind === "task"
      ? "bg-info-soft text-info"
      : event.kind === "holiday"
        ? "bg-warn-soft text-warn"
        : "bg-accent-soft text-accent";

  // The sub-line: who added it (+ the issue key for tasks).
  const subline =
    event.kind === "task"
      ? [event.meta, event.author ? `added by ${event.author}` : null]
          .filter(Boolean)
          .join(" · ")
      : event.kind === "holiday"
        ? event.author
          ? `Holiday · announced by ${event.author}`
          : "Holiday"
        : event.author
          ? `Announced by ${event.author}`
          : "Announcement";

  const body = (
    <div className="flex items-center gap-2.5 rounded-lg border border-transparent px-2 py-2 transition-colors hover:border-line hover:bg-surface-2">
      <span
        className={cn(
          "grid h-7 w-7 shrink-0 place-items-center rounded-lg",
          chip,
        )}
      >
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "truncate text-sm font-medium text-ink",
            event.done && "text-ink-400 line-through",
          )}
        >
          {event.title}
        </p>
        <p className="truncate text-[11px] text-ink-400">{subline}</p>
      </div>
      {event.done && (
        <span className="shrink-0 rounded-full bg-success-soft px-2 py-0.5 text-[10px] font-semibold text-success">
          Done
        </span>
      )}
    </div>
  );

  // Tasks deep-link to the board card; announcements/holidays open the feed.
  return (
    <li>
      <Link href={event.linkTo ?? "/announcements"} className="block">
        {body}
      </Link>
    </li>
  );
}

// ── Announce modal (Admin-tier) ──────────────────────────────────────────────
// Posts an announcement pinned to the chosen calendar date. "Holiday" maps to
// the Event category, which the create route additionally mirrors to Slack with
// the announcer's name. See app/api/announcements/create/route.ts.
function AnnounceModal({
  date,
  onClose,
}: {
  date: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [eventDate, setEventDate] = useState(date);
  const [isHoliday, setIsHoliday] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/announcements/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title,
          body,
          category: isHoliday ? "Event" : "General",
          eventDate,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not post. Check the fields and try again.");
        setSubmitting(false);
        return;
      }
      onClose();
      router.refresh();
    } catch {
      setError("Network error — please try again.");
      setSubmitting(false);
    }
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-40 bg-black/55 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="fixed inset-0 z-50 grid place-items-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.98 }}
          transition={{ type: "spring", stiffness: 320, damping: 30 }}
          className="glass-strong w-full max-w-md overflow-hidden p-0"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <div className="flex items-center gap-2.5">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-accent-soft text-accent-ink">
                <Megaphone className="h-[18px] w-[18px]" />
              </span>
              <div>
                <h2 className="font-display text-[15px] font-semibold text-ink">
                  New announcement
                </h2>
                <p className="text-xs text-ink-400">
                  Pinned to the calendar — and Slack for holidays.
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="hover-surface grid h-8 w-8 place-items-center rounded-lg text-ink-400 hover:text-ink"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <form onSubmit={submit} className="space-y-4 p-5">
            {/* Type toggle */}
            <div className="inline-flex rounded-full border border-line bg-surface-2 p-0.5 text-xs font-medium">
              {(
                [
                  ["holiday", "Holiday"],
                  ["announcement", "Announcement"],
                ] as const
              ).map(([v, label]) => {
                const on = (v === "holiday") === isHoliday;
                return (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setIsHoliday(v === "holiday")}
                    className={cn(
                      "rounded-full px-3.5 py-1.5 transition-colors",
                      on ? "bg-surface text-ink shadow-xs" : "text-ink-400 hover:text-ink",
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-ink-500">
                Title
              </span>
              <input
                required
                minLength={3}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={isHoliday ? "e.g. Eid Holiday" : "e.g. All-hands Friday"}
                className="input"
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-ink-500">
                  Date
                </span>
                <input
                  required
                  type="date"
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                  className="input"
                />
              </label>
            </div>

            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-ink-500">
                Details
              </span>
              <textarea
                required
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={3}
                placeholder={
                  isHoliday
                    ? "Office closed — enjoy the day off!"
                    : "What's happening…"
                }
                className="input resize-none"
              />
            </label>

            {isHoliday && (
              <p className="rounded-lg border border-warn/20 bg-warn-soft px-3 py-2 text-[11px] text-warn">
                Holidays are also posted to your team's Slack channel with your
                name.
              </p>
            )}

            {error && (
              <p className="rounded-lg border border-danger/20 bg-danger-soft px-3 py-2 text-xs text-danger-ink">
                {error}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="glass" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Megaphone className="h-4 w-4" />
                )}
                Post
              </Button>
            </div>
          </form>
        </motion.div>
      </div>
    </>
  );
}
