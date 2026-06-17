import { redirect } from "next/navigation";
import { Banknote } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { listProjectSalaries } from "@/lib/financeQueries";
import { SalariesClient } from "./SalariesClient";

// Per-project salaries — an admin-tier surface (Super Admin / Admin). One
// employee may have a salary on several projects; the page rolls up each
// project's monthly payroll cost from its active salaries.
export default async function SalariesPage() {
  const user = await getCurrentUser();
  if (!can.manageFinance(user?.role)) redirect("/dashboard");

  const [salaries, projects, employees] = await Promise.all([
    listProjectSalaries(),
    db.project.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.user.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, title: true },
    }),
  ]);

  return (
    <div className="mx-auto max-w-[1200px]">
      <PageHeader
        icon={Banknote}
        title="Project Salaries"
        subtitle="Set each employee's monthly salary per project and track payroll cost."
      />
      <SalariesClient
        salaries={salaries}
        projects={projects}
        employees={employees}
      />
    </div>
  );
}
