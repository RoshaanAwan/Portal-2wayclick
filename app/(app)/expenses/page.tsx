import { redirect } from "next/navigation";
import { Wallet } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { listExpenses, listExpenseCategories } from "@/lib/financeQueries";
import { ExpensesClient } from "./ExpensesClient";

// Expenses are an admin-tier surface (Super Admin / Admin). Anyone else who
// reaches this URL is bounced to the dashboard — the sidebar already hides it.
export default async function ExpensesPage() {
  const user = await getCurrentUser();
  if (!can.manageFinance(user?.role)) redirect("/dashboard");

  const [expenses, projects, categories] = await Promise.all([
    listExpenses(),
    db.project.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    listExpenseCategories(),
  ]);

  return (
    <div className="mx-auto max-w-[1200px]">
      <PageHeader
        icon={Wallet}
        title="Expenses"
        subtitle="Submit, review, and approve company expense claims by project."
      />
      <ExpensesClient
        expenses={expenses}
        projects={projects}
        categories={categories}
        currentUserId={user!.id}
      />
    </div>
  );
}
