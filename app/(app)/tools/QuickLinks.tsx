"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  Users,
  FileText,
  HeartPulse,
  LifeBuoy,
  Gift,
  Palette,
  ChevronRight,
  ArrowUpRight,
  type LucideIcon,
} from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";

interface QuickLink {
  label: string;
  hint: string;
  href: string;
  icon: LucideIcon;
  tint: string;
  external?: boolean;
}

export function QuickLinks({
  peopleCount,
  docCount,
  canSeeDirectory = true,
}: {
  peopleCount: number;
  docCount: number;
  /** Directory is admin-tier only — omits the directory link when false. */
  canSeeDirectory?: boolean;
}) {
  const LINKS: QuickLink[] = [
    // Directory link only for admin tier; everyone else skips it.
    ...(canSeeDirectory
      ? [
          {
            label: "Org chart",
            hint: `${peopleCount} people · Directory`,
            href: "/directory",
            icon: Users,
            tint: "text-accent",
          } as QuickLink,
        ]
      : []),
    {
      label: "Brand assets",
      hint: `${docCount} files · Documents`,
      href: "/documents",
      icon: Palette,
      tint: "text-accent",
    },
    {
      label: "HR portal",
      hint: "Payroll, PTO & policies",
      href: "https://workday.com",
      icon: HeartPulse,
      tint: "text-success",
      external: true,
    },
    {
      label: "IT helpdesk",
      hint: "Open a support ticket",
      href: "https://servicedesk.atlassian.com",
      icon: LifeBuoy,
      tint: "text-info",
      external: true,
    },
    {
      label: "Benefits",
      hint: "Health, dental & equity",
      href: "https://benefits.com",
      icon: Gift,
      tint: "text-warn",
      external: true,
    },
    {
      label: "Documents",
      hint: "Handbooks & guides",
      href: "/documents",
      icon: FileText,
      tint: "text-accent",
    },
  ];

  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-ink-400">
        Quick links
      </h2>

      <GlassCard hover={false} className="p-2.5">
        <ul className="divide-y divide-line">
          {LINKS.map((link, i) => {
            const Icon = link.icon;
            const inner = (
              <motion.div
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.35, delay: i * 0.04 }}
                className="group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-surface-2"
              >
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line bg-surface-2">
                  <Icon className={`h-[18px] w-[18px] ${link.tint}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink">{link.label}</p>
                  <p className="truncate text-xs text-ink-400">{link.hint}</p>
                </div>
                {link.external ? (
                  <ArrowUpRight className="h-4 w-4 shrink-0 text-ink-300 transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-ink-500" />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0 text-ink-300 transition-transform group-hover:translate-x-0.5 group-hover:text-ink-500" />
                )}
              </motion.div>
            );

            return (
              <li key={link.label}>
                {link.external ? (
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block"
                  >
                    {inner}
                  </a>
                ) : (
                  <Link href={link.href} className="block">
                    {inner}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </GlassCard>
    </section>
  );
}
