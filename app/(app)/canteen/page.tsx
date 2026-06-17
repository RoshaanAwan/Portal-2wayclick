import { redirect } from "next/navigation";
import { UtensilsCrossed } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { listCanteenExpenses } from "@/lib/financeQueries";
import { CanteenClient } from "./CanteenClient";

// Canteen expenses are an admin-tier surface (Super Admin / Admin). A separate
// module from general expenses, with meal-specific fields and a required slip.
export default async function CanteenPage() {
  const user = await getCurrentUser();
  if (!can.manageFinance(user?.role)) redirect("/dashboard");

  const expenses = await listCanteenExpenses();

  return (
    <div className="mx-auto max-w-[1200px]">
      <PageHeader
        icon={UtensilsCrossed}
        title="Canteen Expenses"
        subtitle="Log meal & canteen spend with a receipt, then review and approve."
      />
      <CanteenClient expenses={expenses} currentUserId={user!.id} />
    </div>
  );
}
