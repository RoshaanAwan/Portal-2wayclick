"use client";

import { motion, type Variants } from "framer-motion";
import {
  Hexagon,
  LayoutDashboard,
  Megaphone,
  KanbanSquare,
  ShieldCheck,
} from "lucide-react";

const HIGHLIGHTS = [
  { icon: LayoutDashboard, title: "One workspace", desc: "Dashboard, people, and projects in a single hub." },
  { icon: KanbanSquare, title: "Get work done", desc: "Trello-style boards for every team and project." },
  { icon: Megaphone, title: "Stay in the loop", desc: "Company announcements, time-off, and documents." },
  { icon: ShieldCheck, title: "Role-based access", desc: "Super Admin controls, full audit trail." },
];

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.15 } },
};
const item: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } },
};

export function LoginHero() {
  return (
    <div className="relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-16">
      {/* Warm accent wash + soft grid, layered over the neumorphic canvas. */}
      <div className="pointer-events-none absolute inset-0 -z-10 bg-accent-grad opacity-[0.14]" />
      <div className="pointer-events-none absolute inset-0 -z-10 bg-grid [mask-image:linear-gradient(to_bottom,black,transparent_80%)] opacity-40" />
      <div className="pointer-events-none absolute -left-24 top-1/3 -z-10 h-80 w-80 animate-breathe rounded-full bg-accent/20 blur-3xl" />

      {/* Brand mark */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex items-center gap-3"
      >
        <div className="relative grid h-11 w-11 place-items-center rounded-2xl bg-accent-grad shadow-accent-glow">
          <Hexagon className="h-6 w-6 text-white" strokeWidth={2.4} />
        </div>
        <span className="font-display text-xl font-semibold tracking-tight text-ink">
          2WayClick
        </span>
      </motion.div>

      {/* Headline + highlights */}
      <motion.div variants={container} initial="hidden" animate="show" className="max-w-md">
        <motion.h2
          variants={item}
          className="font-display text-4xl font-semibold leading-tight tracking-tight text-ink xl:text-[2.75rem]"
        >
          Your company,
          <br />
          <span className="text-accent">all in one place.</span>
        </motion.h2>
        <motion.p variants={item} className="mt-4 text-[15px] leading-relaxed text-ink-500">
          The immersive internal hub for your whole team — people, projects,
          announcements, and tools, beautifully unified.
        </motion.p>

        <div className="mt-9 space-y-3.5">
          {HIGHLIGHTS.map((h) => (
            <motion.div key={h.title} variants={item} className="flex items-start gap-3.5">
              <span className="nm-raised grid h-10 w-10 shrink-0 place-items-center rounded-xl text-accent">
                <h.icon className="h-[18px] w-[18px]" />
              </span>
              <div>
                <p className="text-sm font-semibold text-ink">{h.title}</p>
                <p className="mt-0.5 text-[13px] leading-snug text-ink-400">
                  {h.desc}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* Footer line */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
        className="text-xs text-ink-400"
      >
        © {new Date().getFullYear()} 2WayClick — your company&apos;s internal hub.
      </motion.p>
    </div>
  );
}
