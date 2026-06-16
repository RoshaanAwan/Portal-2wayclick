import { redirect } from "next/navigation";
import { Receipt } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { listInvoices } from "@/lib/invoiceQueries";
import { InvoicesClient } from "./InvoicesClient";

// Invoices are an admin-tier surface (Super Admin / Admin). Anyone else who
// reaches this URL is bounced to the dashboard — the sidebar already hides it.
export default async function InvoicesPage() {
  const user = await getCurrentUser();
  if (!can.manageInvoices(user?.role)) redirect("/dashboard");

  const invoices = await listInvoices();

  return (
    <div className="mx-auto max-w-[1200px]">
      <PageHeader
        icon={Receipt}
        title="Invoices"
        subtitle="Raise invoices for your clients, then download or share them."
      />
      <InvoicesClient invoices={invoices} />
    </div>
  );
}
