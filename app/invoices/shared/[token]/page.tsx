import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CheckCircle2, XCircle } from "lucide-react";
import { getInvoiceByToken } from "@/lib/invoiceQueries";
import { isStripeConfigured } from "@/lib/stripe";
import { formatMoney } from "@/lib/invoices";
import { InvoiceDocument } from "@/app/(app)/invoices/InvoiceDocument";
import { PrintButton } from "./PrintButton";
import { PayButton } from "./PayButton";

// Public, login-less client invoice view. Lives OUTSIDE the (app) route group,
// so it skips the auth layout (no session, no sidebar) — the share token is the
// only gate. Never indexed; the link is meant to be shared privately.
export const metadata: Metadata = {
  title: "Invoice — 2WayClick",
  robots: { index: false, follow: false },
};

export default async function SharedInvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ paid?: string; canceled?: string }>;
}) {
  const { token } = await params;
  const { paid, canceled } = await searchParams;
  const invoice = await getInvoiceByToken(token);

  // Unknown or revoked token → 404. We don't confirm an invoice ever existed.
  if (!invoice) notFound();

  const isPaid = invoice.status === "PAID";
  const isCancelled = invoice.status === "CANCELLED";
  // Offer online payment only when Stripe is wired up, there's a balance, and
  // the invoice is in a payable state.
  const canPay =
    isStripeConfigured() && !isPaid && !isCancelled && invoice.totalCents > 0;

  return (
    <div className="min-h-screen bg-zinc-100 px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-[900px]">
        {/* Return-from-Stripe banners. The webhook is the real source of truth
            for PAID; if the redirect lands before the webhook, the invoice may
            still read SENT for a beat — the success banner reassures meanwhile. */}
        {(paid || isPaid) && (
          <div className="no-print mb-5 flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
            <span>
              Payment received — thank you. This invoice is marked as paid.
            </span>
          </div>
        )}
        {canceled && !isPaid && (
          <div className="no-print mb-5 flex items-center gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <XCircle className="h-5 w-5 shrink-0 text-amber-600" />
            <span>Payment was canceled. You can try again below.</span>
          </div>
        )}

        {/* Toolbar — hidden when printing. */}
        <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-medium text-zinc-500">
            Invoice {invoice.number}
          </p>
          <div className="flex items-center gap-2">
            <PrintButton />
            {canPay && (
              <PayButton
                token={token}
                amountLabel={formatMoney(invoice.totalCents, invoice.currency)}
              />
            )}
          </div>
        </div>

        <div className="print-area">
          <InvoiceDocument invoice={invoice} />
        </div>
      </div>
    </div>
  );
}
