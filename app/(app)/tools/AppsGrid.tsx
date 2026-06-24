"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowUpRight, ArrowRight, Plug, Settings } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import type { IntegrationState } from "@/lib/integrations";
import { integrationIcon } from "./integrationIcons";

const MotionLink = motion(Link);

export function AppsGrid({
  integrations,
  canManage,
}: {
  /** Catalog merged with this tenant's state. Only enabled ones are shown. */
  integrations: IntegrationState[];
  /** Whether the viewer (Admin/Owner) can reach the management page. */
  canManage: boolean;
}) {
  const enabled = integrations.filter((i) => i.enabled);

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-400">
          Apps
        </h2>
        <div className="flex items-center gap-3">
          <span className="text-xs text-ink-300">
            {enabled.length} connected
          </span>
          {canManage && (
            <Link
              href="/admin/integrations"
              className="inline-flex items-center gap-1 text-xs font-medium text-ink-400 transition-colors hover:text-accent"
            >
              <Settings className="h-3.5 w-3.5" /> Manage
            </Link>
          )}
        </div>
      </div>

      {enabled.length === 0 ? (
        <GlassCard hover={false} className="flex flex-col items-center gap-2 py-8 text-center">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-surface-2">
            <Plug className="h-5 w-5 text-ink-300" />
          </div>
          <p className="text-sm font-medium text-ink">No apps connected yet</p>
          <p className="max-w-xs text-xs text-ink-400">
            {canManage
              ? "Turn on the tools your team uses from the integrations settings."
              : "An admin hasn't connected any third-party tools yet."}
          </p>
          {canManage && (
            <Link
              href="/admin/integrations"
              className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
            >
              <Settings className="h-3.5 w-3.5" /> Connect apps
            </Link>
          )}
        </GlassCard>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {enabled.map((app, i) => {
            const Icon = integrationIcon(app.icon);
            // Internal dashboard tiles (e.g. GitHub) navigate in-app via Link;
            // external tiles open the provider in a new tab.
            const anim = {
              initial: { opacity: 0, y: 14 },
              animate: { opacity: 1, y: 0 },
              transition: { duration: 0.4, delay: i * 0.05, ease: "easeOut" },
              className: "group block",
            } as const;

            const body = (
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

                {app.internal ? (
                  <ArrowRight className="h-4 w-4 shrink-0 text-ink-300 transition-all duration-300 group-hover:translate-x-0.5 group-hover:text-accent" />
                ) : (
                  <ArrowUpRight className="h-4 w-4 shrink-0 text-ink-300 transition-all duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-accent" />
                )}
              </GlassCard>
            );

            return app.internal ? (
              <MotionLink key={app.provider} href={app.linkTo} {...anim}>
                {body}
              </MotionLink>
            ) : (
              <motion.a
                key={app.provider}
                href={app.linkTo}
                target="_blank"
                rel="noopener noreferrer"
                {...anim}
              >
                {body}
              </motion.a>
            );
          })}
        </div>
      )}
    </section>
  );
}
