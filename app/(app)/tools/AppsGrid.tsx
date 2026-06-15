"use client";

import { motion } from "framer-motion";
import {
  MessageSquare,
  Github,
  Trello,
  Figma,
  NotebookPen,
  BookText,
  HardDrive,
  BarChart3,
  Receipt,
  Siren,
  ArrowUpRight,
  type LucideIcon,
} from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";

interface AppTile {
  name: string;
  description: string;
  href: string;
  icon: LucideIcon;
  /** Tailwind gradient stops for the icon tile + matching glow rgba. */
  from: string;
  to: string;
  glow: string;
}

const APPS: AppTile[] = [
  {
    name: "Slack",
    description: "Team chat & channels",
    href: "https://slack.com",
    icon: MessageSquare,
    from: "from-[#4A154B]",
    to: "to-[#E01E5A]",
    glow: "rgba(224,30,90,0.45)",
  },
  {
    name: "GitHub",
    description: "Code, PRs & reviews",
    href: "https://github.com",
    icon: Github,
    from: "from-[#24292e]",
    to: "to-[#586069]",
    glow: "rgba(110,118,129,0.45)",
  },
  {
    name: "Jira",
    description: "Sprints & issue tracking",
    href: "https://www.atlassian.com/software/jira",
    icon: Trello,
    from: "from-[#0052CC]",
    to: "to-[#2684FF]",
    glow: "rgba(38,132,255,0.5)",
  },
  {
    name: "Figma",
    description: "Design & prototyping",
    href: "https://figma.com",
    icon: Figma,
    from: "from-[#F24E1E]",
    to: "to-[#A259FF]",
    glow: "rgba(162,89,255,0.5)",
  },
  {
    name: "Notion",
    description: "Docs, wikis & notes",
    href: "https://notion.so",
    icon: NotebookPen,
    from: "from-[#2F2F2F]",
    to: "to-[#6B6B6B]",
    glow: "rgba(120,120,120,0.45)",
  },
  {
    name: "Confluence",
    description: "Team knowledge base",
    href: "https://www.atlassian.com/software/confluence",
    icon: BookText,
    from: "from-[#172B4D]",
    to: "to-[#0052CC]",
    glow: "rgba(0,82,204,0.5)",
  },
  {
    name: "Google Drive",
    description: "Files & shared folders",
    href: "https://drive.google.com",
    icon: HardDrive,
    from: "from-[#1FA463]",
    to: "to-[#FFCF63]",
    glow: "rgba(31,164,99,0.45)",
  },
  {
    name: "Analytics",
    description: "Product & growth metrics",
    href: "https://analytics.google.com",
    icon: BarChart3,
    from: "from-[#E8710A]",
    to: "to-[#F9AB00]",
    glow: "rgba(249,171,0,0.5)",
  },
  {
    name: "Expensify",
    description: "Receipts & reimbursements",
    href: "https://expensify.com",
    icon: Receipt,
    from: "from-[#0B1B34]",
    to: "to-[#03D47C]",
    glow: "rgba(3,212,124,0.45)",
  },
  {
    name: "PagerDuty",
    description: "On-call & incidents",
    href: "https://pagerduty.com",
    icon: Siren,
    from: "from-[#06AC38]",
    to: "to-[#25D366]",
    glow: "rgba(6,172,56,0.5)",
  },
];

export function AppsGrid() {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-400">
          Apps
        </h2>
        <span className="text-xs text-ink-300">{APPS.length} connected</span>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {APPS.map((app, i) => {
          const Icon = app.icon;
          return (
            <motion.a
              key={app.name}
              href={app.href}
              target="_blank"
              rel="noopener noreferrer"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: i * 0.05, ease: "easeOut" }}
              className="group block"
            >
              <GlassCard
                hover
                className="relative flex h-full items-center gap-3.5 overflow-hidden p-4"
              >
                <div
                  className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br ${app.from} ${app.to}`}
                >
                  <Icon className="h-[22px] w-[22px] text-white" />
                </div>

                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1 text-sm font-semibold text-ink">
                    {app.name}
                  </p>
                  <p className="truncate text-xs text-ink-400">
                    {app.description}
                  </p>
                </div>

                <ArrowUpRight className="h-4 w-4 shrink-0 text-ink-300 transition-all duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-accent" />
              </GlassCard>
            </motion.a>
          );
        })}
      </div>
    </section>
  );
}
