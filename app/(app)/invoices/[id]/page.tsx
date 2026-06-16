import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getInvoice, invoiceShareUrl } from "@/lib/invoiceQueries";
import { InvoiceDetailClient } from "./InvoiceDetailClient";

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!can.manageInvoices(user?.role)) redirect("/dashboard");

  const { id } = await params;
  const invoice = await getInvoice(id);
  if (!invoice) notFound();

  // Resolve the absolute share URL here (server) so the client panel doesn't
  // need to know how links are built.
  const shareUrl = invoice.shareToken
    ? invoiceShareUrl(invoice.shareToken)
    : null;

  return <InvoiceDetailClient invoice={invoice} shareUrl={shareUrl} />;
}
