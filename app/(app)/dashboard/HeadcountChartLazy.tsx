"use client";

import dynamic from "next/dynamic";

// recharts (~45KB gz) + framer-motion power this chart, and it's below the fold
// on the dashboard. Lazy-load it (ssr:false) so the landing page paints and
// becomes interactive without waiting on the charting bundle; a same-height
// skeleton holds the space to avoid layout shift. Must be a client component —
// ssr:false dynamic imports aren't allowed in server components.
const HeadcountChart = dynamic(
  () => import("./HeadcountChart").then((m) => m.HeadcountChart),
  {
    ssr: false,
    loading: () => (
      <div className="h-72 animate-pulse rounded-2xl border border-line bg-surface-2" />
    ),
  },
);

interface DeptCount {
  department: string;
  count: number;
}

export function HeadcountChartLazy(props: { data: DeptCount[]; total: number }) {
  return <HeadcountChart {...props} />;
}
