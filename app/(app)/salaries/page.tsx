import { redirect } from "next/navigation";
import { Banknote } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { listProjectSalaries } from "@/lib/financeQueries";
import { SalarySheet } from "./SalarySheet";

// Salaries — an admin-tier surface (Super Admin / Admin). A simple spreadsheet:
// one row per (project, employee) with a monthly salary amount. Add rows by
// picking a project + employee and typing a salary.
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
    <div className="mx-auto max-w-[1100px]">
      <PageHeader
        icon={Banknote}
        title="Salaries"
        subtitle="Add a project, an employee, and their monthly salary — one row each."
      />
      <SalarySheet
        salaries={salaries}
        projects={projects}
        employees={employees}
      />
    </div>
  );
}
