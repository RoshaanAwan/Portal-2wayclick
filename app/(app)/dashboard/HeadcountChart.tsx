"use client";

import { motion } from "framer-motion";
import { BarChart3 } from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  type TooltipProps,
} from "recharts";
import { GlassCard } from "@/components/ui/GlassCard";
import { useTheme } from "@/components/ThemeProvider";

interface DeptCount {
  department: string;
  count: number;
}

// Axis/grid colors per theme — recharts needs concrete values (it renders into
// SVG attributes, not Tailwind classes), so we pick them from the active theme.
const AXIS = {
  dark: { xTick: "#9a9aa5", yTick: "#74747f", axis: "#26262d" },
  light: { xTick: "#63636d", yTick: "#84848e", axis: "#e6e6eb" },
} as const;

function CustomTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0];
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2 text-xs shadow-pop">
      <p className="font-semibold text-ink">{p.payload.department}</p>
      <p className="mt-0.5 text-ink-500">
        <span className="font-medium text-accent">{p.value}</span>{" "}
        {p.value === 1 ? "person" : "people"}
      </p>
    </div>
  );
}

export function HeadcountChart({
  data,
  total,
}: {
  data: DeptCount[];
  total: number;
}) {
  const peak = data.length ? Math.max(...data.map((d) => d.count)) : 0;
  const { theme } = useTheme();
  const c = AXIS[theme];

  return (
    <GlassCard
      hover={false}
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.25, duration: 0.45 }}
    >
      <div className="mb-5 flex items-start justify-between">
        <div className="flex items-center gap-2.5">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-accent-soft">
            <BarChart3 className="h-4 w-4 text-accent" />
          </div>
          <div>
            <h2 className="font-display text-[15px] font-semibold tracking-tight text-ink">
              Headcount by department
            </h2>
            <p className="text-[11px] text-ink-400">
              {total} people across {data.length} teams
            </p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-ink-500">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          Peak {peak}
        </span>
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.45, duration: 0.6 }}
        className="h-56 w-full"
      >
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            margin={{ top: 8, right: 8, left: -24, bottom: 0 }}
          >
            <defs>
              <linearGradient id="headcountFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f5683f" stopOpacity={0.35} />
                <stop offset="60%" stopColor="#f5683f" stopOpacity={0.1} />
                <stop offset="100%" stopColor="#f5683f" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="department"
              tick={{ fill: c.xTick, fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: c.axis }}
              interval={0}
              tickFormatter={(v: string) => (v.length > 7 ? v.slice(0, 6) + "…" : v)}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fill: c.yTick, fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={32}
            />
            <Tooltip
              content={<CustomTooltip />}
              cursor={{ stroke: "rgba(245,104,63,0.4)", strokeWidth: 1 }}
            />
            <Area
              type="monotone"
              dataKey="count"
              stroke="#f5683f"
              strokeWidth={2.5}
              fill="url(#headcountFill)"
              dot={{ r: 3, fill: "#f5683f", strokeWidth: 0 }}
              activeDot={{
                r: 5,
                fill: "#f5683f",
                stroke: "rgba(245,104,63,0.3)",
                strokeWidth: 4,
              }}
              animationDuration={900}
              animationEasing="ease-out"
            />
          </AreaChart>
        </ResponsiveContainer>
      </motion.div>
    </GlassCard>
  );
}
