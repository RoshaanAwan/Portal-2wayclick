"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  Pin,
  ArrowUpRight,
  CalendarPlus,
  Users,
  FileText,
  Zap,
} from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";

type BadgeVariant = "accent" | "cyan" | "pink" | "emerald";

const coverToBadge: Record<string, BadgeVariant> = {
  accent: "accent",
  cyan: "cyan",
  pink: "pink",
  emerald: "emerald",
};

// Thin colored top-rule per announcement cover, on the calm palette.
const coverToRule: Record<string, string> = {
  accent: "bg-accent",
  cyan: "bg-info",
  pink: "bg-accent",
  emerald: "bg-success",
};

interface PinnedCard {
  id: string;
  title: string;
  body: string;
  category: string;
  coverColor: string;
  createdAt: string;
  authorName: string;
}

interface TeamMember {
  id: string;
  name: string;
  title: string;
  avatarUrl?: string | null;
}

const QUICK_ACTIONS = [
  { href: "/requests", label: "Request time off", Icon: CalendarPlus, accent: "text-accent" },
  { href: "/directory", label: "Browse directory", Icon: Users, accent: "text-info" },
  { href: "/documents", label: "Open documents", Icon: FileText, accent: "text-success" },
];

export function RightRail({
  pinned,
  team,
  department,
}: {
  pinned: PinnedCard[];
  team: TeamMember[];
  department: string;
}) {
  return (
    <div className="space-y-6">
      {/* Pinned */}
      <GlassCard
        hover={false}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.4 }}
      >
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Pin className="h-4 w-4 text-accent" />
            <h2 className="font-display text-[15px] font-semibold tracking-tight text-ink">Pinned</h2>
          </div>
          <Link
            href="/announcements"
            className="text-[11px] font-medium text-ink-400 transition hover:text-accent"
          >
            View all
          </Link>
        </div>

        <div className="space-y-2.5">
          {pinned.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line-strong px-3 py-6 text-center text-xs text-ink-400">
              No pinned announcements
            </p>
          ) : (
            pinned.map((p, i) => (
              <motion.div
                key={p.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 + i * 0.08, duration: 0.35 }}
              >
                <Link href="/announcements" className="group block">
                  <div className="relative overflow-hidden rounded-xl border border-line bg-surface-2 p-3 transition-all duration-200 hover:border-line-strong hover:bg-surface hover:shadow-xs">
                    <div
                      className={`pointer-events-none absolute inset-y-0 left-0 w-[3px] ${
                        coverToRule[p.coverColor] ?? coverToRule.accent
                      }`}
                    />
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <Badge variant={coverToBadge[p.coverColor] ?? "accent"}>
                        {p.category}
                      </Badge>
                      <ArrowUpRight className="h-3.5 w-3.5 text-ink-300 transition group-hover:text-accent" />
                    </div>
                    <p className="line-clamp-1 text-sm font-semibold text-ink">
                      {p.title}
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-ink-500">
                      {p.body}
                    </p>
                    <p className="mt-1.5 text-[10px] text-ink-400">
                      {p.authorName}
                    </p>
                  </div>
                </Link>
              </motion.div>
            ))
          )}
        </div>
      </GlassCard>

      {/* Your team */}
      <GlassCard
        hover={false}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.28, duration: 0.4 }}
      >
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-info" />
            <h2 className="font-display text-[15px] font-semibold tracking-tight text-ink">Your team</h2>
          </div>
          <span className="text-[11px] font-medium text-ink-400">
            {department}
          </span>
        </div>

        {team.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line-strong px-3 py-5 text-center text-xs text-ink-400">
            You&apos;re the only one in {department} so far.
          </p>
        ) : (
          <div className="space-y-1">
            {team.map((m, i) => (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.36 + i * 0.05, duration: 0.3 }}
              >
                <Link
                  href="/directory"
                  className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 transition hover:bg-surface-2"
                >
                  <Avatar name={m.name} src={m.avatarUrl} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink-700">
                      {m.name}
                    </p>
                    <p className="truncate text-[11px] text-ink-400">
                      {m.title}
                    </p>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        )}
      </GlassCard>

      {/* Quick actions */}
      <GlassCard
        hover={false}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.36, duration: 0.4 }}
      >
        <div className="mb-3 flex items-center gap-2">
          <Zap className="h-4 w-4 text-accent" />
          <h2 className="font-display text-[15px] font-semibold tracking-tight text-ink">Quick actions</h2>
        </div>
        <div className="space-y-2">
          {QUICK_ACTIONS.map((a, i) => (
            <motion.div
              key={a.href}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.44 + i * 0.06, duration: 0.3 }}
            >
              <Link
                href={a.href}
                className="group flex items-center gap-3 rounded-xl border border-line bg-surface-2 px-3 py-2.5 transition-all duration-200 hover:border-accent/30 hover:bg-accent-soft"
              >
                <a.Icon className={`h-[18px] w-[18px] ${a.accent}`} />
                <span className="flex-1 text-sm font-medium text-ink-700 transition group-hover:text-ink">
                  {a.label}
                </span>
                <ArrowUpRight className="h-4 w-4 text-ink-300 transition group-hover:translate-x-0.5 group-hover:text-accent" />
              </Link>
            </motion.div>
          ))}
        </div>
      </GlassCard>
    </div>
  );
}
