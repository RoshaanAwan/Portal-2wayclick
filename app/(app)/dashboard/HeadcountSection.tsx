import { db } from "@/lib/db";
import { HeadcountChartLazy } from "./HeadcountChartLazy";

export async function HeadcountSection() {
  const [deptGroups, userCount] = await Promise.all([
    db.user.groupBy({
      by: ["department"],
      _count: { _all: true },
    }),
    db.user.count(),
  ]);

  const headcount = deptGroups
    .map((g) => ({ department: g.department, count: g._count._all }))
    .sort((a, b) => b.count - a.count);

  return <HeadcountChartLazy data={headcount} total={userCount} />;
}
