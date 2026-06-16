"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  CalendarClock,
  GripVertical,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { cn, formatDate } from "@/lib/utils";
import { type TaskPriority } from "@/lib/constants";
import type { TaskDTO } from "./BoardClient";

function dueState(iso: string | null): "overdue" | "soon" | "later" | null {
  if (!iso) return null;
  const due = new Date(iso);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((due.getTime() - startOfToday.getTime()) / 86400000);
  if (days < 0) return "overdue";
  if (days <= 2) return "soon";
  return "later";
}

// Priority → the color of the left stripe. Read at a glance, no badge needed.
const STRIPE: Record<TaskPriority, string> = {
  HIGH: "bg-danger",
  MEDIUM: "bg-warn",
  LOW: "bg-line-strong",
};

export function TaskCard({
  task,
  currentUserId,
  canManage,
  dragging,
  showDropHint,
  onOpen,
  onEdit,
  onDelete,
  onDragStart,
  onDragEnd,
  onDragOverCard,
  onDropCard,
}: {
  task: TaskDTO;
  currentUserId: string | null;
  canManage: boolean;
  dragging: boolean;
  showDropHint: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOverCard: (e: React.DragEvent) => void;
  onDropCard: (e: React.DragEvent) => void;
}) {
  const priority = (task.priority as TaskPriority) ?? "MEDIUM";
  const due = dueState(task.dueDate);
  const mine = !!currentUserId && task.assignees.some((a) => a.id === currentUserId);
  const hasFooter = task.assignees.length > 0 || task.comments.length > 0;

  // Card overflow menu (Edit / Delete). Closes on outside click or Escape.
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    function onDocClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  return (
    <div className="relative">
      {/* Drop indicator above this card */}
      {showDropHint && (
        <div className="absolute -top-[7px] left-0 right-0 z-10 h-0.5 rounded-full bg-accent" />
      )}

      <motion.div
        layout
        draggable
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpen();
          }
        }}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragOver={onDragOverCard}
        onDrop={onDropCard}
        className={cn(
          "group relative cursor-pointer overflow-hidden rounded-xl border bg-surface pl-3.5 pr-3 py-2.5 shadow-xs outline-none transition-all focus-visible:shadow-focus-ring",
          // Cards assigned to me get a quiet accent ring so "mine" pops.
          mine
            ? "border-accent/35 ring-1 ring-inset ring-accent/15"
            : "border-line hover:border-line-strong",
          dragging && "opacity-40",
        )}
      >
        {/* Left priority stripe */}
        <span
          className={cn("absolute inset-y-0 left-0 w-1.5", STRIPE[priority])}
          aria-label={`${priority.toLowerCase()} priority`}
        />

        {/* Top-right controls — drag handle + overflow menu, shown on hover */}
        <div className="absolute right-1 top-1.5 flex items-center gap-0.5">
          <span
            className="cursor-grab text-ink-400/40 opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing"
            aria-hidden
          >
            <GripVertical className="h-4 w-4" />
          </span>

          {canManage && (
            <div ref={menuRef} className="relative">
              <button
                type="button"
                aria-label="Card actions"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                draggable={false}
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen((v) => !v);
                }}
                className={cn(
                  "grid h-6 w-6 place-items-center rounded-md text-ink-400 transition-all hover:bg-surface-2 hover:text-ink",
                  menuOpen
                    ? "opacity-100"
                    : "opacity-0 group-hover:opacity-100",
                )}
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>

              {menuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-7 z-20 w-32 overflow-hidden rounded-lg border border-line bg-surface py-1 shadow-lg"
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpen(false);
                      onEdit();
                    }}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs font-medium text-ink-700 hover:bg-surface-2"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpen(false);
                      onDelete();
                    }}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs font-medium text-danger-ink hover:bg-danger-soft"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Title + quiet due pill */}
        <div className="flex items-start gap-2 pr-9">
          <p className="flex-1 text-sm font-medium leading-snug text-ink">
            {task.title}
          </p>
        </div>

        {due && (
          <div
            className={cn(
              "mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium",
              due === "overdue"
                ? "text-danger-ink"
                : due === "soon"
                  ? "text-warn-ink"
                  : "text-ink-400",
            )}
          >
            <CalendarClock className="h-3 w-3" />
            {formatDate(task.dueDate!)}
          </div>
        )}

        {/* Footer: assignees + comment count (only when there's something) */}
        {hasFooter && (
          <div className="mt-2 flex items-center justify-between">
            <div className="flex items-center -space-x-1.5">
              {task.assignees.slice(0, 4).map((a) => (
                <Avatar
                  key={a.id}
                  name={a.name}
                  src={a.avatarUrl}
                  size="xs"
                  className={cn(
                    "ring-2 ring-surface",
                    a.id === currentUserId && "ring-accent/50",
                  )}
                />
              ))}
              {task.assignees.length > 4 && (
                <span className="grid h-6 w-6 place-items-center rounded-full bg-surface-2 text-[10px] font-semibold text-ink-500 ring-2 ring-surface">
                  +{task.assignees.length - 4}
                </span>
              )}
              {mine && (
                <span className="ml-3 self-center rounded-full bg-accent-soft px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-accent-ink">
                  You
                </span>
              )}
            </div>

            {task.comments.length > 0 && (
              <span className="flex items-center gap-1 text-[11px] text-ink-400">
                <MessageSquare className="h-3.5 w-3.5" />
                {task.comments.length}
              </span>
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
}
