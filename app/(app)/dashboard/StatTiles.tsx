"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  Users,
  Megaphone,
  CalendarClock,
  FileText,
  ArrowUpRight,
  TrendingUp,
  type LucideProps,
} from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { CountUp } from "@/components/ui/CountUp";
import { Reveal, RevealItem } from "@/components/ui/Reveal";

type Accent = "accent" | "info" | "success" | "warn";

// Calm, tinted chips — one hue per metric, drawn from the semantic palette.
const accentStyles: Record<
  Accent,
  { chip: string; icon: string; bar: string; glow: string }
> = {
  accent: { chip: "bg-accent-soft", icon: "text-accent", bar: "bg-accent", glow: "bg-accent/25" },
  info: { chip: "bg-info-soft", icon: "text-info", bar: "bg-info", glow: "bg-info/25" },
  success: { chip: "bg-success-soft", icon: "text-success", bar: "bg-success", glow: "bg-success/25" },
  warn: { chip: "bg-warn-soft", icon: "text-warn", bar: "bg-warn", glow: "bg-warn/25" },
};

interface Tile {
  label: string;
  value: number;
  href: string;
  accent: Accent;
  Icon: React.ComponentType<LucideProps>;
  hint: string;
  delta?: string;
}

export function StatTiles({
  stats,
}: {
  stats: {
    userCount: number;
    openAnnouncements: number;
    pendingLeave: number;
    documentCount: number;
  };
}) {
  const tiles: Tile[] = [
    {
      label: "Team members",
      value: stats.userCount,
      href: "/directory",
      accent: "accent",
      Icon: Users,
      hint: "Across the company",
      delta: "+12%",
    },
    {
      label: "Announcements",
      value: stats.openAnnouncements,
      href: "/announcements",
      accent: "info",
      Icon: Megaphone,
      hint: "Live and pinned",
      delta: "+5%",
    },
    {
      label: "Pending time-off",
      value: stats.pendingLeave,
      href: "/requests",
      accent: "warn",
      Icon: CalendarClock,
      hint: "Awaiting review",
    },
    {
      label: "Documents",
      value: stats.documentCount,
      href: "/documents",
      accent: "success",
      Icon: FileText,
      hint: "In the library",
      delta: "+8%",
    },
  ];

  return (
    <Reveal gap={0.07} className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {tiles.map((tile) => {
        const s = accentStyles[tile.accent];
        return (
          <RevealItem variant="pop" key={tile.label}>
            <Link href={tile.href} className="group block h-full">
              <GlassCard className="relative h-full">
                {/* soft hue glow that brightens on hover */}
                <div
                  className={`pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full blur-3xl transition-opacity duration-300 ${s.glow} opacity-40 group-hover:opacity-80`}
                />

                <div className="relative flex items-start justify-between">
                  <div className={`grid h-11 w-11 place-items-center rounded-xl ${s.chip}`}>
                    <tile.Icon className={`h-5 w-5 ${s.icon}`} />
                  </div>
                  <ArrowUpRight className="h-4 w-4 text-ink-300 transition group-hover:translate-x-0.5 group-hover:text-ink-500" />
                </div>

                <div className="relative mt-4">
                  <div className="flex items-end gap-2">
                    <p className="font-display text-[2rem] font-semibold leading-none tracking-tight text-ink">
                      <CountUp value={tile.value} />
                    </p>
                    {tile.delta && (
                      <span className="chip-up mb-1">
                        <TrendingUp className="h-3 w-3" />
                        {tile.delta}
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-sm font-medium text-ink-700">
                    {tile.label}
                  </p>
                  <p className="mt-0.5 text-[11px] text-ink-400">{tile.hint}</p>
                </div>

                {/* accent underline that grows in */}
                <motion.div
                  initial={{ scaleX: 0 }}
                  whileInView={{ scaleX: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.3, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                  className={`relative mt-4 h-1 origin-left rounded-full ${s.bar} opacity-80`}
                />
              </GlassCard>
            </Link>
          </RevealItem>
        );
      })}
    </Reveal>
  );
}
