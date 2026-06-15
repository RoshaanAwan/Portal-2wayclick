"use client";

import { motion } from "framer-motion";

export function PageHeaderMotion({
  title,
  subtitle,
  icon,
  action,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="mb-6 flex items-end justify-between gap-4"
    >
      <div className="flex items-center gap-3.5">
        {icon && (
          <div className="grid h-11 w-11 place-items-center rounded-xl border border-line bg-accent-soft shadow-xs">
            {icon}
          </div>
        )}
        <div>
          <h1 className="font-display text-[1.8rem] font-semibold tracking-tight text-ink">
            {title}
          </h1>
          {subtitle && <p className="mt-0.5 text-sm text-ink-500">{subtitle}</p>}
        </div>
      </div>
      {action}
    </motion.div>
  );
}
