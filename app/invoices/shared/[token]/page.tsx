import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getInvoiceByToken } from "@/lib/invoiceQueries";
import { InvoiceDocument } from "@/app/(app)/invoices/InvoiceDocument";
import { PrintButton } from "./PrintButton";

// Public, login-less client invoice view. Lives OUTSIDE the (app) route group,
// so it skips the auth layout (no session, no sidebar) — the share token is the
// only gate. Never indexed; the link is meant to be shared privately.
export const metadata: Metadata = {
  title: "Invoice — 2WayClick",
  robots: { index: false, follow: false },
};

export default async function SharedInvoicePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const invoice = await getInvoiceByToken(token);

  // Unknown or revoked token → 404. We don't confirm an invoice ever existed.
  if (!invoice) notFound();

  return (
    <div className="min-h-screen bg-zinc-100 px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-[900px]">
        {/* Toolbar — hidden when printing. */}
        <div className="no-print mb-5 flex items-center justify-between">
          <p className="text-sm font-medium text-zinc-500">
            Invoice {invoice.number}
          </p>
          <PrintButton />
        </div>

        <div className="print-area">
          <InvoiceDocument invoice={invoice} />
        </div>
      </div>
    </div>
  );
}
