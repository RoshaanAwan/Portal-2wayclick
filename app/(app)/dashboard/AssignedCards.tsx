"use client";

import Link from "@/components/Link";
import { motion } from "framer-motion";
import { KanbanSquare, ArrowUpRight, CalendarClock } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Badge } from "@/components/ui/Badge";
import { IssueTypeIcon, IssueKey, StatusPill } from "../tasks/issueUi";
import { priorityVariant, priorityLabel, type TaskPriority } from "@/lib/constants";
import { formatDate } from "@/lib/utils";

export interface AssignedCardDTO {
  id: string;
  title: string;
  status: string;
  issueType: string;
  priority: string;
  issueKey: string;
  /** The project board this card lives on, if any. Null for the standalone
   *  /tasks board, where we deep-link to the task detail page instead. */
  projectId: string | null;
  dueDate: string | null;
}

function asPriority(v: string): TaskPriority {
  return v === "LOW" || v === "HIGH" ? v : "MEDIUM";
}

// Is the due date in the past (and not today)? Drives the overdue tint.
function isOverdue(iso: string): boolean {
  const due = new Date(iso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return due < today;
}

export function AssignedCards({
  cards,
  total,
}: {
  cards: AssignedCardDTO[];
  total: number;
}) {
  return (
    <GlassCard
      hover={false}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.12, duration: 0.4 }}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <KanbanSquare className="h-4 w-4 text-accent" />
          <h2 className="font-display text-[15px] font-semibold tracking-tight text-ink">
            My cards
          </h2>
          {total > 0 && (
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-ink-500">
              {total}
            </span>
          )}
        </div>
        {/* <Link
          href="/tasks"
          className="text-[11px] font-medium text-ink-400 transition hover:text-accent"
        >
          View board
        </Link> */}
      </div>

      {cards.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line-strong px-3 py-8 text-center text-xs text-ink-400">
          You have no open cards assigned to you. Nice and clear.
        </p>
      ) : (
        <div className="space-y-2">
          {cards.map((c, i) => {
            const overdue = c.dueDate != null && isOverdue(c.dueDate);
            return (
              <motion.div
                key={c.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 + i * 0.06, duration: 0.35 }}
              >
                <Link
                  href={c.projectId ? `/projects/${c.projectId}` : `/tasks/${c.id}`}
                  className="group block rounded-xl border border-line bg-surface-2 p-3 transition-all duration-200 hover:border-line-strong hover:bg-surface"
                >
                  <div className="mb-1.5 flex items-center gap-2">
                    <IssueTypeIcon type={c.issueType} />
                    <IssueKey keyText={c.issueKey} />
                    <StatusPill status={c.status} />
                    <Badge variant={priorityVariant[asPriority(c.priority)]}>
                      {priorityLabel[asPriority(c.priority)]}
                    </Badge>
                    <ArrowUpRight className="ml-auto h-3.5 w-3.5 shrink-0 text-ink-300 transition group-hover:text-accent" />
                  </div>
                  <p className="line-clamp-1 text-sm font-medium text-ink-700 transition group-hover:text-ink">
                    {c.title}
                  </p>
                  {c.dueDate && (
                    <p
                      className={`mt-1 flex items-center gap-1 text-[11px] ${
                        overdue ? "text-danger-ink" : "text-ink-400"
                      }`}
                    >
                      <CalendarClock className="h-3 w-3" />
                      {overdue ? "Overdue · " : "Due "}
                      {formatDate(c.dueDate)}
                    </p>
                  )}
                </Link>
              </motion.div>
            );
          })}
        </div>
      )}
    </GlassCard>
  );
}
